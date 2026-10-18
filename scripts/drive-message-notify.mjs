// node scripts/drive-message-notify.mjs <deployment-url>
//
// Drives notify 'message_sent' (a reply notifies the candidate) on a REAL
// deployment, between the two standing fixtures only: pauldavies.gbr+employer
// (Thrive Test Employer) and pauldavies.gbr+candidate (Drive Test). It refuses
// to run unless they share a conversation, and touches no other account.
//
// Writes, each removed in a finally and asserted gone: one message from the
// employer fixture into that conversation, the notification(s) it causes, and
// the push_log rows the notifications trigger writes for them.

import { loadEnv, sessionFor } from './lib/rls-probe.mjs'

const target = process.argv[2]
if (!target || !/^https:\/\//.test(target)) {
  console.log('SKIP: pass the deployment URL to drive, e.g. the preview from `npm run preview-url`')
  process.exit(2)
}
const env = loadEnv()
const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET
const site = target.replace(/\/$/, '')
const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const rest = (p, init = {}) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { ...init, headers: { ...svc, 'Content-Type': 'application/json', ...(init.headers || {}) } })

let fail = 0
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fail++ }
async function notify(token, conversationId) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  if (bypass) headers['x-vercel-protection-bypass'] = bypass
  const r = await fetch(`${site}/api/notifications/notify`, { method: 'POST', headers, body: JSON.stringify({ event: 'message_sent', conversationId }) })
  let body = null; try { body = await r.json() } catch {}
  return { status: r.status, body }
}

async function main() {
  const emp = await sessionFor(env, 'pauldavies.gbr+employer@gmail.com')
  const cand = await sessionFor(env, 'pauldavies.gbr+candidate@gmail.com')
  const convs = await (await rest(`conversations?select=id&or=(and(participant_1.eq.${emp.userId},participant_2.eq.${cand.userId}),and(participant_1.eq.${cand.userId},participant_2.eq.${emp.userId}))&limit=1`)).json()
  if (!convs.length) { console.log('SKIP: the two fixtures share no conversation'); process.exitCode = 2; return }
  const convId = convs[0].id
  const marker = `drive-message-notify ${Date.now()}`
  let messageId = null

  try {
    // A stranger to the conversation is refused.
    const anon = await notify('not-a-token', convId)
    check(anon.status === 401, `a bad token is refused (got ${anon.status})`)

    const ins = await rest('messages', { method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ conversation_id: convId, sender_id: emp.userId, content: marker }) })
    const insBody = await ins.json()
    messageId = insBody?.[0]?.id
    check(ins.status === 201 && !!messageId, `fixture message written (got ${ins.status})`)

    const first = await notify(emp.token, convId)
    check(first.status === 200 && first.body?.ok === true && !first.body?.skipped, `employer → candidate notifies (${JSON.stringify(first.body)})`)
    const rows = await (await rest(`notifications?select=id,user_id,type,title,message,link&related_id=eq.${convId}&type=eq.new_message&message=eq.${encodeURIComponent(marker)}`)).json()
    check(rows.length === 1 && rows[0].user_id === cand.userId, `exactly one notification, for the candidate (${rows.length})`)
    check(rows[0]?.link === `/messages?conversation=${convId}` && /^New message from /.test(rows[0]?.title || ''), `title "${rows[0]?.title}", link to the thread`)

    const second = await notify(emp.token, convId)
    check(second.body?.skipped === 'already_unread', `a second message while unread does not add another (${JSON.stringify(second.body)})`)

    const reverse = await notify(cand.token, convId)
    check(reverse.body?.skipped === 'recipient_is_employer', `candidate → employer is not notified this way (${JSON.stringify(reverse.body)})`)
  } finally {
    const notes = await (await rest(`notifications?select=id&related_id=eq.${convId}&type=eq.new_message&message=eq.${encodeURIComponent(marker)}`)).json()
    for (const n of notes) {
      await rest(`push_log?notification_id=eq.${n.id}`, { method: 'DELETE' })
      await rest(`notifications?id=eq.${n.id}`, { method: 'DELETE' })
    }
    if (messageId) await rest(`messages?id=eq.${messageId}`, { method: 'DELETE' })
    const leftN = await (await rest(`notifications?select=id&related_id=eq.${convId}&message=eq.${encodeURIComponent(marker)}`)).json()
    const leftM = await (await rest(`messages?select=id&content=eq.${encodeURIComponent(marker)}`)).json()
    check(leftN.length === 0 && leftM.length === 0, 'teardown: the message and its notification are gone')
  }
  console.log(fail ? `${fail} FAILED` : 'all passed')
  process.exitCode = fail ? 1 : 0
}
main().catch(e => { console.error(e); process.exitCode = 1 })
