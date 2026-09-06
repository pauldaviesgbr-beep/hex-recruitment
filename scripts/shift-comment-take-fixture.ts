// THE SHIFT POST AND COMMENT FOR RECORDING STEP 8 — UP, DOWN, AND A CENSUS.
//
//   npx tsx --conditions=react-server scripts/shift-comment-take-fixture.ts --census
//   npx tsx --conditions=react-server scripts/shift-comment-take-fixture.ts --up
//   npx tsx --conditions=react-server scripts/shift-comment-take-fixture.ts --down
//
// ── IT IS A SHOOT-DAY FIXTURE, NOT A STANDING ONE ────────────────────────
//
// /temp-work holds exactly ONE post and it belongs to Neway International, a
// real employer. A fictional second post DOUBLES that feed, on a surface
// Cristina may look at, in the week she was emailed asking for a favour. Ten
// minutes of exposure is fine; a week is not. So this is created immediately
// before the take and removed immediately after — the same rule as the
// throwaway accounts.
//
// ── THE COMMENT IS BY THE POST'S OWNER, DELIBERATELY ─────────────────────
//
// `trg_temp_comment_notify` has two branches. A comment by anyone OTHER than
// the owner inserts a notification for the employer, and `notifications` has
// its own trigger that POSTs to the web-push dispatcher — a real push to a
// real device, mid-take. The owner branch notifies the other people in the
// thread and anyone who registered interest; on a post seconds old there are
// none of either. Asserted after --up, not assumed.
//
// So on camera: Thrive Demo Kitchen posts a shift and comments on it, then
// Marcus reports that comment. Marcus reporting is the point of the shot.
//
// ── THE CENSUS, AND THE ROW THAT DOES NOT CASCADE ────────────────────────
//
// Read from information_schema before anything was created, because a shift
// post is not one row:
//
//     temp_post_comments.post_id      -> temp_posts   CASCADE
//     temp_post_likes.post_id         -> temp_posts   CASCADE
//     temp_interest.temp_post_id      -> temp_posts   CASCADE
//     conversations.related_temp_post_id -> temp_posts  SET NULL
//
// THE ONE THAT MATTERS IS NOT IN THAT LIST. `content_reports.target_id` is a
// plain uuid — there is no foreign key, because one column addresses jobs,
// messages and comments alike. So THE REPORT MARCUS FILES ON CAMERA SURVIVES
// THE POST'S DELETION, orphaned, pointing at a comment id that no longer
// exists. Deleting the post and calling it clean would leave exactly that.
// Same shape as the duplicate verdict that outlives its pair.
//
// `notifications.related_id` is TEXT and also not a foreign key, so any
// notification survives too.
//
// AND THE SET NULL IS THE ONE TO WATCH RATHER THAN CLEAN UP: if a real
// conversation ever pointed at this post, deleting it would silently null a
// column on somebody's real row. --down refuses if one does.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const envPath = path.join(process.cwd(), '.env.local')
const env: Record<string, string> = {}
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.log('SKIP  no Supabase service credentials.')
  process.exit(2)
}
const admin: SupabaseClient = createClient(URL_, KEY, { auth: { persistSession: false } })

// Thrive Demo Kitchen — the account Apple is given. It owns the post so the
// reviewer sees an employer posting a shift, and so the comment takes the
// owner branch of the notify trigger.
const OWNER_EMAIL = 'pauldavies.gbr+applereviewemployer@gmail.com'
const COMPANY = 'Thrive Demo Kitchen'

// THE MARKER IS THE ONLY THING THIS SCRIPT MAY DELETE, and --down also
// requires the owner to match. A title alone is a shared mutable; the
// comment-report probe learned that the hard way this week.
const MARKER = 'TAKE-8 — shift for the recording'
const COMMENT_BODY =
  'Two spaces left on this one. Message me if you can cover the evening service.'

const mode = process.argv.find(a => ['--census', '--up', '--down'].includes(a))
if (!mode) {
  console.log('usage: --census | --up | --down')
  process.exit(2)
}

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(60) + (detail ?? ''))
}

async function ownerId(): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  const u = (data.users || []).find(x => x.email === OWNER_EMAIL)
  if (!u) throw new Error(`${OWNER_EMAIL} does not exist — run create-apple-review-employer first`)
  return u.id
}

// ── OWNER-KEYED, NOT TITLE-KEYED (6 Sept 2026) ───────────────────────────
//
// This was `.eq('title', MARKER)`, which is right for a post this script
// creates and USELESS FOR ONE A PERSON TYPES UNDER A CAMERA. Step 11 is Paul
// posting a shift himself, through the form, with a title that has to look
// plausible in a video going to Apple — so the teardown cannot depend on him
// typing a marker correctly, and it must not require him to.
//
// THE OWNER IS THE DISCRIMINATOR BECAUSE IT IS EXACT HERE, not because it is
// convenient: Thrive Demo Kitchen owns ZERO temp posts, read immediately
// before this change. So "every temp post owned by dfad7ed4" is precisely the
// post from the take and nothing else. That is a fact about today's rows, and
// --census is what re-establishes it before each take rather than trusting
// this comment.
//
// RETURNS AN ARRAY, and every caller handles more than one. maybeSingle()
// would THROW on a second row — turning "something unexpected is here" into a
// crash, at the moment you most need to be told what is there.
async function findPosts(uid: string) {
  const { data } = await admin.from('temp_posts')
    .select('id, title, employer_id, status, created_at')
    .eq('employer_id', uid)
    .order('created_at', { ascending: true })
  return data || []
}

// WHAT --down WOULD HAVE TO TAKE. Printed for a post that may not exist yet,
// which is the point: the list is derived from the schema, not from what
// happens to be lying around after a run.
async function census(uid: string) {
  const posts = await findPosts(uid)
  console.log('')
  console.log('WHAT THE REMOVAL HAS TO TAKE WITH IT')
  console.log('')
  console.log('  CASCADES when the post is deleted — no explicit delete needed,')
  console.log('  but --down asserts each is gone rather than trusting the cascade:')
  console.log('    temp_post_comments.post_id')
  console.log('    temp_post_likes.post_id')
  console.log('    temp_interest.temp_post_id')
  console.log('')
  console.log('  DOES NOT CASCADE — must be deleted explicitly, or it is orphaned:')
  console.log('    content_reports.target_id   (plain uuid, no FK — THE REPORT FROM THE TAKE)')
  console.log('    notifications.related_id    (text, no FK)')
  console.log('')
  console.log('  SET NULL on delete — a REAL row would be silently mutated:')
  console.log('    conversations.related_temp_post_id')
  console.log('    --down refuses if any conversation points at this post.')
  console.log('')

  console.log(`  TEMP POSTS OWNED BY ${OWNER_EMAIL}: ${posts.length}`)
  for (const p of posts) {
    console.log(`    ${p.id}  ${p.status.padEnd(6)}  "${p.title}"`)
  }
  console.log('')

  if (posts.length === 0) {
    console.log('  Nothing owned. This is the expected state BEFORE the take.')
    return
  }
  // NAMING WHAT WOULD GO, not what would remain. The step 8 teardown asserted
  // "0 reports left" — a line that passes whether or not one was ever filed,
  // and it took a request log to find out which. The census now prints the
  // post's id and title so the record says what was removed.
  const post = posts[0]
  if (posts.length > 1) {
    console.log(`  MORE THAN ONE. --down would remove all ${posts.length}, each by its own id.`)
    console.log('')
  }
  const { data: comments } = await admin.from('temp_post_comments')
    .select('id').eq('post_id', post.id)
  const commentIds = (comments || []).map(c => c.id)
  const counts: [string, number][] = []
  const one = async (t: string, col: string, val: any) => {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val)
    counts.push([`${t}.${col}`, count || 0])
  }
  await one('temp_post_comments', 'post_id', post.id)
  await one('temp_post_likes', 'post_id', post.id)
  await one('temp_interest', 'temp_post_id', post.id)
  await one('notifications', 'related_id', String(post.id))
  await one('conversations', 'related_temp_post_id', post.id)
  for (const cid of commentIds) await one('content_reports', 'target_id', cid)

  console.log(`  LIVE COUNTS for ${post.id}:`)
  for (const [k, v] of counts) console.log(`    ${String(v).padStart(4)}  ${k}`)
}

async function up(uid: string) {
  // ANY post owned by Demo Kitchen counts as "already up" — including one Paul
  // posted himself in a take. --up must never quietly add a SECOND post to a
  // public feed that is supposed to hold one fixture at a time.
  const already = (await findPosts(uid))[0] || null
  if (already) {
    console.log(`already up: ${already.id}  "${already.title}"`)
  } else {
    const { data, error } = await admin.from('temp_posts').insert({
      employer_id: uid,
      title: MARKER,
      category: 'other',
      description: 'Evening service, 6pm to close. Two spaces.',
      location_area: 'London',
      company_name: COMPANY,
      headcount: 2,
      hourly_rate: 16,
      rate_type: 'hour',
      status: 'open',
    }).select('id').single()
    if (error) throw new Error('could not create the post: ' + error.message)
    console.log(`created post: ${data.id}`)
  }

  const post = (await findPosts(uid))[0] || null
  if (!post) throw new Error('the post is not there after creating it')

  const { data: existing } = await admin.from('temp_post_comments')
    .select('id').eq('post_id', post.id)
  if (!existing || existing.length === 0) {
    const { error } = await admin.from('temp_post_comments').insert({
      post_id: post.id, user_id: uid, body: COMMENT_BODY,
    })
    if (error) throw new Error('could not create the comment: ' + error.message)
  }

  console.log('')
  const { data: cRow } = await admin.from('temp_post_comments')
    .select('id, user_id').eq('post_id', post.id).maybeSingle()
  check('a comment exists on the fixture post', !!cRow, cRow?.id)
  check('it was written by the post OWNER — the quiet notify branch',
    cRow?.user_id === uid)

  // ASSERTED, NOT ASSUMED. The whole reason the owner writes the comment.
  const { count: notifs } = await admin.from('notifications')
    .select('*', { count: 'exact', head: true }).eq('related_id', String(post.id))
  check('NOBODY WAS NOTIFIED — no push fires mid-take', (notifs || 0) === 0,
    `${notifs || 0} notifications`)

  const { count: live } = await admin.from('temp_posts')
    .select('*', { count: 'exact', head: true }).eq('status', 'open')
  check('the feed now holds 2 posts — Neway\'s and this one', (live || 0) === 2,
    `${live} open`)

  console.log('')
  console.log(`  post id:     ${post.id}`)
  console.log(`  comment id:  ${cRow?.id}`)
  console.log('')
  console.log('  ON CAMERA: sign in as Marcus, open /temp-work, tap Report on that comment.')
  console.log('  THEN RUN --down IMMEDIATELY. This is on the public feed while it exists.')
}

async function down(uid: string) {
  const posts = await findPosts(uid)
  if (posts.length === 0) {
    console.log('nothing to remove — Demo Kitchen owns no temp posts.')
    return
  }
  // MORE THAN ONE IS UNEXPECTED AND IS NAMED RATHER THAN SWALLOWED. All of
  // them are still ours by the owner rule, so all of them go — but each by its
  // own id, and each printed, so the record says what was removed.
  if (posts.length > 1) {
    console.log(`  ${posts.length} posts owned — removing each by its own id:`)
    for (const p of posts) console.log(`    ${p.id}  "${p.title}"`)
    console.log('')
  }
  const post = posts[0]

  // ── COUNT BEFORE DELETING, AND SAY WHAT WENT ────────────────────────────
  //
  // The old teardown asserted "THE REPORT FROM THE TAKE IS GONE — 0". THAT
  // LINE PASSES WHETHER OR NOT A REPORT WAS EVER FILED: it deletes, then
  // counts. On 6 Sept it went green and I could not tell from it whether the
  // step 8 take had worked — it took the PostgREST request log to establish
  // that Paul's report really had landed, and I first asked that log for the
  // wrong hour and nearly reported the opposite.
  //
  // So the counts are taken FIRST and printed as what was REMOVED. "1 post,
  // 1 comment, 1 report removed" is a different sentence from "0 remain", and
  // only one of them can tell you the take worked.
  const before: Record<string, number> = {}
  const countOf = async (t: string, col: string, val: unknown) => {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val as never)
    return count || 0
  }
  before.comments = await countOf('temp_post_comments', 'post_id', post.id)
  before.likes = await countOf('temp_post_likes', 'post_id', post.id)
  before.interest = await countOf('temp_interest', 'temp_post_id', post.id)
  before.notifications = await countOf('notifications', 'related_id', String(post.id))

  console.log(`removing ${post.id}  "${post.title}"`)

  // A REAL ROW WOULD BE SILENTLY MUTATED. Refuse rather than null it.
  const { data: convs } = await admin.from('conversations')
    .select('id').eq('related_temp_post_id', post.id)
  if ((convs || []).length > 0) {
    console.log('')
    console.log('  REFUSING TO DELETE. A conversation points at this post:')
    for (const c of convs!) console.log('    ' + c.id)
    console.log('  Deleting it would SET NULL on that row. Decide what to do with the')
    console.log('  conversation first — this script will not do it silently.')
    process.exit(1)
  }

  // THE ROWS THAT DO NOT CASCADE, DELETED EXPLICITLY AND FIRST — while the
  // comment ids are still readable. After the post goes they are unfindable.
  const { data: comments } = await admin.from('temp_post_comments')
    .select('id').eq('post_id', post.id)
  const commentIds = (comments || []).map(c => c.id)

  // COUNTED WHILE THE COMMENT IDS ARE STILL READABLE — after the post goes
  // they are unfindable, and this is the number that says whether the take
  // worked.
  before.reports = 0
  for (const cid of commentIds) {
    before.reports += await countOf('content_reports', 'target_id', cid)
  }

  for (const cid of commentIds) {
    await admin.from('content_reports').delete().eq('target_id', cid).eq('target_type', 'comment')
  }
  await admin.from('notifications').delete().eq('related_id', String(post.id))

  // EVERY post owned, each by its own id AND the owner — never a filter that
  // could widen. Normally exactly one.
  for (const p of posts) {
    await admin.from('temp_posts').delete().eq('id', p.id).eq('employer_id', uid)
  }

  console.log('')
  console.log('  REMOVED — counted before the delete, not after:')
  console.log(`    ${posts.length} post${posts.length === 1 ? '' : 's'}`)
  console.log(`    ${before.comments} comment${before.comments === 1 ? '' : 's'}`)
  console.log(`    ${before.reports} report${before.reports === 1 ? '' : 's'}   <- the take filed ${before.reports === 0 ? 'NOTHING' : 'this'}`)
  console.log(`    ${before.likes} like${before.likes === 1 ? '' : 's'} · ${before.interest} interest · ${before.notifications} notification${before.notifications === 1 ? '' : 's'}`)

  console.log('')
  const { data: left } = await admin.from('temp_posts').select('id').eq('id', post.id).maybeSingle()
  check('the fixture post is gone', !left, left ? 'STILL THERE' : 'gone')

  const gone = async (t: string, col: string, val: any, label: string) => {
    const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, val)
    check(label, (count || 0) === 0, `${count || 0}`)
  }
  await gone('temp_post_comments', 'post_id', post.id, 'the comment is gone (cascade, asserted)')
  await gone('temp_post_likes', 'post_id', post.id, 'no likes left behind')
  await gone('temp_interest', 'temp_post_id', post.id, 'no interest rows left behind')
  await gone('notifications', 'related_id', String(post.id), 'no notifications left behind')
  for (const cid of commentIds) {
    await gone('content_reports', 'target_id', cid,
      'THE REPORT FROM THE TAKE IS GONE — it does not cascade')
  }

  // THE FEED IS BACK TO NEWAY'S ONE POST.
  const { data: after } = await admin.from('temp_posts').select('id, company_name, status')
  check('the feed is back to exactly one post', (after || []).length === 1,
    (after || []).map(p => `${p.company_name}:${p.status}`).join(', '))
}

async function main() {
  const uid = await ownerId()
  console.log(`${COMPANY} — ${uid}`)
  if (mode === '--census') await census(uid)
  if (mode === '--up') await up(uid)
  if (mode === '--down') await down(uid)
  console.log('')
  console.log(bad ? `${bad} FAILED` : 'ok')
  process.exit(bad ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
