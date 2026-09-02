// THE CONTRACT AND THE MESSAGES SURVIVE AN ERASURE — READ BACK FROM THE ROWS.
//
//   npx tsx --conditions=react-server scripts/prove-erasure-tombstone-live.ts
//
// Skips (exit 2) without service credentials, as erasurelive:prove does.
//
// ── WHY THE PLAN PROOF CANNOT COVER THIS ──────────────────────────────────
//
// `erasure:prove` reads the RULES. It would pass on the state that shipped for
// months: the messages rule said `content = '[deleted]'` and the job_offers
// rule said "the contract is kept", and both were true of the plan and false of
// the database — `messages.sender_id` and `job_offers.candidate_id` are NOT
// NULL with ON DELETE CASCADE, so both rows were destroyed by the last step of
// the erasure instead. Nothing in the plan can see that. Only a real erasure,
// followed by a real SELECT, can.
//
// So this creates a throwaway candidate with a message and a signed offer,
// erases them, and reads every row back.
//
// ── IT BUILDS ITS OWN TARGET ──────────────────────────────────────────────
//
// No argument, no default, nothing to mistype at a real account: it creates the
// person it destroys. Everything it makes, it removes, and the teardown is
// asserted rather than assumed.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { eraseAccount } from '../lib/eraseAccount'
import { TOMBSTONE_USER_ID, TOMBSTONE_EMAIL } from '../lib/protectedAccounts'

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
const EMPLOYER = 'dda822a2-7fc1-4d6d-b208-66e8c021630a'   // Thrive Test Employer's owner

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(62) + (detail ?? ''))
}

async function main() {
  const stamp = Date.now()
  // THE DOMAIN IS THE DISCRIMINATOR, AND IT HAS TO BE PER-RUN.
  // `user_departures` records the email DOMAIN and a fixed zero uuid, so a
  // row written by this proof and one written by prove-erasure-employer-live
  // or prove-null-author-render — both of which call eraseAccount, and all
  // three of which `verify` runs CONCURRENTLY — are identical on every column
  // this script used to filter on. It counted its siblings' rows and its
  // teardown DELETED them. Observed 2 Sept 2026: `teardown: the proof's
  // departure row is gone   2 left`, on a push hook, with the database
  // measured clean afterwards.
  const DOMAIN = `tombstone-proof-${stamp}.invalid`
  const email = `proof@${DOMAIN}`
  const SIGNED_AS = `Proof Runner ${stamp}`
  const SAID = `I am very interested in this role. ${stamp}`
  let userId: string | null = null
  let convId: string | null = null
  let msgId: string | null = null
  let offerId: string | null = null
  let jobId: string | null = null
  let appId: string | null = null

  try {
    // ── THE TOMBSTONE CONSTANT MATCHES THE LIVE ACCOUNT ─────────────────
    // Asserted BEFORE anything is erased. A drifted constant would point every
    // repointed row at a uuid belonging to nobody — and because it is still a
    // valid uuid, NOT NULL would not catch it and the write would succeed.
    const { data: tomb } = await admin.auth.admin.getUserById(TOMBSTONE_USER_ID)
    check('TOMBSTONE_USER_ID resolves to a real account', !!tomb?.user, TOMBSTONE_USER_ID)
    check('…and it is the .invalid address the constant names',
      tomb?.user?.email === TOMBSTONE_EMAIL, tomb?.user?.email)
    const bannedUntil = (tomb?.user as any)?.banned_until
    check('…and it is still banned, so nobody can sign in as it',
      !!bannedUntil && new Date(bannedUntil) > new Date(), String(bannedUntil))

    // ── BUILD A CANDIDATE WITH THE TWO THINGS THAT USED TO BE DESTROYED ──
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { role: 'employee' },
    })
    if (cErr || !created.user) throw new Error('could not create the candidate: ' + cErr?.message)
    userId = created.user.id

    const { data: job } = await admin.from('jobs')
      .select('id').eq('employer_id', EMPLOYER).limit(1).single()
    if (!job) throw new Error('no Thrive Test Employer job to hang the offer on')
    jobId = job.id as string

    const { data: conv, error: convErr } = await admin.from('conversations').insert({
      participant_1: userId, participant_2: EMPLOYER,
      participant_1_name: 'Proof Runner', participant_1_role: 'candidate',
      participant_2_name: 'Test Employer', participant_2_role: 'employer',
      last_message: SAID, last_message_at: new Date().toISOString(),
    }).select('id').single()
    if (convErr || !conv) throw new Error('could not create the conversation: ' + convErr?.message)
    convId = conv.id as string

    const { data: msg, error: mErr } = await admin.from('messages').insert({
      conversation_id: convId, sender_id: userId, sender_name: 'Proof Runner',
      sender_role: 'candidate', content: SAID, is_read: true,
    }).select('id').single()
    if (mErr || !msg) throw new Error('could not create the message: ' + mErr?.message)
    msgId = msg.id as string

    // job_offers has SEVEN NOT NULL columns with no default — application_id,
    // job_id, employer_id, candidate_id, salary, start_date, contract_type.
    // Listed here from information_schema rather than discovered one failed run
    // at a time, which is how the first two were found.
    const { data: app, error: aErr } = await admin.from('job_applications').insert({
      job_id: jobId, candidate_id: userId, status: 'pending',
    }).select('id').single()
    if (aErr || !app) throw new Error('could not create the application: ' + aErr?.message)
    appId = app.id as string

    const { data: offer, error: oErr } = await admin.from('job_offers').insert({
      job_id: jobId, employer_id: EMPLOYER, candidate_id: userId, status: 'accepted',
      application_id: appId,
      salary: '£32,000 per year', start_date: '2026-10-01', contract_type: 'full-time',  // CHECK constraint: full-time|part-time|temporary|fixed-term|zero-hours|casual
      signature_name: SIGNED_AS,
      signature_timestamp: new Date().toISOString(),
      signature_ip: '203.0.113.7',
      signature_user_agent: 'proof-runner/1.0',
    }).select('id').single()
    if (oErr || !offer) throw new Error('could not create the offer: ' + oErr?.message)
    offerId = offer.id as string

    // Scoped to OUR domain, so a sibling erasing at the same moment cannot
    // move it. A global count is what made `beforeDepartures + 1` a race
    // rather than an assertion.
    const beforeDepartures = (await admin.from('user_departures')
      .select('*', { count: 'exact', head: true })
      .eq('email_domain', DOMAIN)).count || 0

    // ── ERASE ────────────────────────────────────────────────────────────
    const receipt = await eraseAccount(admin, userId, { email })
    check('the erasure reported no errors', receipt.errors.length === 0, receipt.errors.join('; '))
    check('the login is gone', receipt.authDeleted)

    // ── READ THE ROWS BACK ───────────────────────────────────────────────

    const { data: msgAfter } = await admin.from('messages')
      .select('id, sender_id, sender_name, content').eq('id', msgId).maybeSingle()
    check('THE MESSAGE STILL EXISTS — it used to be destroyed by the cascade',
      !!msgAfter, msgAfter ? 'present' : 'GONE')
    check('…its sender is the tombstone, not the deleted person',
      msgAfter?.sender_id === TOMBSTONE_USER_ID, String(msgAfter?.sender_id))
    check('…its words are gone', msgAfter?.content === '[deleted]', String(msgAfter?.content))
    check('…and its denormalised sender_name no longer names them',
      msgAfter?.sender_name === 'Deleted account', String(msgAfter?.sender_name))

    const { data: offerAfter } = await admin.from('job_offers')
      .select('id, candidate_id, signature_name, signature_ip, signature_user_agent')
      .eq('id', offerId).maybeSingle()
    check('THE SIGNED CONTRACT STILL EXISTS — it used to be destroyed',
      !!offerAfter, offerAfter ? 'present' : 'GONE')
    check('…its candidate is the tombstone', offerAfter?.candidate_id === TOMBSTONE_USER_ID,
      String(offerAfter?.candidate_id))
    check('…THE SIGNED NAME SURVIVES — a contract signed by nobody is not a contract',
      offerAfter?.signature_name === SIGNED_AS, String(offerAfter?.signature_name))
    check('…but the surveillance columns are cleared',
      offerAfter?.signature_ip == null && offerAfter?.signature_user_agent == null,
      `ip=${offerAfter?.signature_ip} ua=${offerAfter?.signature_user_agent}`)

    // ── THE TRACE ────────────────────────────────────────────────────────
    const { data: departures, count: afterCount } = await admin.from('user_departures')
      .select('user_id, email_domain, role, reason, days_held', { count: 'exact' })
      .eq('reason', 'self_deleted').eq('email_domain', DOMAIN)
      .order('departed_at', { ascending: false }).limit(1)
    check('A DEPARTURE ROW WAS WRITTEN — an erasure used to leave no trace at all',
      (afterCount || 0) > 0 && (await admin.from('user_departures')
        .select('*', { count: 'exact', head: true })
        .eq('email_domain', DOMAIN)).count === beforeDepartures + 1,
      `${beforeDepartures} → ${(await admin.from('user_departures')
        .select('*', { count: 'exact', head: true })
        .eq('email_domain', DOMAIN)).count}`)
    const dep = departures?.[0]
    check('…it carries the email DOMAIN only', dep?.email_domain === DOMAIN, String(dep?.email_domain))
    check('…and NOT the person\'s user id', dep?.user_id === '00000000-0000-0000-0000-000000000000',
      String(dep?.user_id))

  } catch (e: any) {
    check('the proof ran to completion', false, e.message)
  } finally {
    // ── TEARDOWN ─────────────────────────────────────────────────────────
    // The message and the offer OUTLIVE the erasure by design, so they are the
    // two things that must be cleaned up by hand — and the conversation with
    // them, since it is ours and would otherwise sit in the test employer's
    // inbox forever.
    if (offerId) await admin.from('job_offers').delete().eq('id', offerId).then(() => {}, () => {})
    if (appId) await admin.from('job_applications').delete().eq('id', appId).then(() => {}, () => {})
    if (msgId) await admin.from('messages').delete().eq('id', msgId).then(() => {}, () => {})
    if (convId) await admin.from('conversations').delete().eq('id', convId).then(() => {}, () => {})
    // ONLY OUR OWN. The previous filter was reason + gmail.com + the zero
    // uuid, every part of which a SIBLING proof's row also satisfies — so
    // this delete used to destroy another running proof's audit row.
    await admin.from('user_departures').delete()
      .eq('reason', 'self_deleted').eq('email_domain', DOMAIN)
      .eq('user_id', '00000000-0000-0000-0000-000000000000').then(() => {}, () => {})
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {})

    // PROVE THE TEARDOWN. An orphan offer or a stray message left in the test
    // employer's inbox by a proof is exactly the mess this project keeps
    // finding months later.
    for (const [label, table, id] of [
      ['offer', 'job_offers', offerId], ['message', 'messages', msgId],
      ['conversation', 'conversations', convId],
    ] as const) {
      if (!id) continue
      const { data: left } = await admin.from(table).select('id').eq('id', id).maybeSingle()
      check(`teardown: the throwaway ${label} is gone`, !left, left ? 'STILL THERE' : 'gone')
    }
    const { count: leftDep } = await admin.from('user_departures')
      .select('*', { count: 'exact', head: true })
      .eq('reason', 'self_deleted').eq('email_domain', DOMAIN)
    check('teardown: the proof\'s departure row is gone', (leftDep || 0) === 0, `${leftDep} left`)
  }

  console.log('')
  console.log(bad ? `${bad} FAILED` : 'the contract and the messages survive, and the erasure leaves a trace')
  process.exit(bad ? 1 : 0)
}

main()
