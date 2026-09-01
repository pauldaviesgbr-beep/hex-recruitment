import type { SupabaseClient } from '@supabase/supabase-js'
import { ERASURE_PLAN, BUCKET, objectBelongsTo, type ReceiptLine, type TableRule } from './erasure'
import { TOMBSTONE_USER_ID } from './protectedAccounts'

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
  /**
   * Which plan to walk. Defaults to the candidate plan, so every existing
   * caller keeps its behaviour without being edited.
   */
  plan?: TableRule[]
  /**
   * The employer PROFILE id, for rules whose `idSpace` is 'profile'.
   *
   * REQUIRED WHENEVER THE PLAN CONTAINS ONE, and the executor ERRORS rather
   * than skipping if it is missing. That is deliberate: `employer_members` is
   * the only table in the schema keyed on the profile id, and a missing value
   * would match nothing, report `matched: 0`, and look exactly like an employer
   * who happened to have no team.
   */
  profileId?: string | null
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

  // READ BEFORE ANYTHING IS DESTROYED. `created_at` and the role are needed for
  // the departure row at the end, and by then the account is gone. A failure
  // here is not fatal — the departure row simply carries less.
  let joinedAt: string | null = null
  let role: string | null = null
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    joinedAt = data?.user?.created_at ?? null
    role = ((data?.user?.user_metadata as any)?.role as string) ?? null
  } catch { /* the departure row degrades rather than the erasure failing */ }

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
  const plan = opts.plan || ERASURE_PLAN

  // THE JOB LIST IS RESOLVED ONCE, BEFORE ANYTHING IS ARCHIVED.
  //
  // job_applications is reached through jobs.employer_id, so the ids have to be
  // read while they are still findable. Reading them AFTER the jobs rule ran
  // would still work today — archiving does not move employer_id — but it makes
  // the correctness of one rule depend on the order of another, which is
  // exactly the kind of coupling that breaks silently later.
  let employerJobIds: string[] | null = null
  if (plan.some(r => r.viaEmployerJobs)) {
    const { data, error } = await admin.from('jobs').select('id').eq('employer_id', userId)
    if (error) errors.push(`could not resolve this employer's jobs: ${error.message}`)
    else employerJobIds = (data || []).map(j => j.id as string)
  }

  for (const rule of plan) {
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

    // WHICH ID THIS RULE MATCHES ON.
    //
    // `idSpace` is explicit on the employer plan. The candidate plan predates
    // it, so the three email-matched tables are still recognised by name —
    // changing that list into rule flags is a separate change and this is not
    // the place to make it silently.
    const byEmail = rule.idSpace === 'email'
      || (!rule.idSpace && ['email_log', 'waitlist', 'employer_members'].includes(rule.table))

    let matchValue: string | null | undefined
    if (byEmail) matchValue = opts.email
    else if (rule.idSpace === 'profile') matchValue = opts.profileId
    else matchValue = userId

    if (byEmail && !matchValue) {
      tables.push({ table: rule.table, action: rule.action, matched: 0, affected: 0,
        note: 'SKIPPED — no email supplied, so these rows cannot be found. They are unreachable by id.' })
      continue
    }

    // A MISSING PROFILE ID IS AN ERROR, NOT A SKIP. Matching on `undefined`
    // would return zero rows and read as "this employer had no team" — the
    // silent-wrong-answer this whole idSpace field exists to prevent.
    if (rule.idSpace === 'profile' && !matchValue) {
      const msg = `${rule.table}.${rule.column} is keyed on the employer PROFILE id and none was supplied`
      errors.push(msg)
      tables.push({ table: rule.table, action: rule.action, matched: -1, affected: 0, note: msg })
      continue
    }

    // Likewise: a rule that matches through the employer's jobs cannot run if
    // that list could not be read.
    if (rule.viaEmployerJobs && employerJobIds === null) {
      const msg = `${rule.table} matches through this employer's jobs, and that list could not be read`
      errors.push(msg)
      tables.push({ table: rule.table, action: rule.action, matched: -1, affected: 0, note: msg })
      continue
    }

    try {
      const via = rule.viaEmployerJobs
      // No jobs means no applications. `.in()` with an empty list is a valid
      // query but an explicit zero is clearer in the receipt than an empty IN.
      if (via && employerJobIds!.length === 0) {
        tables.push({ table: rule.table, action: rule.action, matched: 0, affected: 0,
          note: 'no jobs, so no applications to reach' })
        continue
      }

      const scope = <T extends { eq: any; in: any }>(q: T) =>
        via ? q.in(rule.column, employerJobIds!) : q.eq(rule.column, matchValue as string)

      const { count: matched, error: cErr } = await scope(
        admin.from(rule.table).select('*', { count: 'exact', head: true }))
      if (cErr) throw cErr

      let affected = 0
      if (!dryRun && (matched || 0) > 0) {
        if (rule.action === 'delete') {
          const { error } = await scope(admin.from(rule.table).delete())
          if (error) throw error
          affected = matched || 0
        } else {
          // 'anonymise' and 'archive' are the same write — a patch built from
          // the rule — and differ only in what the plan says they MEAN. The
          // receipt keeps them apart so a reader can tell an advert coming off
          // the board from a name being stripped out.
          const patch: Record<string, unknown> = {}
          for (const c of rule.nullColumns || []) patch[c] = null
          for (const l of rule.literalColumns || []) patch[l.column] = l.value
          // THE TOMBSTONE COLUMNS GO LAST so a rule cannot accidentally null a
          // column it also repoints — the placeholder wins, and a NOT NULL
          // column set to null would throw rather than fail quietly.
          for (const c of rule.tombstoneColumns || []) patch[c] = TOMBSTONE_USER_ID
          const { error } = await scope(admin.from(rule.table).update(patch))
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

  // ── 4. THE DEPARTURE ROW — THE ONLY TRACE AN ERASURE LEAVES ─────────────
  //
  // UNTIL 1 SEPT 2026 A COMPLETED SELF-DELETION LEFT NO RECORD ANYWHERE.
  // `deletion_requests` would have been the instrument and it has an ON DELETE
  // CASCADE, so the erasure destroyed its own audit trail. `user_departures`
  // survives — it is the one table here with NO foreign key to auth.users — but
  // nothing on this path ever wrote to it, even though the plan lists it as
  // 'keep'. Its only writer was reap-unconfirmed. So "no candidate has ever
  // deleted their account" was an inference that could not be checked, about
  // the one action that most needs a trail.
  //
  // ── WRITTEN AFTER SUCCESS, WHICH IS THE OPPOSITE OF reap-unconfirmed ────
  //
  // The reaper writes its row FIRST and says why: a logged departure that did
  // not happen is "visible and correctable", where the other order loses the
  // record silently. That reasoning is right for the reaper and wrong here,
  // because of the sentinel below — the reaper's row carries the real user id
  // so a bad row can be found and removed, and ours cannot. A false row we
  // could never identify is worse than a missing one we shout about, so this
  // writes only on a completed deletion and logs loudly if it cannot.
  //
  // ── WHAT IT CARRIES, AND WHAT IT DELIBERATELY DOES NOT ──────────────────
  //
  // NOT THE PERSON'S USER ID. `user_id` is NOT NULL so something must go there,
  // and the real uuid would be a correlation key kept about somebody who has
  // just asked to be unlinkable. The all-zero uuid is used because it is
  // unmistakably not an account: a random uuid would look like a real id and
  // send the next person hunting a row that never existed.
  //
  // The rest is the same shape the reaper already uses and is honest without
  // being identifying: the email DOMAIN only, the role, when they joined, how
  // long they stayed. Enough to answer "how many people delete, and how soon",
  // which is the question this table exists for. Not enough to answer "who".
  if (!dryRun && authDeleted) {
    const joined = joinedAt ? new Date(joinedAt) : null
    const { error: logErr } = await admin.from('user_departures').insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      email_domain: opts.email?.split('@')[1]?.toLowerCase() ?? null,
      role: role ?? null,
      reason: 'self_deleted',
      joined_at: joined?.toISOString() ?? null,
      days_held: joined
        ? Math.max(0, Math.floor((Date.now() - joined.getTime()) / 86_400_000))
        : null,
    })
    // NOT pushed to `errors`. The account is already gone, and a non-empty
    // errors array makes the route tell the person their deletion FAILED —
    // which would be a lie, and the worst possible thing to say to somebody
    // who has just deleted their account.
    if (logErr) {
      console.error('[eraseAccount] DEPARTURE LOG FAILED — the deletion completed but left no trace:',
        logErr.message)
      tables.push({ table: 'user_departures', action: 'keep', matched: 0, affected: 0,
        note: 'DEPARTURE LOG FAILED: ' + logErr.message })
    } else {
      tables.push({ table: 'user_departures', action: 'keep', matched: 0, affected: 1,
        note: 'departure recorded — domain, role and duration only, no identifier' })
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
    blocked: plan.filter(r => r.action === 'blocked').map(b => ({ table: b.table, blocker: b.blocker || '' })),
    errors,
  }
}
