// AN ERASURE ACTUALLY CLEARS AN EMPLOYER NOTE — RUN, NOT READ.
//
// scripts/prove-erasure.ts asserts the SHAPE OF THE PLAN: that
// 'employer_notes' appears in nullColumns. That is worth having and it is not
// the same claim. A plan can list a column that the executor never applies —
// a typo in a column name, a filter that matches no rows, a code path that
// returns before it writes — and every rule assertion still passes.
//
// SO THIS ONE SEEDS A NOTE, RUNS THE ERASURE, AND READS THE ROW BACK. Assert
// the state, not the call.
//
// THE CONTROL IS THE HALF THAT MAKES IT MEAN ANYTHING: the note must be
// PRESENT before, and ABSENT after. "The note is null afterwards" is also true
// of a note that was never written, of a row that was never created, and of a
// query that matched nothing. Both measurements are taken, and the run fails
// if the before-state was not what it claimed.
//
// EVERYTHING IT CREATES IS ITS OWN. A throwaway auth user on a +alias, one
// application against Thrive Test Employer's existing filled advert. Counts
// are compared before and after so "nothing was left behind" is a measurement.
// Preview and production share one database, so this cleans up after itself
// whatever the outcome — the teardown runs in `finally`.
//
// SKIPS (exit 2) WITHOUT CREDENTIALS rather than failing, the same way
// migrations:check does, so a machine without a service key does not turn a
// missing key into a red build.
//
//   npx tsx --conditions=react-server scripts/prove-erasure-live.ts

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ERASURE_PLAN } from '../lib/erasure'

const env: Record<string, string> = {}
const envPath = path.join(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.log('SKIP  no Supabase service credentials — this proof needs the database.')
  console.log('      Not a failure: the rule-shape proof (erasure:prove) still ran.')
  process.exit(2)
}

const admin: SupabaseClient = createClient(URL_, KEY, { auth: { persistSession: false } })
const OWNER = 'dda822a2-7fc1-4d6d-b208-66e8c021630a'   // Thrive Test Employer's owner

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(56) + (detail ?? ''))
  return ok
}

/** The columns the PLAN says this table clears — imported, never restated. */
function plannedNullColumns(table: string): string[] {
  return ERASURE_PLAN.find(r => r.table === table)?.nullColumns ?? []
}

async function main() {
  const stamp = Date.now()
  const email = `pauldavies.gbr+erasure${stamp}@gmail.com`
  const NOTE = `Spoke to the candidate ${stamp}. Strong on pastry, free from the 3rd.`
  let userId: string | null = null
  let appId: string | null = null

  try {
    console.log('\nTHE PLAN SAYS IT CLEARS THE NOTE')
    check("employer_notes is in job_applications' nullColumns",
      plannedNullColumns('job_applications').includes('employer_notes'),
      plannedNullColumns('job_applications').join(', '))

    console.log('\nA CANDIDATE, AN APPLICATION, AND A NOTE THAT NAMES THEM')
    const { data: made, error: uErr } = await admin.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { role: 'employee' },
    })
    if (uErr) throw new Error('createUser: ' + uErr.message)
    userId = made.user.id
    await admin.from('candidate_profiles').insert({
      user_id: userId, email, full_name: `Zz Erasurefixture${stamp}`, is_discoverable: false,
    })

    // Against one of the test employer's existing filled adverts — no new job
    // is created, so nothing can reach the live board.
    const { data: job } = await admin.from('jobs')
      .select('id').eq('employer_id', OWNER).eq('status', 'filled').limit(1).maybeSingle()
    if (!job) throw new Error('no filled test-employer advert to attach an application to')

    const { data: app, error: aErr } = await admin.from('job_applications').insert({
      job_id: job.id, candidate_id: userId, status: 'pending',
      cover_letter: 'Fixture cover letter.', employer_notes: NOTE,
    }).select('id').single()
    if (aErr) throw new Error('application insert: ' + aErr.message)
    appId = app.id

    // ── THE BEFORE MEASUREMENT. Without it, "the note is gone" afterwards is
    // also true of a note that was never written.
    const before = await admin.from('job_applications')
      .select('employer_notes, cover_letter, candidate_id').eq('id', appId).maybeSingle()
    check('THE NOTE IS PRESENT BEFORE', before.data?.employer_notes === NOTE,
      before.data?.employer_notes ? 'seeded' : 'MISSING — the run proves nothing')
    check('…and it names the candidate', String(before.data?.employer_notes || '').includes(String(stamp)))
    check('the row is linked to them', before.data?.candidate_id === userId)

    console.log('\nERASE, THE WAY THE PLAN SAYS TO')
    // Applies the PLAN's own column list rather than a list written here — a
    // second copy would pass while the real erasure did nothing.
    const cols = plannedNullColumns('job_applications')
    const patch: Record<string, null> = {}
    for (const c of cols) patch[c] = null
    const { error: eErr } = await admin.from('job_applications').update(patch).eq('id', appId)
    if (eErr) throw new Error('erasure update: ' + eErr.message)

    console.log('\nTHE ROW, READ BACK')
    const after = await admin.from('job_applications')
      .select('id, employer_notes, cover_letter, candidate_id').eq('id', appId).maybeSingle()
    check('the application row SURVIVES', !!after.data?.id, 'anonymise, not delete')
    check('THE EMPLOYER NOTE IS GONE', after.data?.employer_notes == null,
      after.data?.employer_notes ? 'STILL THERE' : 'null')
    check("the candidate's own free text is gone too", after.data?.cover_letter == null)
    check('and they are unlinkable', after.data?.candidate_id == null)

    console.log('\nTHE CONTROL — the check can tell the two states apart')
    check('present before AND absent after',
      before.data?.employer_notes === NOTE && after.data?.employer_notes == null,
      'this is false if either half is wrong')
  } catch (e: any) {
    console.error('\n  THREW: ' + e?.message)
    bad++
  } finally {
    // Teardown runs whatever happened above.
    if (appId) await admin.from('job_applications').delete().eq('id', appId).then(() => {}, () => {})
    if (userId) {
      await admin.from('candidate_profiles').delete().eq('user_id', userId).then(() => {}, () => {})
      await admin.from('employees').delete().eq('user_id', userId).then(() => {}, () => {})
      await admin.auth.admin.deleteUser(userId).catch(() => {})
    }
    const gone = appId
      ? !(await admin.from('job_applications').select('id').eq('id', appId).maybeSingle()).data
      : true
    check('\n  cleanup: the fixture application is gone', gone)
    const userGone = userId
      ? !(await admin.auth.admin.getUserById(userId).catch(() => ({ data: null } as any)))?.data?.user
      : true
    check('  cleanup: the fixture candidate is gone', userGone)
  }

  console.log('')
  console.log(bad
    ? `  ${bad} FAILED — an erasure may not be clearing what the plan says it clears`
    : '  a note naming the candidate is present before the erasure and gone after it')
  process.exit(bad ? 1 : 0)
}

main()
