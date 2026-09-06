// A FIXTURE ACCOUNT CANNOT APPLY TO A REAL EMPLOYER'S ADVERT.
//
//   npx tsx scripts/prove-fixture-guard.ts
//
// Exit 0 pass · 1 fail · 2 SKIP (no service key, or the guard is not applied).
//
// ── WHY THIS ASKS A FUNCTION RATHER THAN INSERTING ────────────────────────
//
// The obvious proof is to apply as Marcus to a Goldenkeys advert and watch it
// be refused. THAT PROOF EMAILS TOBY IF IT EVER PASSES THE WRONG WAY — it is
// the exact event this guard exists to prevent, and it has already happened
// twice. So the DECISION lives in its own SQL function, `fixture_application_
// refusal(candidate, job)`, which the trigger calls and this script asks
// directly. Read-only, no row written, and it is the same code path that runs
// on a real insert rather than a restatement of it.
//
// ── THE ASSERTION THAT MATTERS MOST IS THE LAST ONE ───────────────────────
//
// "Marcus is refused" passes just as happily on a guard that refuses
// EVERYBODY. A guard that blocks real candidates from applying for work is a
// far worse fault than the one being fixed, so a real candidate against a real
// advert must come back ALLOWED, and that is checked against live rows.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* fall through to the skip below */ }

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('SKIP  no service key — this check needs the database.')
  process.exit(2)
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

let bad = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(62) + detail)
}

const MARCUS = '4ba92141-677d-4422-91cf-9b6f4e0067ca'

async function refusal(candidate: string, job: string): Promise<string | null> {
  const { data, error } = await admin.rpc('fixture_application_refusal',
    { p_candidate: candidate, p_job: job })
  if (error) throw new Error(error.message)
  return data as string | null
}

async function main(): Promise<number> {
  // Is the guard even applied? A missing function must SKIP, not FAIL — a red
  // nobody expects to be green is a red nobody reads.
  try {
    await refusal(MARCUS, MARCUS)
  } catch (e: any) {
    if (/could not find|does not exist|schema cache/i.test(e.message || '')) {
      console.log('SKIP  the fixture guard is not applied to this database yet.')
      console.log('      Nothing is wrong; the migration is awaiting the go.')
      return 2
    }
    throw e
  }

  // ── THE LIST ──────────────────────────────────────────────────────────────
  const { data: fixtures } = await admin.from('fixture_accounts').select('user_id, kind, label')
  const cands = (fixtures ?? []).filter(f => f.kind === 'candidate')
  const emps = (fixtures ?? []).filter(f => f.kind === 'employer')
  console.log(`\nTHE LIST — ${cands.length} fixture candidates, ${emps.length} fixture employers`)
  for (const f of fixtures ?? []) console.log(`   ${f.kind.padEnd(10)} ${f.label}`)
  check('Marcus is on the candidate list', cands.some(c => c.user_id === MARCUS))
  check('there are fixture employers to apply to', emps.length > 0, `${emps.length}`)

  // ── LIVE ROWS, READ NOW ───────────────────────────────────────────────────
  const empIds = emps.map(e => e.user_id)
  const { data: realJob } = await admin.from('jobs')
    .select('id, title, employer_id').eq('status', 'active')
    .not('employer_id', 'in', `(${empIds.join(',')})`).limit(1).maybeSingle()
  const { data: fixtureJob } = await admin.from('jobs')
    .select('id, title, employer_id').in('employer_id', empIds).limit(1).maybeSingle()
  // A REAL candidate: on nobody's fixture list. Read only, never written to.
  const { data: realCand } = await admin.from('candidate_profiles')
    .select('user_id, full_name')
    .not('user_id', 'in', `(${cands.map(c => c.user_id).join(',')})`).limit(1).maybeSingle()

  console.log('')
  check('found a REAL employer\'s live advert to test against', !!realJob, realJob?.title ?? 'none')
  check('found a FIXTURE advert to test against', !!fixtureJob, fixtureJob?.title ?? 'none')
  check('found a REAL candidate to test with', !!realCand, realCand?.full_name ?? 'none')
  if (bad || !realJob || !fixtureJob || !realCand) {
    // A ZERO-GUARD. Without live rows to test on, every check below would pass
    // vacuously and the run would look clean.
    console.log('\ncannot test the decision without all three — refusing to report a pass')
    return 1
  }

  console.log('\nTHE DECISION')
  const a = await refusal(MARCUS, realJob.id)
  check('a fixture applying to a REAL employer is REFUSED', a !== null, String(a))
  const b = await refusal(MARCUS, fixtureJob.id)
  check('the same fixture applying to a FIXTURE advert is ALLOWED', b === null, String(b))
  const c = await refusal(realCand.user_id, realJob.id)
  check('A REAL CANDIDATE APPLYING FOR REAL WORK IS ALLOWED', c === null, String(c))
  const d = await refusal(realCand.user_id, fixtureJob.id)
  check('a real candidate may still apply to a demo advert', d === null, String(d))

  // The pair that makes this a discriminator rather than a description.
  check('the guard distinguishes the two — it does not refuse everybody',
    a !== null && c === null, `fixture=${a} real=${c}`)

  console.log('')
  console.log(bad ? `${bad} FAILED` : 'the guard refuses fixtures against real employers, and nobody else')
  return bad ? 1 : 0
}

// EXIT ONLY ONCE THE PROMISE HAS SETTLED. Calling process.exit() from inside
// main() while a Supabase request was still in flight aborted the process with
// a libuv assertion and exit 127 — so a clean SKIP reported as a CRASH. The
// exit code IS the verdict here; it must not be collateral damage.
main()
  .then(code => { process.exitCode = code })
  .catch(e => { console.error('FAILED:', e.message); process.exitCode = 1 })
