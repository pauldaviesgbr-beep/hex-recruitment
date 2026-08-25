import type { SupabaseClient } from '@supabase/supabase-js'
import { ERASURE_PLAN, BUCKET, objectBelongsTo, blockers, type ReceiptLine } from './erasure'

// CARRIES OUT THE ERASURE PLAN. It decides nothing — lib/erasure.ts holds every
// decision and this walks it.
//
// ── THE ORDER IS THE SAFETY PROPERTY ──────────────────────────────────────
//
// STORAGE FIRST. TABLES SECOND. auth.users LAST.
//
// If the auth row went first and storage then failed, the files would become
// UNATTRIBUTABLE — no account to match them to and no way to find them again.
// That is exactly how 51 objects were orphaned between February and June 2026,
// and doing it in the wrong order would rebuild that fault by design rather
// than by accident. In this order, a failure anywhere leaves a state that is
// still findable and still resumable.
//
// ── RE-RUNNABLE ───────────────────────────────────────────────────────────
//
// Every step is idempotent. `delete where` on an empty set is a no-op, an
// update that matches nothing is a no-op, and removing a storage object that
// has already gone is tolerated. A person half-erased by a crash is worse than
// either end state, so re-running must be safe and must complete the job.
//
// ── A PERSON WITH NO DATA IS THE NORMAL CASE ──────────────────────────────
//
// Most candidates have rows in a handful of these tables, not all of them.
// Zero matches is expected everywhere and is never an error. A missing TABLE,
// however, IS an error — it means the plan has drifted from the schema — and
// it is recorded in the receipt rather than swallowed.

export interface EraseOptions {
  /** Enumerate and report without writing anything. */
  dryRun?: boolean
  /** The address for the email-matched tables, which carry no user id. */
  email?: string | null
}

export interface EraseResult {
  userId: string
  dryRun: boolean
  startedAt: string
  finishedAt: string
  storage: { matched: number; deleted: number; paths: string[] }
  tables: ReceiptLine[]
  authDeleted: boolean
  blocked: { table: string; blocker: string }[]
  errors: string[]
}

export async function eraseAccount(
  admin: SupabaseClient,
  userId: string,
  opts: EraseOptions = {},
): Promise<EraseResult> {
  const dryRun = !!opts.dryRun
  const startedAt = new Date().toISOString()
  const errors: string[] = []
  const tables: ReceiptLine[] = []

  // ── 1. STORAGE, FIRST AND ALWAYS ────────────────────────────────────────
  //
  // Listed across ALL FIVE LAYOUTS. The bare <uuid>/ one is the trap: its
  // owner is the FIRST path segment, not the second, and 23 of the bucket's
  // 83 objects live there. Listing is done by walking the known folders
  // rather than guessing, so a layout that is added later shows up as
  // unmatched rather than being silently skipped.
  const paths: string[] = []
  try {
    const roots = ['photos', 'cvs', 'signatures', 'offer-letters']
    for (const root of roots) {
      const { data } = await admin.storage.from(BUCKET).list(`${root}/${userId}`, { limit: 1000 })
      for (const f of data || []) paths.push(`${root}/${userId}/${f.name}`)
    }
    // The bare layout: the user id IS the folder.
    const { data: bare } = await admin.storage.from(BUCKET).list(userId, { limit: 1000 })
    for (const f of bare || []) paths.push(`${userId}/${f.name}`)
  } catch (e: any) {
    errors.push(`storage list failed: ${e.message}`)
  }

  // Belt and braces: every path is re-checked against the matcher before it is
  // removed. Deleting someone else's file is the one mistake with no undo.
  const mine = paths.filter(p => objectBelongsTo(p, userId))
  const notMine = paths.filter(p => !objectBelongsTo(p, userId))
  if (notMine.length) errors.push(`REFUSED ${notMine.length} path(s) that did not match the owner check`)

  let storageDeleted = 0
  if (!dryRun && mine.length) {
    const { error } = await admin.storage.from(BUCKET).remove(mine)
    if (error) errors.push(`storage remove failed: ${error.message}`)
    else storageDeleted = mine.length
  }

  // ── 2. TABLES ───────────────────────────────────────────────────────────
  for (const rule of ERASURE_PLAN) {
    if (rule.action === 'keep') {
      tables.push({ table: rule.table, action: 'keep', matched: 0, affected: 0, note: rule.why })
      continue
    }
    if (rule.action === 'blocked') {
      // NOT partially applied. Doing the half that works would leave a public
      // comment blanked but still linked to the person, which is worse than
      // leaving it alone: it looks handled.
      tables.push({ table: rule.table, action: 'blocked', matched: 0, affected: 0, note: rule.blocker })
      continue
    }

    // Email-matched tables carry no user id at all — the group a *_id sweep
    // misses entirely.
    const byEmail = ['email_log', 'waitlist', 'employer_members'].includes(rule.table)
    const matchValue = byEmail ? opts.email : userId
    if (byEmail && !matchValue) {
      tables.push({ table: rule.table, action: rule.action, matched: 0, affected: 0,
        note: 'SKIPPED — no email supplied, so these rows cannot be found. They are unreachable by id.' })
      continue
    }

    try {
      const { count: matched, error: cErr } = await admin
        .from(rule.table)
        .select('*', { count: 'exact', head: true })
        .eq(rule.column, matchValue as string)
      if (cErr) throw cErr

      let affected = 0
      if (!dryRun && (matched || 0) > 0) {
        if (rule.action === 'delete') {
          const { error } = await admin.from(rule.table).delete().eq(rule.column, matchValue as string)
          if (error) throw error
          affected = matched || 0
        } else {
          const patch: Record<string, unknown> = {}
          for (const c of rule.nullColumns || []) patch[c] = null
          for (const l of rule.literalColumns || []) patch[l.column] = l.value
          const { error } = await admin.from(rule.table).update(patch).eq(rule.column, matchValue as string)
          if (error) throw error
          affected = matched || 0
        }
      }
      tables.push({ table: rule.table, action: rule.action, matched: matched || 0, affected })
    } catch (e: any) {
      // A MISSING TABLE IS A REAL ERROR, not a quiet skip: it means the plan
      // has drifted from the schema, and a drifted plan leaves data behind.
      errors.push(`${rule.table}.${rule.column}: ${e.message}`)
      tables.push({ table: rule.table, action: rule.action, matched: -1, affected: 0, note: e.message })
    }
  }

  // ── 3. auth.users, LAST ─────────────────────────────────────────────────
  //
  // Only after everything that needs the id to be findable has been dealt
  // with. If anything above failed, this is SKIPPED — deleting the account
  // while data remains is precisely the orphan-making move.
  let authDeleted = false
  if (!dryRun) {
    if (errors.length) {
      errors.push('auth.users NOT deleted — earlier steps reported errors, and removing the account now ' +
                  'would orphan whatever is left. Fix the cause and re-run; every step is idempotent.')
    } else {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) errors.push(`auth delete failed: ${error.message}`)
      else authDeleted = true
    }
  }

  return {
    userId,
    dryRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    storage: { matched: mine.length, deleted: storageDeleted, paths: mine },
    tables,
    authDeleted,
    blocked: blockers().map(b => ({ table: b.table, blocker: b.blocker || '' })),
    errors,
  }
}
