// A BLOCKED CONVERSATION REFUSES NEW MESSAGES, IN BOTH DIRECTIONS — AND AN
// UNBLOCKED ONE STILL WORKS.
//
//   node scripts/prove-block-refuses-messages.mjs
//
// Skips (exit 2) without credentials. Cleans up everything it writes.
//
// ── THE FIRST ASSERTION IS THE REGRESSION CHECK, AND IT IS THE POINT ──────
//
// Blocking is enforced by one clause added to the `messages` INSERT policy —
// the policy that governs EVERY send in the product. A mistake there does not
// break blocking; it breaks MESSAGING, silently, for everybody. So this proves
// an ordinary send still succeeds BEFORE it proves anything about blocking. If
// that first line is red, nothing else here matters.
//
// ── WHY IT IS DONE THROUGH A REAL SESSION ────────────────────────────────
//
// The service role BYPASSES RLS. A proof written with the admin client would
// insert happily in every state and report a working block that does not
// exist — the exact false pass this project keeps finding. Every write here
// goes through `rls-probe`, as a signed-in person, which is the only client
// the policy applies to.
//
// ── AND IT ASKS ABOUT THE WRITE, NOT THE READ-BACK ───────────────────────
//
// probeWrite sends with `return=minimal` and asks the read-back separately, so
// a "violates row-level security" coming from a SELECT can never masquerade as
// a refused INSERT. That distinction is why this file uses the helper rather
// than a hand-rolled client.

import { createClient } from '@supabase/supabase-js'
import { loadEnv, sessionFor, probeWrite } from './lib/rls-probe.mjs'

let env
try { env = loadEnv() } catch (e) {
  console.log('SKIP  ' + e.message)
  console.log('      This is NOT a pass. Nothing was checked.')
  process.exit(2)
}

const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE) {
  console.log('SKIP  no service key — teardown could not be guaranteed, so nothing was written.')
  process.exit(2)
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, SERVICE, { auth: { persistSession: false } })

const CANDIDATE_EMAIL = 'pauldavies.gbr+candidate@gmail.com'
const EMPLOYER_EMAIL = 'pauldavies.gbr+employer@gmail.com'

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(60) + (detail ?? ''))
}


async function main() {
  let convId = null
  try {
    const candidate = await sessionFor(env, CANDIDATE_EMAIL)
    const employer = await sessionFor(env, EMPLOYER_EMAIL)
    const candidateId = candidate.userId
    const employerId = employer.userId

    // A THROWAWAY THREAD, not the fixture one. This test blocks and unblocks,
    // and doing that to a thread other checks rely on would couple them.
    const { data: conv, error: cErr } = await admin.from('conversations').insert({
      participant_1: employerId, participant_2: candidateId,
      participant_1_name: 'Test Employer', participant_1_role: 'employer',
      participant_2_name: 'Test Candidate', participant_2_role: 'candidate',
      last_message: 'probe', last_message_at: new Date().toISOString(),
    }).select('id').single()
    if (cErr) throw new Error('could not create the probe thread: ' + cErr.message)
    convId = conv.id

    const send = (session, who) => probeWrite(env, {
      kind: 'insert',
      table: 'messages',
      payload: {
        conversation_id: convId,
        sender_id: session.userId,
        sender_name: who,
        sender_role: who === 'candidate' ? 'candidate' : 'employer',
        content: `probe from ${who}`,
      },
      auth: session,
    })

    // ── 1. THE REGRESSION CHECK ────────────────────────────────────────
    const before = await send(candidate, 'candidate')
    check('AN ORDINARY SEND STILL WORKS — messaging is not broken',
      before.writeAllowed === true, before.verdict)


    const beforeEmp = await send(employer, 'employer')
    check('…and from the employer side too', beforeEmp.writeAllowed === true, beforeEmp.verdict)


    // ── 2. THE CANDIDATE BLOCKS THE EMPLOYER ───────────────────────────
    await admin.from('user_blocks').insert({ blocker_id: candidateId, blocked_id: employerId })

    const empBlocked = await send(employer, 'employer')
    check('THE BLOCKED PERSON CANNOT SEND', empBlocked.writeAllowed === false, empBlocked.verdict)
    check('…and it was RLS that refused, not a constraint',
      empBlocked.writeRefusedBy === 'rls', String(empBlocked.writeRefusedBy))

    // THE HALF THAT IS EASY TO GET WRONG. A block that only stops the blocked
    // person is a mute, not a block: the two would still share a thread one of
    // them could keep writing into.
    const candBlocked = await send(candidate, 'candidate')
    check('AND THE BLOCKER CANNOT SEND EITHER — both ways, not a mute',
      candBlocked.writeAllowed === false, candBlocked.verdict)

    // ── 3. THE OTHER DIRECTION OF THE SAME ROW ─────────────────────────
    await admin.from('user_blocks').delete().eq('blocker_id', candidateId)
    await admin.from('user_blocks').insert({ blocker_id: employerId, blocked_id: candidateId })

    const candBlocked2 = await send(candidate, 'candidate')
    check('with the EMPLOYER as blocker, the candidate is refused',
      candBlocked2.writeAllowed === false, candBlocked2.verdict)
    const empBlocked2 = await send(employer, 'employer')
    check('…and so is the employer who blocked them',
      empBlocked2.writeAllowed === false, empBlocked2.verdict)

    // ── 4. UNBLOCKING RESTORES IT ──────────────────────────────────────
    // Without this the whole thing passes on a policy that refuses everybody.
    await admin.from('user_blocks').delete().eq('blocker_id', employerId)
    const after = await send(candidate, 'candidate')
    check('UNBLOCKING RESTORES SENDING — the policy is not just refusing everyone',
      after.writeAllowed === true, after.verdict)


    // ── 5. AND A REPORT CAN ACTUALLY BE FILED ──────────────────────────
    // The control writes straight to `content_reports` through RLS — there is
    // no route — so the policy IS the feature. Proven the same way: as a
    // signed-in person, not as the service role.
    const report = await probeWrite(env, {
      kind: 'insert',
      table: 'content_reports',
      payload: {
        reporter_id: candidateId,
        target_type: 'message',
        target_id: convId,
        reason: 'It is spam or a scam',
        detail: 'probe',
      },
      auth: candidate,
    })
    check('A REPORT CAN BE FILED by a signed-in person',
      report.writeAllowed === true, report.verdict)

    // AND NOBODY ELSE CAN READ IT. A report the reported party can see is
    // worse than no report control at all.
    const asEmployer = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${employer.token}` } },
      auth: { persistSession: false },
    })
    const { data: theirView } = await asEmployer.from('content_reports')
      .select('id').eq('target_id', convId)
    check('…and the OTHER party cannot read it', (theirView || []).length === 0,
      `${(theirView || []).length} visible to them`)

    const asCandidate = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${candidate.token}` } },
      auth: { persistSession: false },
    })
    const { data: ownView } = await asCandidate.from('content_reports')
      .select('id').eq('target_id', convId)
    check('…while the reporter can read their own back',
      (ownView || []).length === 1, `${(ownView || []).length}`)

  } catch (e) {
    check('the proof ran to completion', false, e.message)
  } finally {
    await admin.from('content_reports').delete().eq('detail', 'probe').then(() => {}, () => {})
    await admin.from('user_blocks').delete().neq('blocker_id', '00000000-0000-0000-0000-000000000000')
      .then(() => {}, () => {})
    if (convId) {
      await admin.from('messages').delete().eq('conversation_id', convId).then(() => {}, () => {})
      await admin.from('conversations').delete().eq('id', convId).then(() => {}, () => {})
      const { data: left } = await admin.from('conversations').select('id').eq('id', convId).maybeSingle()
      check('teardown: the probe thread is gone', !left, left ? 'STILL THERE' : 'gone')
    }
    const { count: reportsLeft } = await admin.from('content_reports')
      .select('*', { count: 'exact', head: true })
    check('teardown: no probe reports left behind', (reportsLeft || 0) === 0, `${reportsLeft}`)
    const { count: blocksLeft } = await admin.from('user_blocks')
      .select('*', { count: 'exact', head: true })
    check('teardown: no blocks left behind', (blocksLeft || 0) === 0, `${blocksLeft}`)
  }

  console.log('')
  console.log(bad ? `${bad} FAILED` : 'a block stops messages both ways, and unblocking restores them')
  process.exit(bad ? 1 : 0)
}

main()
