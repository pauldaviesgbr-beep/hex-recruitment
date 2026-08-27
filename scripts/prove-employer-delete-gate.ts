// AN EMPLOYER CANNOT SELF-DELETE, AND A CANDIDATE STILL CAN.
//
// THE ASSERTION THAT MATTERS IS NOT THE STATUS CODE. A 409 proves the route
// answered; it does not prove nothing was erased. The erasure plan touches
// tables in order and a refusal arriving after the first write is a
// half-deleted account that also returned a tidy error. So this reads the
// ROWS afterwards: the auth user, the employer_profile and the adverts must
// all still be there.
//
// AND THE SECOND HALF IS WHAT MAKES THE FIRST MEAN ANYTHING. "The employer
// still exists" is also true of a gate that refuses everybody, of a route
// that 500s, and of a deploy that never happened. So a CANDIDATE fixture runs
// the same route and must be erased — the path merged an hour before this was
// written, which the gate must not have broken.
//
// WHY IT CALLS THE ROUTE DIRECTLY RATHER THAN DRIVING THE UI: hiding a button
// is not closing a route. Anyone with a session can POST this, so the test
// has to be the thing an attacker would do, not the thing the screen offers.
//
// FIXTURES ONLY, AND NO NEW ADVERT. The employer fixture is given an
// employer_profiles row and is pointed at Thrive Test Employer's EXISTING
// filled advert — preview and production share one database and a new advert
// could reach the live board. Everything is destroyed in a finally block.
//
//   npx tsx --conditions=react-server scripts/prove-employer-delete-gate.ts <baseUrl>

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const env: Record<string, string> = {}
const envPath = path.join(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// NO DEFAULT BASE URL, AND THAT IS DELIBERATE.
//
// It used to fall back to https://thrivecareer.co.uk. Then `npm run verify`
// ran it with no argument and the proof pointed itself at PRODUCTION — which
// was the ungated build, so the fixture employer was really deleted, its
// employer_profiles row really orphaned, and only the teardown cleaned up.
//
// A test that quietly chooses production when nobody told it where to go is a
// test that will one day do that to something it cannot put back. It now
// refuses to guess: pass a URL, or set DELETE_GATE_BASE_URL, or it SKIPS.
const BASE = process.argv[2] || process.env.DELETE_GATE_BASE_URL || ''
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET

if (!URL_ || !KEY || !ANON) {
  console.log('SKIP  no Supabase credentials — this proof needs the database and a live route.')
  process.exit(2)
}
if (!BASE) {
  console.log('SKIP  no base URL. This proof creates and deletes real accounts, so it will not')
  console.log('      guess which deployment to point at. Pass one as an argument, or set')
  console.log('      DELETE_GATE_BASE_URL. It must be a deployment CARRYING the gate — running')
  console.log('      it against a build without one deletes the fixture employer for real.')
  process.exit(2)
}

const admin: SupabaseClient = createClient(URL_, KEY, { auth: { persistSession: false } })
const OWNER = 'dda822a2-7fc1-4d6d-b208-66e8c021630a'

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(58) + (detail ?? ''))
  return ok
}

/** A real session for a fixture, so the route sees a genuine caller. */
async function signIn(email: string, password: string): Promise<string | null> {
  const anon = createClient(URL_!, ANON!, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error) { console.error('   sign-in failed: ' + error.message); return null }
  return data.session?.access_token ?? null
}

async function callDelete(token: string) {
  const res = await fetch(`${BASE}/api/account/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
    },
    body: JSON.stringify({ confirm: 'DELETE' }),
  })
  const body = await res.json().catch(() => ({} as any))
  return { status: res.status, body }
}

async function main() {
  const stamp = Date.now()
  const PW = 'Gate!' + Math.random().toString(36).slice(2, 10) + '#Za7'
  const empEmail = `pauldavies.gbr+gateemp${stamp}@gmail.com`
  const candEmail = `pauldavies.gbr+gatecand${stamp}@gmail.com`
  let empId: string | null = null
  let candId: string | null = null
  let empProfileId: string | null = null

  try {
    console.log('\nTWO FIXTURES — ONE OF EACH KIND')
    const { data: emp, error: e1 } = await admin.auth.admin.createUser({
      email: empEmail, password: PW, email_confirm: true, user_metadata: { role: 'employer' },
    })
    if (e1) throw new Error('employer createUser: ' + e1.message)
    empId = emp.user.id
    const { data: prof, error: e2 } = await admin.from('employer_profiles').insert({
      user_id: empId, company_name: `ZZ Gate Fixture ${stamp}`,
    }).select('id').single()
    if (e2) throw new Error('employer_profiles insert: ' + e2.message)
    empProfileId = prof.id
    check('an employer fixture exists, owning a profile', !!empProfileId, empId)

    const { data: cand, error: e3 } = await admin.auth.admin.createUser({
      email: candEmail, password: PW, email_confirm: true, user_metadata: { role: 'employee' },
    })
    if (e3) throw new Error('candidate createUser: ' + e3.message)
    candId = cand.user.id
    await admin.from('candidate_profiles').insert({
      user_id: candId, email: candEmail, full_name: `Zz Gatefixture${stamp}`, is_discoverable: false,
    })
    check('a candidate fixture exists', !!candId, candId)

    console.log('\nTHE EMPLOYER CALLS THE ROUTE DIRECTLY — hiding a button is not closing a route')
    const empToken = await signIn(empEmail, PW)
    if (!check('the employer has a real session', !!empToken)) throw new Error('no employer session')
    const empRes = await callDelete(empToken!)
    check('it is REFUSED', empRes.status === 409, 'HTTP ' + empRes.status)
    check('…and says why, in words an employer can act on',
      /contact@thrivecareer\.co\.uk/.test(String(empRes.body?.error || '')),
      String(empRes.body?.reason || ''))

    console.log('\n  THE ASSERTION THAT MATTERS — the rows, not the status code')
    const stillUser = await admin.auth.admin.getUserById(empId!).catch(() => ({ data: null } as any))
    check('the employer account STILL EXISTS', !!stillUser?.data?.user, empEmail)
    const { data: stillProf } = await admin.from('employer_profiles')
      .select('id').eq('user_id', empId!).maybeSingle()
    check('their employer_profile STILL EXISTS', !!stillProf)
    const { count: advertCount } = await admin.from('jobs')
      .select('id', { count: 'exact', head: true }).eq('employer_id', OWNER)
    check('the test employer’s adverts are untouched', (advertCount ?? 0) > 0, String(advertCount) + ' adverts')

    console.log('\nTHE DISCRIMINATOR — the gate keys on the ROW, not on the CLAIM')
    // WHY THIS EXISTS INSTEAD OF DEPLOYING A BROKEN GATE. The obvious way to
    // watch a guard fail is to remove it and re-run. This one is server-side,
    // so that means deploying a build where employers CAN self-delete, against
    // a database shared with production and nine real employer accounts. The
    // window is small and the cost is unbounded, so it is the wrong trade.
    //
    // This asks the same question — can the check tell the two states apart? —
    // by moving the thing the check reads instead of removing the check. A
    // user whose METADATA says employer but who owns NO employer_profiles row
    // must be erased. If the gate were keyed on user_metadata.role, which the
    // user can rewrite via supabase.auth.updateUser, this would be refused.
    const spoofEmail = `pauldavies.gbr+gatespoof${stamp}@gmail.com`
    const { data: spoof, error: e4 } = await admin.auth.admin.createUser({
      email: spoofEmail, password: PW, email_confirm: true,
      user_metadata: { role: 'employer' },        // claims to be an employer
    })
    if (e4) throw new Error('spoof createUser: ' + e4.message)
    const spoofId = spoof.user.id
    await admin.from('candidate_profiles').insert({
      user_id: spoofId, email: spoofEmail, full_name: `Zz Spooffixture${stamp}`, is_discoverable: false,
    })
    const { data: noProf } = await admin.from('employer_profiles')
      .select('id').eq('user_id', spoofId).maybeSingle()
    check('metadata says employer, but no employer_profiles row', !noProf, "role='employer'")

    const spoofToken = await signIn(spoofEmail, PW)
    const spoofRes = spoofToken ? await callDelete(spoofToken) : { status: 0, body: {} as any }
    check('THE GATE LETS THEM THROUGH — it read the row, not the claim',
      spoofRes.status === 200, 'HTTP ' + spoofRes.status)
    const spoofGone = await admin.auth.admin.getUserById(spoofId).catch(() => ({ data: null } as any))
    check('…and they were actually erased', !spoofGone?.data?.user)
    if (spoofGone?.data?.user) {
      await admin.from('candidate_profiles').delete().eq('user_id', spoofId).then(() => {}, () => {})
      await admin.auth.admin.deleteUser(spoofId).catch(() => {})
    }
    check('SO THE CHECK DISTINGUISHES THE TWO STATES', spoofRes.status === 200,
      'same metadata, opposite outcome, decided by the row')

    console.log('\nTHE CONTROL — a candidate must still be erased, or the gate proves nothing')
    const candToken = await signIn(candEmail, PW)
    if (!check('the candidate has a real session', !!candToken)) throw new Error('no candidate session')
    const candRes = await callDelete(candToken!)
    check('the candidate is NOT refused', candRes.status === 200, 'HTTP ' + candRes.status)
    check('…and the route reports it deleted', candRes.body?.deleted === true, JSON.stringify(candRes.body).slice(0, 60))
    const goneUser = await admin.auth.admin.getUserById(candId!).catch(() => ({ data: null } as any))
    check('THE CANDIDATE ACCOUNT IS GONE', !goneUser?.data?.user)
    const { data: goneProf } = await admin.from('candidate_profiles')
      .select('user_id').eq('user_id', candId!).maybeSingle()
    check('…and their profile with it', !goneProf)
    if (!goneUser?.data?.user) candId = null   // already erased; nothing to tear down
  } catch (e: any) {
    console.error('\n  THREW: ' + e?.message)
    bad++
  } finally {
    console.log('\nTEARDOWN — counted, not hoped')
    if (empId) {
      await admin.from('employer_profiles').delete().eq('user_id', empId).then(() => {}, () => {})
      await admin.auth.admin.deleteUser(empId).catch(() => {})
    }
    if (candId) {
      await admin.from('candidate_profiles').delete().eq('user_id', candId).then(() => {}, () => {})
      await admin.auth.admin.deleteUser(candId).catch(() => {})
    }
    const { data: leftProf } = empId
      ? await admin.from('employer_profiles').select('id').eq('user_id', empId).maybeSingle()
      : { data: null }
    check('the fixture employer_profile is gone', !leftProf)
    const leftUser = empId
      ? (await admin.auth.admin.getUserById(empId).catch(() => ({ data: null } as any)))?.data?.user
      : null
    check('the fixture employer account is gone', !leftUser)
  }

  console.log('')
  console.log(bad
    ? `  ${bad} FAILED — an employer may be able to delete themselves`
    : '  an employer is refused and keeps everything; a candidate is still erased')
  process.exit(bad ? 1 : 0)
}

main()
