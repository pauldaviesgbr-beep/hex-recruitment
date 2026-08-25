// ERASE A DISPOSABLE ACCOUNT AND SHOW THE RECEIPT.
//
// CREATES ITS OWN VICTIM. This never touches a real account — not Paul's, not
// a candidate's, not one of the orphans. It mints a throwaway auth user, gives
// it rows in as many of the planned tables as it can plus objects in MORE THAN
// ONE storage layout, erases it, and reads back.
//
// THE STORAGE FIXTURE IS THE POINT. It seeds a file under photos/<uid>/ AND a
// file under the bare <uid>/ legacy layout, because a script that assumes a
// prefix misses 23 of the bucket's 83 objects. If the erasure only handles one
// layout, this run shows it.
//
//   node scripts/prove-erasure-live.mjs [--dry-run]
//
// Needs SUPABASE_SERVICE_ROLE_KEY.

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { eraseAccount } from '../lib/eraseAccount'

const env: Record<string, string> = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const i = line.indexOf('=')
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('SKIP  needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }
const admin = createClient(URL_, KEY, { auth: { persistSession: false } })

const DRY = process.argv.includes('--dry-run')
const stamp = Date.now()
const EMAIL = `pauldavies.gbr+erasuretest${stamp}@gmail.com`

const pad = (k: string, v: unknown) => console.log('  ' + String(k).padEnd(42) + v)
let created: string | null = null

async function main() {
  try {
    // ── MINT THE DISPOSABLE ACCOUNT ───────────────────────────────────────
    console.log('\nCREATING A DISPOSABLE ACCOUNT')
    const { data: made, error: mkErr } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: 'erasure-test-' + stamp,
      email_confirm: true,
      user_metadata: { role: 'candidate', full_name: 'Erasure Test' },
    })
    if (mkErr) throw new Error('could not create the test user: ' + mkErr.message)
    created = made.user.id
    pad('user id', created)
    pad('email', EMAIL)

    // ── SEED ROWS ─────────────────────────────────────────────────────────
    console.log('\nSEEDING ROWS')
    const seeded: string[] = []
    const seed = async (table: string, row: Record<string, unknown>) => {
      const { error } = await admin.from(table).insert(row)
      if (error) console.log('    (skipped ' + table + ': ' + error.message.slice(0, 60) + ')')
      else { seeded.push(table); }
    }
    await seed('candidate_profiles', {
      user_id: created, full_name: 'Erasure Test', email: EMAIL, phone: '07000000000',
      job_title: 'Test Chef', is_discoverable: false,
    })
    await seed('saved_jobs', { candidate_id: created, job_id: (await anyJobId()) })
    await seed('notifications', { user_id: created, title: 'test', message: 'test', type: 'system' })
    await seed('user_onboarding', { user_id: created })
    await seed('platform_feedback', { user_id: created, comment: 'test feedback', rating: 5 })
    await seed('apply_starts', { candidate_id: created, job_id: (await anyJobId()) })
    // A COMMENT, so decision (d) is exercised rather than assumed. The trigger
  // denormalises author_name and author_avatar onto the row at insert, which
  // is exactly what the erasure has to clear as well as the id.
  const postId = await anyTempPostId()
  if (postId) await seed('temp_post_comments', {
    post_id: postId, user_id: created, body: 'erasure test comment',
    author_name: 'Erasure Test', author_role: 'candidate',
  })
  await seed('email_log', { recipient: EMAIL, email_type: 'erasure_test', subject: 'test', success: true })
    pad('tables seeded', seeded.length + '  (' + seeded.join(', ') + ')')

    // ── SEED STORAGE IN TWO DIFFERENT LAYOUTS ─────────────────────────────
    console.log('\nSEEDING STORAGE IN TWO LAYOUTS')
    // The bucket restricts mime types to image/*, PDF and Word. A 1x1 PNG is
  // the smallest thing it will accept.
  const blob = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64')
    const objects = [`photos/${created}/test.png`, `${created}/legacy-test.png`]
    for (const p of objects) {
      const { error } = await admin.storage.from('profiles').upload(p, blob, { contentType: 'image/png', upsert: true })
      pad(p.includes('photos/') ? 'photos/<uid>/  (prefixed)' : '<uid>/  (BARE, legacy)', error ? 'FAILED ' + error.message : 'seeded')
    }

    // ── ERASE ─────────────────────────────────────────────────────────────
    console.log('\n' + (DRY ? 'DRY RUN — ENUMERATING ONLY' : 'ERASING'))
    const receipt = await eraseAccount(admin, created, { email: EMAIL, dryRun: DRY })

    console.log('\nRECEIPT')
    pad('storage objects matched', receipt.storage.matched)
    pad('storage objects deleted', receipt.storage.deleted)
    for (const p of receipt.storage.paths) console.log('      ' + p)
    console.log('')
    console.log('  table                          action      matched  affected')
    console.log('  ' + '─'.repeat(62))
    for (const t of receipt.tables) {
      const flag = t.matched === -1 ? '  ERROR' : ''
      console.log('  ' + t.table.padEnd(30) + t.action.padEnd(12) +
                  String(t.matched).padStart(7) + String(t.affected).padStart(10) + flag)
    }
    console.log('')
    pad('auth.users deleted', receipt.authDeleted)
    pad('errors', receipt.errors.length)
    for (const e of receipt.errors) console.log('      ' + e)
    if (receipt.blocked.length) {
      console.log('\n  BLOCKED, awaiting a decision:')
      for (const b of receipt.blocked) console.log('    ' + b.table + ' — ' + b.blocker.slice(0, 150))
    }

    // ── READ BACK, IN SEPARATE QUERIES ────────────────────────────────────
    if (!DRY) {
      console.log('\nREAD BACK — separate queries, new snapshot')
      const { data: authRow } = await admin.auth.admin.getUserById(created)
      pad('auth user still exists', authRow?.user ? 'YES — FAILURE' : 'no')
      for (const t of ['candidate_profiles', 'saved_jobs', 'notifications', 'user_onboarding', 'apply_starts']) {
        const col = ['saved_jobs', 'apply_starts'].includes(t) ? 'candidate_id' : 'user_id'
        const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, created)
        pad('  ' + t + ' rows left', count)
      }
      const { count: elc } = await admin.from('email_log').select('*', { count: 'exact', head: true }).eq('recipient', EMAIL)
      pad('  email_log rows left (by email)', elc)
      const { count: pf } = await admin.from('platform_feedback').select('*', { count: 'exact', head: true }).eq('user_id', created)
      pad('  platform_feedback linked rows', pf + '  (anonymised, so 0 expected)')
      const { data: left } = await admin.storage.from('profiles').list(created, { limit: 100 })
      const { data: left2 } = await admin.storage.from('profiles').list(`photos/${created}`, { limit: 100 })
      pad('  storage objects left (bare)', (left || []).length)
      pad('  storage objects left (photos)', (left2 || []).length)
    }
  } catch (e: any) {
    console.error('\nFAILED: ' + e.message)
    process.exitCode = 1
  } finally {
    // If anything went wrong before the erase, the disposable account must not
    // survive this script.
    if (created && (DRY || process.exitCode === 1)) {
      const { data } = await admin.auth.admin.getUserById(created)
      if (data?.user) {
        await admin.from('candidate_profiles').delete().eq('user_id', created)
        await admin.from('email_log').delete().eq('recipient', EMAIL)
        await admin.storage.from('profiles').remove([`photos/${created}/test.png`, `${created}/legacy-test.png`])
        await admin.auth.admin.deleteUser(created)
        console.log('\n  cleaned up the disposable account')
      }
    }
  }

}

async function anyTempPostId() {
  const { data } = await admin.from('temp_posts').select('id').limit(1).maybeSingle()
  return data?.id
}

async function anyJobId() {
  const { data } = await admin.from('jobs').select('id').limit(1).maybeSingle()
  return data?.id
}


main()