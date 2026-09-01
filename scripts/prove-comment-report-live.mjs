// A SHIFT COMMENT CAN REALLY BE REPORTED — THROUGH RLS, AS A SIGNED-IN PERSON,
// AGAINST A THROWAWAY POST THAT IS TORN DOWN.
//
//   node scripts/prove-comment-report-live.mjs
//
// Skips (exit 2) without credentials. Cleans up everything it writes.
//
// ── WHY THIS EXISTS SEPARATELY FROM reportcontrol:prove ──────────────────
//
// `reportcontrol:prove` reads files. It can say every comment renderer mounts
// the shared control and it cannot say the write would be accepted — the
// target_type CHECK constraint lives in the database, and a control wired to a
// value the constraint refuses looks perfect in the source and fails at the
// moment somebody taps it. That is the one failure a filesystem check is
// structurally unable to see.
//
// ── THE POST IS A THROWAWAY, AND THAT IS ASSERTED, NOT INTENDED ──────────
//
// There is exactly ONE live shift post on this board and it belongs to Neway
// International, a real employer. So this creates its own post owned by the
// Thrive Test Employer fixture, refuses to comment on anything that is not the
// row it just created, and asserts at teardown that the board is byte for byte
// the list it found — ids and statuses — rather than merely the right length.
//
// ── AND THE COMMENT IS MADE BY THE POST'S OWNER, DELIBERATELY ────────────
//
// `trg_temp_comment_notify` has two branches. A comment by someone OTHER than
// the owner inserts a notification for the employer, and `notifications` has
// its own trigger that POSTs to the web-push dispatcher — a real push to a real
// device. A comment BY the owner takes the other branch, which notifies the
// other people in the thread and anyone who registered interest; on a post
// created seconds ago there are none of either, so it notifies nobody. That is
// asserted below rather than trusted.
//
// The reporting direction is the realistic one anyway: a candidate reporting
// something an employer wrote.
//
// ── THE NEGATIVE HALF IS THE POINT ───────────────────────────────────────
//
// "A comment report is accepted" passes just as happily on a table with no
// CHECK constraint at all. So this also files a report with a target_type the
// constraint does not list, and requires that one to be REFUSED — and refused
// by the CONSTRAINT rather than by RLS, which are different answers.

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
const MARKER = 'comment-report probe — delete me'

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(62) + (detail ?? ''))
}

async function main() {
  let postId = null
  let commentId = null

  // READ THE BOARD BEFORE TOUCHING IT. The teardown compares against this, so
  // "the real post is untouched" is a measurement rather than an assumption.
  const { data: liveBefore } = await admin.from('temp_posts').select('id, status')
  const before = (liveBefore || []).map(p => `${p.id}:${p.status}`).sort().join(',')
  console.log(`the board holds ${(liveBefore || []).length} shift post(s) before this runs`)
  console.log('')

  try {
    const candidate = await sessionFor(env, CANDIDATE_EMAIL)
    const employer = await sessionFor(env, EMPLOYER_EMAIL)

    // ── A THROWAWAY POST ────────────────────────────────────────────────
    const { data: post, error: pErr } = await admin.from('temp_posts').insert({
      employer_id: employer.userId,
      title: MARKER,
      category: 'other',
      location_area: 'London',
      company_name: 'Thrive Test Employer',
      headcount: 1,
      status: 'open',
    }).select('id, employer_id, title').single()
    if (pErr) throw new Error('could not create the probe post: ' + pErr.message)
    postId = post.id

    // THE GUARD THAT MAKES THE REST SAFE. Everything below writes against
    // postId; if it is not the row we just made, nothing else may run.
    if (post.employer_id !== employer.userId || post.title !== MARKER) {
      throw new Error('the probe post is not ours — refusing to comment on it')
    }
    check('the post under test is the throwaway, not a real one', true,
      `${postId} owned by the employer fixture`)

    // ── A COMMENT ON IT, BY ITS OWNER, THROUGH RLS ──────────────────────
    const comment = await probeWrite(env, {
      kind: 'insert',
      table: 'temp_post_comments',
      payload: { post_id: postId, user_id: employer.userId, body: 'probe comment' },
      auth: employer,
    })
    check('A COMMENT CAN BE POSTED by a signed-in person',
      comment.writeAllowed === true, comment.verdict)

    const { data: cRow } = await admin.from('temp_post_comments')
      .select('id').eq('post_id', postId).maybeSingle()
    commentId = cRow?.id || null
    check('…and it is really in the table', !!commentId, commentId || 'no row')
    if (!commentId) throw new Error('no comment to report')

    // NOBODY WAS NOTIFIED. The owner-comment branch had nobody to tell, and
    // this asserts it rather than trusting my reading of the trigger.
    const { count: notifs } = await admin.from('notifications')
      .select('*', { count: 'exact', head: true }).eq('related_id', String(postId))
    check('nobody was notified by the probe comment', (notifs || 0) === 0,
      `${notifs || 0} notifications`)

    // ── THE CANDIDATE REPORTS IT ────────────────────────────────────────
    const report = await probeWrite(env, {
      kind: 'insert',
      table: 'content_reports',
      payload: {
        reporter_id: candidate.userId,
        target_type: 'comment',
        target_id: commentId,
        reason: 'It is abusive or threatening',
        detail: MARKER,
      },
      auth: candidate,
    })
    check('A COMMENT REPORT IS ACCEPTED by the database',
      report.writeAllowed === true, report.verdict)

    // ── THE NEGATIVE HALF ───────────────────────────────────────────────
    // Without this, the line above passes on a table with no CHECK at all.
    const bogus = await probeWrite(env, {
      kind: 'insert',
      table: 'content_reports',
      payload: {
        reporter_id: candidate.userId,
        target_type: 'profile',
        target_id: commentId,
        reason: 'It is abusive or threatening',
        detail: MARKER,
      },
      auth: candidate,
    })
    check('AN UNLISTED target_type IS REFUSED — the CHECK is real',
      bogus.writeAllowed === false, bogus.verdict)
    check('…and it was the CONSTRAINT that refused, not RLS',
      bogus.writeRefusedBy === 'constraint', String(bogus.writeRefusedBy))

    // ── WHO CAN SEE IT ──────────────────────────────────────────────────
    const asEmployer = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${employer.token}` } },
      auth: { persistSession: false },
    })
    const { data: theirView } = await asEmployer.from('content_reports')
      .select('id').eq('target_id', commentId)
    check('the reported party cannot read the report', (theirView || []).length === 0,
      `${(theirView || []).length} visible to them`)

    const asCandidate = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${candidate.token}` } },
      auth: { persistSession: false },
    })
    const { data: ownView } = await asCandidate.from('content_reports')
      .select('id').eq('target_id', commentId)
    check('…while the reporter can read their own back', (ownView || []).length === 1,
      `${(ownView || []).length}`)

  } catch (e) {
    check('the proof ran to completion', false, e.message)
  } finally {
    console.log('')
    await admin.from('content_reports').delete().eq('detail', MARKER).then(() => {}, () => {})
    if (postId) {
      await admin.from('notifications').delete().eq('related_id', String(postId)).then(() => {}, () => {})
      await admin.from('temp_post_comments').delete().eq('post_id', postId).then(() => {}, () => {})
      await admin.from('temp_posts').delete().eq('id', postId).then(() => {}, () => {})
      const { data: left } = await admin.from('temp_posts').select('id').eq('id', postId).maybeSingle()
      check('teardown: the probe post is gone', !left, left ? 'STILL THERE' : 'gone')
      const { count: cLeft } = await admin.from('temp_post_comments')
        .select('*', { count: 'exact', head: true }).eq('post_id', postId)
      check('teardown: the probe comment is gone', (cLeft || 0) === 0, `${cLeft || 0}`)
    }
    const { count: rLeft } = await admin.from('content_reports')
      .select('*', { count: 'exact', head: true }).eq('detail', MARKER)
    check('teardown: no probe reports left behind', (rLeft || 0) === 0, `${rLeft || 0}`)

    // THE BOARD IS BACK TO WHAT IT WAS — compared id by id and status by
    // status against the read taken before anything was written, so a real
    // post that was touched shows up here rather than a count that still adds
    // up.
    const { data: liveAfter } = await admin.from('temp_posts').select('id, status')
    const after = (liveAfter || []).map(p => `${p.id}:${p.status}`).sort().join(',')
    check('teardown: the board is exactly as it was found', after === before,
      `${(liveAfter || []).length} post(s)`)
  }

  console.log('')
  console.log(bad
    ? `${bad} FAILED`
    : 'a shift comment can be reported, an unlisted target cannot, and the board is unchanged')
  process.exit(bad ? 1 : 0)
}

main()
