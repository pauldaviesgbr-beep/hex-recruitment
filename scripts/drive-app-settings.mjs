// node scripts/drive-app-settings.mjs <deployment-url>
//
// Drives the native Settings endpoints (design S1–S3) on a REAL deployment, as
// the standing candidate fixture (pauldavies.gbr+candidate@ — Drive Test,
// is_test). The target is an ARGUMENT, never a default.
//
// Writes: the fixture's notification_preferences, flipped and RESTORED
// VERBATIM from what was read first, in a finally.
// Delete is exercised ONLY with a wrong confirmation word, which the route
// refuses before it reads or writes anything (app/api/account/delete: the
// confirm check precedes every query). A real delete would erase the fixture.

import { loadEnv, sessionFor } from './lib/rls-probe.mjs'

const target = process.argv[2]
if (!target || !/^https:\/\//.test(target)) {
  console.log('SKIP: pass the deployment URL to drive, e.g. the preview from `npm run preview-url`')
  process.exit(2)
}
const env = loadEnv()
const FIXTURE = 'pauldavies.gbr+candidate@gmail.com'
const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET
const site = target.replace(/\/$/, '')

let fail = 0
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fail++ }

async function call(method, path, token, json) {
  const headers = {}
  if (bypass) headers['x-vercel-protection-bypass'] = bypass
  if (token) headers.Authorization = `Bearer ${token}`
  if (json) headers['Content-Type'] = 'application/json'
  const r = await fetch(site + path, { method, headers, body: json ? JSON.stringify(json) : undefined })
  let body = null
  try { body = await r.json() } catch {}
  return { status: r.status, body }
}

const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const rest = (p, init = {}) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { ...init, headers: { ...svc, ...(init.headers || {}) } })
const count = async p => Number((await rest(p, { method: 'HEAD', headers: { Prefer: 'count=exact' } })).headers.get('content-range')?.split('/')[1])

async function main() {
  const anon = await call('GET', '/api/app/me/settings')
  check(anon.status === 401 && anon.body?.error === 'signed_out', `settings, no token → 401 (got ${anon.status})`)

  const { token, userId } = await sessionFor(env, FIXTURE)
  const row = (await (await rest(`candidate_profiles?user_id=eq.${userId}&select=notification_preferences`)).json())[0]
  const before = row.notification_preferences
  console.log(`prefs as found: ${JSON.stringify(before?.push)}`)

  try {
    const s = await call('GET', '/api/app/me/settings', token)
    check(s.status === 200, `settings → 200 (got ${s.status})`)
    const b = s.body || {}
    console.log(`  says: email=${b.email} providers=${JSON.stringify(b.providers)} hasPassword=${b.hasPassword} counts=${JSON.stringify(b.counts)}`)
    check(b.email === FIXTURE, 'the email is the account\'s')
    check(Array.isArray(b.providers) && b.providers.length > 0, 'at least one sign-in method is named')

    // The counts agree with the rows, read independently with the service role.
    const saved = await count(`saved_jobs?candidate_id=eq.${userId}&select=id`)
    const apps = await count(`job_applications?candidate_id=eq.${userId}&select=id`)
    const convs = await count(`conversations?or=(participant_1.eq.${userId},participant_2.eq.${userId})&select=id`)
    check(b.counts?.savedJobs === saved, `saved jobs ${b.counts?.savedJobs} = rows ${saved}`)
    check(b.counts?.applications === apps, `applications ${b.counts?.applications} = rows ${apps}`)
    check(b.counts?.conversations === convs, `conversations ${b.counts?.conversations} = rows ${convs}`)
    check(b.confirmWord === 'DELETE' && /This cannot be undone\.$/.test(b.deleteText || ''), 'the website\'s word and sentence come with it')

    // S2's two switches land on the push preferences, and nothing else moves.
    const flipped = !(before?.push?.new_messages ?? true)
    const n = await call('PUT', '/api/app/me/notifications', token, { replies: flipped })
    const after = (await (await rest(`candidate_profiles?user_id=eq.${userId}&select=notification_preferences`)).json())[0].notification_preferences
    check(n.status === 200 && after.push.new_messages === flipped, `replies → ${flipped} lands (got ${n.status})`)
    const others = o => JSON.stringify(Object.fromEntries(Object.entries(o || {}).filter(([k]) => k !== "push")))
    check(others(after) === others(before) && after.push.application_updates === before?.push?.application_updates,
      "every other preference, and the other switch, exactly as stored")
    const bad = await call('PUT', '/api/app/me/notifications', token, { replies: 'yes' })
    check(bad.status === 400, `a non-boolean is refused (got ${bad.status})`)

    // Delete: the website's endpoint answers the app's token, and refuses a wrong word.
    const del = await call('POST', '/api/account/delete', token, { confirm: 'delete please' })
    check(del.status === 400 && /Type DELETE to confirm/.test(del.body?.error || ''), `wrong word → 400 "${del.body?.error}"`)
    const still = await count(`candidate_profiles?user_id=eq.${userId}&select=user_id`)
    check(still === 1, 'the fixture still exists')
  } finally {
    const r = await rest(`candidate_profiles?user_id=eq.${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ notification_preferences: before }),
    })
    const end = (await (await rest(`candidate_profiles?user_id=eq.${userId}&select=notification_preferences`)).json())[0].notification_preferences
    check(r.status === 204 && JSON.stringify(end) === JSON.stringify(before), 'teardown: preferences exactly as found')
  }
  console.log(fail ? `${fail} FAILED` : 'all passed')
  process.exitCode = fail ? 1 : 0
}
main().catch(e => { console.error(e); process.exitCode = 1 })
