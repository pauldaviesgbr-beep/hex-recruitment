// node scripts/drive-app-api-signed-in.mjs <deployment-url>
//
// Drives the iOS app's signed-in endpoints on a REAL deployment, as the
// standing candidate fixture (pauldavies.gbr+candidate@ — Drive Test, is_test).
//
// The target is an ARGUMENT, never a default: a script that writes must not
// guess where (CLAUDE.md). Preview deployments are reached with the
// VERCEL_AUTOMATION_BYPASS_SECRET header, read from the environment.
//
// What it writes: one saved_jobs row for the fixture, removed in the same run,
// and asserted gone. saved_jobs has no triggers, so a save notifies nobody.
// The fixture's saved set is read first and must be identical at the end.

import { loadEnv, sessionFor } from './lib/rls-probe.mjs'

const target = process.argv[2]
if (!target || !/^https:\/\//.test(target)) {
  console.log('SKIP: pass the deployment URL to drive, e.g. the preview from `npm run preview-url`')
  process.exit(2)
}
const env = loadEnv()
const FIXTURE = 'pauldavies.gbr+candidate@gmail.com'
const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET
const base = target.replace(/\/$/, '') + '/api/app'

let fail = 0
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fail++ }

async function call(method, path, token) {
  const headers = {}
  if (bypass) headers['x-vercel-protection-bypass'] = bypass
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(base + path, { method, headers })
  let body = null
  try { body = await r.json() } catch {}
  return { status: r.status, body }
}

async function rest(path) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  })
  return r.json()
}

async function main() {
  // Signed out is refused, and refused as "signed out", not as a crash.
  const anon = await call('GET', '/me/saved')
  check(anon.status === 401 && anon.body?.error === 'signed_out', `no token → 401 signed_out (got ${anon.status})`)
  const junk = await call('GET', '/me/applications', 'not-a-token')
  check(junk.status === 401, `a junk token → 401 (got ${junk.status})`)

  const s = await sessionFor(env, FIXTURE)
  const uid = s.userId

  // Applications: the endpoint agrees with the table, row for row.
  const apps = await call('GET', '/me/applications', s.token)
  const dbApps = await rest(`job_applications?select=id,status&candidate_id=eq.${uid}`)
  check(apps.status === 200, `applications 200 (got ${apps.status})`)
  const got = (apps.body?.applications || []).map(a => a.id).sort()
  check(JSON.stringify(got) === JSON.stringify(dbApps.map(a => a.id).sort()),
    `applications match the table: ${got.length} returned, ${dbApps.length} in the table`)
  check((apps.body?.applications || []).every(a => a.statusLabel && a.stages?.length >= 1 && a.stages[0].key === 'applied'),
    'every application has a label and starts at Applied')
  const iso = v => v === null || /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  check((apps.body?.applications || []).every(a => iso(a.appliedAt) && a.stages.every(st => iso(st.at))),
    'every application date is ISO with milliseconds (what iOS parses)')
  for (const a of apps.body?.applications || []) console.log(`     ${a.statusLabel.padEnd(12)} ${a.title} · ${a.company}${a.job?.isClosed ? ' (closed)' : ''}`)

  // Saved: read, add one, add it again, remove it, and end where we started.
  const before = (await rest(`saved_jobs?select=job_id&candidate_id=eq.${uid}`)).map(r => r.job_id).sort()
  const saved0 = await call('GET', '/me/saved', s.token)
  check(saved0.status === 200, `saved 200 (got ${saved0.status})`)
  check(JSON.stringify((saved0.body?.saved || []).map(x => x.job.id).sort()) === JSON.stringify(before),
    `saved matches the table: ${before.length}`)

  // A live job the fixture has not saved. Saving is not applying: nobody is told.
  const live = await rest(`jobs?select=id,title&status=eq.active&limit=50`)
  const pick = live.find(j => !before.includes(j.id))
  if (!pick) { check(false, 'found a live job to save'); return }
  try {
    const put1 = await call('PUT', `/me/saved/${pick.id}`, s.token)
    const put2 = await call('PUT', `/me/saved/${pick.id}`, s.token)
    const rows = await rest(`saved_jobs?select=id&candidate_id=eq.${uid}&job_id=eq.${pick.id}`)
    check(put1.status === 200 && put2.status === 200 && rows.length === 1,
      `save twice → exactly one row (statuses ${put1.status}/${put2.status}, rows ${rows.length})`)
    const listed = await call('GET', '/me/saved', s.token)
    check((listed.body?.saved || []).some(x => x.job.id === pick.id), 'the saved job is listed with its advert')
  } finally {
    const del = await call('DELETE', `/me/saved/${pick.id}`, s.token)
    const left = await rest(`saved_jobs?select=id&candidate_id=eq.${uid}&job_id=eq.${pick.id}`)
    check(del.status === 200 && left.length === 0, `unsave → row gone (status ${del.status}, rows ${left.length})`)
    const after = (await rest(`saved_jobs?select=job_id&candidate_id=eq.${uid}`)).map(r => r.job_id).sort()
    check(JSON.stringify(after) === JSON.stringify(before), `fixture's saved set is as it was found (${after.length})`)
  }

  console.log(fail ? `\n${fail} FAILED` : '\nall passed')
  process.exitCode = fail ? 1 : 0
}
main().catch(e => { console.log('NOT VERIFIED:', e.message); process.exitCode = 2 })
