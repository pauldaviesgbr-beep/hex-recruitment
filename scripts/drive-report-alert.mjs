// node scripts/drive-report-alert.mjs <deployment-url>
//
// Proves a report reaches a person: file one report as the standing candidate
// fixture, ask the deployment to alert, and check the alert was recorded and
// emailed to Thrive exactly once. Then delete the report and assert it is gone.
//
// The target is an ARGUMENT, never a default (CLAUDE.md). The report is against
// Thrive Test Employer's own filled advert, so no real employer is involved, and
// the only email sent goes to Thrive's own inbox (REPORT_ALERT_TO).

import { loadEnv, sessionFor } from './lib/rls-probe.mjs'

const target = process.argv[2]
if (!target || !/^https:\/\//.test(target)) {
  console.log('SKIP: pass the deployment URL to drive')
  process.exit(2)
}
const env = loadEnv()
const FIXTURE = 'pauldavies.gbr+candidate@gmail.com'
const TEST_ADVERT = 'f5b4ecd6-26eb-4792-b364-b4085365acca' // Thrive Test Employer, filled
const site = target.replace(/\/$/, '')
const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET
const SB = env.NEXT_PUBLIC_SUPABASE_URL
const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }

let fail = 0
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fail++ }

async function call(path, { token, body, method = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (bypass) headers['x-vercel-protection-bypass'] = bypass
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(site + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try { json = await r.json() } catch {}
  return { status: r.status, body: json }
}
const rest = (p, init = {}) => fetch(`${SB}/rest/v1/${p}`, { ...init, headers: { ...svc, ...(init.headers || {}) } })

async function main() {
  check((await call('/api/report/alert', { body: { reportId: '00000000-0000-0000-0000-000000000000' } })).status === 401,
    'alert without signing in → 401')
  check((await call('/api/cron/report-alerts', { method: 'GET' })).status === 401, 'sweep without the cron secret → 401')

  const s = await sessionFor(env, FIXTURE)
  check((await call('/api/report/alert', { token: s.token, body: { reportId: '11111111-1111-1111-1111-111111111111' } })).status === 404,
    'alert for a report that is not yours → 404')

  // File it exactly as ReportControl does: as the user, under RLS.
  const ins = await fetch(`${SB}/rest/v1/content_reports?select=id`, {
    method: 'POST',
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ reporter_id: s.userId, target_type: 'job', target_id: TEST_ADVERT, reason: 'Something else', detail: 'drive-report-alert: automated check, please ignore' }),
  })
  const reportId = (await ins.json())?.[0]?.id
  check(ins.status === 201 && !!reportId, `report filed as the fixture (status ${ins.status})`)
  if (!reportId) return

  const startedAt = new Date().toISOString()
  try {
    const first = await call('/api/report/alert', { token: s.token, body: { reportId } })
    check(first.status === 200 && first.body?.outcome === 'sent', `first alert → sent (got ${first.status} ${first.body?.outcome})`)
    const second = await call('/api/report/alert', { token: s.token, body: { reportId } })
    check(second.body?.outcome === 'already', `second alert → already, so no second email (got ${second.body?.outcome})`)

    const row = (await (await rest(`content_reports?select=alerted_at&id=eq.${reportId}`)).json())[0]
    check(!!row?.alerted_at, `alerted_at is set (${row?.alerted_at})`)

    const logs = await (await rest(`email_log?select=recipient,success,created_at&email_type=eq.report_alert&created_at=gte.${startedAt}`)).json()
    check(logs.length === 1 && logs[0].success === true, `exactly one report_alert email logged, and it succeeded (${logs.length})`)
    if (logs[0]) console.log(`     sent to ${logs[0].recipient}`)
  } finally {
    await rest(`content_reports?id=eq.${reportId}`, { method: 'DELETE' })
    const left = await (await rest(`content_reports?select=id&id=eq.${reportId}`)).json()
    check(left.length === 0, 'the drive\'s report is deleted')
  }

  console.log(fail ? `\n${fail} FAILED` : '\nall passed')
  process.exitCode = fail ? 1 : 0
}
main().catch(e => { console.log('NOT VERIFIED:', e.message); process.exitCode = 2 })
