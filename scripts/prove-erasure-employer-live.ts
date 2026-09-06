// THE EMPLOYER ERASURE ACTUALLY HAPPENS — READ BACK FROM THE ROWS.
//
//   npx tsx --conditions=react-server scripts/prove-erasure-employer-live.ts
//
// ── WHY THE PLAN PROOF IS NOT ENOUGH ───────────────────────────────────────
//
// `erasureemployer:prove` asserts the SHAPE of the plan: that jobs are archived
// rather than deleted, that employer_members is keyed on the profile id, that
// applications keep their candidate_id. Every one of those can be true while
// the EXECUTOR does none of it — a mistyped column, a filter matching nothing,
// a branch that returns early, and all 27 rule assertions still pass.
//
// This runs the real `eraseAccount` against a real throwaway employer and then
// reads every row back. It is the difference between "we decided to archive the
// adverts" and "the adverts are archived".
//
// ── IT BUILDS ITS OWN TARGET, WHICH IS WHY IT TAKES NO ARGUMENT ────────────
//
// CLAUDE.md's rule is that a script which can write must refuse to guess where.
// The answer here is not "take a --target flag" — a flag can be mistyped at a
// production account. It is to CREATE the thing being destroyed: a fresh
// employer with a fresh alias, a job nobody can see, and one application. There
// is no value anyone could pass that would point this at a real employer.
//
// Everything it makes, it removes. Teardown runs even when assertions fail.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { eraseAccount } from '../lib/eraseAccount'
import { EMPLOYER_ERASURE_PLAN, employerBlockers } from '../lib/erasure'

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
  console.log('      Not a failure: the plan-shape proof (erasureemployer:prove) still ran.')
  process.exit(2)
}

// ── IT REFUSES TO RUN WHILE THE PLAN IS BLOCKED ───────────────────────────
//
// Not politeness — the run would be actively misleading AND destructive.
// eraseAccount skips a blocked rule and carries on to delete auth.users, and
// `jobs.employer_id → auth.users` is ON DELETE CASCADE, so the throwaway
// advert and its application are destroyed on the way past. Every assertion
// below would then fail for a reason that has nothing to do with the executor.
//
// THIS IS THE STATE THE FIRST RUN FOUND, and it is why the blocker exists:
// the receipt said `jobs archive matched=1 affected=1` and the row was GONE
// when read back. The executor was right and the schema removed its work.
if (employerBlockers().length) {
  console.log('SKIP  the employer plan is BLOCKED, so this proof cannot mean anything yet.')
  for (const b of employerBlockers()) console.log(`      ${b.table}: ${b.blocker}`)
  console.log('      When the migration lands, remove the blocker and run this again — it is')
  console.log('      the check that proves the adverts really do survive.')
  process.exit(2)
}

const admin: SupabaseClient = createClient(URL_, KEY, { auth: { persistSession: false } })

// The CANDIDATE whose application must survive. The standing fixture, never a
// real person: the whole point of decision (b) is that this row is not ours to
// delete, so it has to belong to somebody we are allowed to involve.
const CANDIDATE = 'e8ad7a0b-6632-4a6f-b8e7-3d7fa6db0984' // pauldavies.gbr+candidate@gmail.com

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(60) + (detail ?? ''))
  return ok
}

/** Read the column list from the PLAN rather than restating it here. */
const plannedNulls = (table: string) =>
  EMPLOYER_ERASURE_PLAN.find(r => r.table === table)?.nullColumns ?? []

async function main() {
  const stamp = Date.now()
  // A PER-RUN DOMAIN, BECAUSE eraseAccount WRITES A user_departures ROW.
  // That row carries reason 'self_deleted', a FIXED zero uuid and the email
  // DOMAIN — nothing else. THREE proofs call eraseAccount and verify runs
  // them concurrently, so on a shared domain their rows are indistinguishable:
  // this one used to leave its row behind forever, and tombstonelive's
  // over-broad teardown was silently sweeping up after it. When that was
  // narrowed (eca71cb) the leak surfaced — 2 rows after one verify run,
  // measured 3 Sept 2026. The domain is the only column we control, so it is
  // the discriminator.
  //
  // user_departures is the ONLY durable record of a self-deletion, so a proof
  // row in it is not untidiness — it is a fake departure in the one table
  // that answers how many people leave and how soon.
  const DOMAIN = `emperasure-proof-${stamp}.invalid`
  const email = `proof@${DOMAIN}`
  const NOTE = `Spoke to them ${stamp}. Strong on pastry, free from the 3rd.`
  let userId: string | null = null
  let profileId: string | null = null
  let jobId: string | null = null
  let appId: string | null = null

  try {
    // ── BUILD THE EMPLOYER ────────────────────────────────────────────────
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { role: 'employer' },
    })
    if (cErr || !created.user) throw new Error('could not create the throwaway employer: ' + cErr?.message)
    userId = created.user.id

    const { data: prof, error: pErr } = await admin.from('employer_profiles').insert({
      user_id: userId, company_name: `Erasure Proof Ltd ${stamp}`,
      contact_name: 'Proof Runner', email,
    }).select('id').single()
    if (pErr || !prof) throw new Error('could not create the employer profile: ' + pErr?.message)
    profileId = prof.id as string

    // The advert. `archived` is what we expect AFTERWARDS, so it starts active
    // — a job created already archived could not tell the two states apart.
    const { data: job, error: jErr } = await admin.from('jobs').insert({
      employer_id: userId, title: `Proof Chef ${stamp}`, company: `Erasure Proof Ltd ${stamp}`,
      location: 'London', description: 'A throwaway advert created by a proof.',
      // salary_min/max are NOT NULL with no default on `jobs`. Supplied rather
      // than discovered again by the next person: the insert fails without them.
      salary_min: 30000, salary_max: 35000,
      status: 'active', job_reference: `PROOF-${stamp}`,
    }).select('id, status').single()
    if (jErr || !job) throw new Error('could not create the job: ' + jErr?.message)
    jobId = job.id as string
    check('the advert starts ACTIVE, so archiving is a real change', job.status === 'active', String(job.status))

    // ── THIS THROWAWAY EMPLOYER DECLARES ITSELF A FIXTURE ────────────────────
    //
    // Added 6 Sept 2026, when the new fixture guard refused the application
    // below and took this whole proof red — correctly. The guard raises when a
    // fixture CANDIDATE applies to an advert whose owner is not a fixture
    // EMPLOYER, and `CANDIDATE` here is one of the four. This employer is
    // minted at runtime with a random uuid, so it can never appear on the
    // static list in the migration.
    //
    // THE FIX IS NOT TO LOOSEN THE GUARD. This account IS a fixture — created
    // by a proof, deleted by the same proof a few lines later — so it says so.
    // Loosening the rule to let the application through would have put back
    // exactly the hole that emailed Goldenkeys twice.
    //
    // The row carries no teardown of its own: fixture_accounts.user_id is
    // ON DELETE CASCADE from auth.users, so deleting the account takes it. The
    // teardown asserts that rather than assuming it.
    const { error: fxErr } = await admin.from('fixture_accounts').insert({
      user_id: userId, kind: 'employer', label: `Erasure Proof Ltd ${stamp}`,
      note: 'Throwaway, created and deleted by prove-erasure-employer-live.',
    })
    if (fxErr) throw new Error('could not register the throwaway employer as a fixture: ' + fxErr.message)

    const { data: app, error: aErr } = await admin.from('job_applications').insert({
      job_id: jobId, candidate_id: CANDIDATE, status: 'pending', employer_notes: NOTE,
    }).select('id').single()
    if (aErr || !app) throw new Error('could not create the application: ' + aErr?.message)
    appId = app.id as string

    // The owner's own membership row — keyed on the PROFILE id, which is the
    // whole reason this proof exists.
    await admin.from('employer_members').insert({
      employer_id: profileId, user_id: userId, role: 'owner', status: 'active',
    })

    const { count: membersBefore } = await admin.from('employer_members')
      .select('*', { count: 'exact', head: true }).eq('employer_id', profileId)
    check('the membership row exists before erasure', (membersBefore || 0) > 0, `${membersBefore} row(s)`)

    // ── ERASE ─────────────────────────────────────────────────────────────
    const receipt = await eraseAccount(admin, userId, {
      email, plan: EMPLOYER_ERASURE_PLAN, profileId,
    })

    check('the erasure reported no errors', receipt.errors.length === 0, receipt.errors.join('; '))
    check('the auth user is gone', receipt.authDeleted)

    // WHAT THE EXECUTOR SAYS IT DID, PER TABLE. Printed always, not only on
    // failure: when a row turns up missing, the first question is whether the
    // plan touched it at all, and guessing at that costs more than the lines.
    console.log('')
    for (const t of receipt.tables.filter(t => t.matched !== 0 || t.action !== 'keep')) {
      console.log(`       ${t.table.padEnd(34)} ${t.action.padEnd(10)} matched=${t.matched} affected=${t.affected}`)
    }
    console.log('')

    // ── READ EVERY ROW BACK ───────────────────────────────────────────────

    const { data: jobAfter } = await admin.from('jobs')
      .select('id, status, employer_id').eq('id', jobId).maybeSingle()
    check('THE ADVERT STILL EXISTS — deleting it would take the application context',
      !!jobAfter, jobAfter ? 'present' : 'GONE')
    check('THE ADVERT IS ARCHIVED', jobAfter?.status === 'archived', `status=${jobAfter?.status}`)

    const { data: appAfter } = await admin.from('job_applications')
      .select('id, candidate_id, employer_notes').eq('id', appId).maybeSingle()
    check('THE APPLICATION SURVIVES — it is the candidate\'s record, not the employer\'s',
      !!appAfter, appAfter ? 'present' : 'GONE')
    check('and the candidate is STILL LINKED to their own application',
      appAfter?.candidate_id === CANDIDATE, String(appAfter?.candidate_id))
    // Read from the plan, not restated: if the plan stops clearing this column
    // the assertion follows it rather than silently testing the wrong field.
    for (const col of plannedNulls('job_applications')) {
      check(`THE EMPLOYER'S "${col}" IS GONE from the application`,
        (appAfter as any)?.[col] == null, JSON.stringify((appAfter as any)?.[col]))
    }

    const { count: membersAfter } = await admin.from('employer_members')
      .select('*', { count: 'exact', head: true }).eq('employer_id', profileId)
    check('THE MEMBERSHIP ROW IS GONE — matched on the PROFILE id',
      (membersAfter || 0) === 0, `${membersAfter} row(s)`)

    const { data: profAfter } = await admin.from('employer_profiles')
      .select('id').eq('id', profileId).maybeSingle()
    check('the company profile is gone', !profAfter, profAfter ? 'STILL THERE' : 'gone')

    const { data: authAfter } = await admin.auth.admin.getUserById(userId)
    check('the login really is gone', !authAfter?.user, authAfter?.user ? 'STILL THERE' : 'gone')

  } catch (e: any) {
    check('the proof ran to completion', false, e.message)
  } finally {
    // ── TEARDOWN. Runs whatever happened above. ───────────────────────────
    // The application and the job are ours and outlive the erasure by design,
    // so they are the two things that MUST be cleaned up by hand.
    if (appId) await admin.from('job_applications').delete().eq('id', appId).then(() => {}, () => {})
    if (jobId) await admin.from('jobs').delete().eq('id', jobId).then(() => {}, () => {})
    if (profileId) {
      await admin.from('employer_members').delete().eq('employer_id', profileId).then(() => {}, () => {})
      await admin.from('employer_profiles').delete().eq('id', profileId).then(() => {}, () => {})
    }
    // ONLY OUR OWN — keyed on the per-run domain, so a sibling proof's
    // audit row is never touched.
    await admin.from('user_departures').delete()
      .eq('reason', 'self_deleted').eq('email_domain', DOMAIN)
      .eq('user_id', '00000000-0000-0000-0000-000000000000').then(() => {}, () => {})
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {})

    // And PROVE the teardown, rather than assuming it. An orphan advert left by
    // a proof is exactly the mess this project keeps finding months later.
    if (jobId) {
      const { data: leftover } = await admin.from('jobs').select('id').eq('id', jobId).maybeSingle()
      check('teardown: the throwaway advert is gone', !leftover, leftover ? 'STILL THERE' : 'gone')
    }
    if (appId) {
      const { data: leftover } = await admin.from('job_applications')
        .select('id').eq('id', appId).maybeSingle()
      check('teardown: the throwaway application is gone', !leftover, leftover ? 'STILL THERE' : 'gone')
    }
    // THE FIXTURE ROW GOES BY CASCADE, AND THAT IS ASSERTED RATHER THAN
    // ASSUMED — a fixture_accounts row surviving its account would be a
    // permanent, invisible exemption for a uuid nobody can look up. Keyed on
    // this run's own user id, never a global count, so a concurrent sibling's
    // row cannot turn this red.
    if (userId) {
      const { data: fxLeft } = await admin.from('fixture_accounts')
        .select('user_id').eq('user_id', userId).maybeSingle()
      check("teardown: the throwaway's fixture row went with the account",
        !fxLeft, fxLeft ? 'STILL THERE' : 'gone')
    }
    // THE ONE THIS PROOF NEVER CLEANED UP. Scoped to our domain, so it
    // counts our row and cannot see a concurrent sibling's.
    const { count: depLeft } = await admin.from('user_departures')
      .select('*', { count: 'exact', head: true })
      .eq('reason', 'self_deleted').eq('email_domain', DOMAIN)
    check("teardown: the proof's departure row is gone", (depLeft || 0) === 0, `${depLeft} left`)
  }

  console.log('')
  console.log(bad ? `${bad} FAILED` : 'the employer erasure does what the plan says')
  process.exit(bad ? 1 : 0)
}

main()
