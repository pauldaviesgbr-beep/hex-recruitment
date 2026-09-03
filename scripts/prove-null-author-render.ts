// A SELF-CONTAINED FIXTURE FOR THE NULL-AUTHOR COMMENT.
//
// WHY NOT JUST USE AN EXISTING POST. Every temp post that a candidate can
// actually SEE is either a real employer's live shift — which I will not put
// test litter on — or one owned by paul@thrivecareer.co.uk, which is a real
// account and not mine to drive. The only honest way to see an author-less
// comment render is to build the whole situation from scratch and take it
// down afterwards.
//
// Creates: a disposable employer, an OPEN temp post, a disposable candidate,
// and a comment. Erases the candidate. Prints the post id to drive, then the
// caller removes everything.
//
//   npx tsx scripts/prove-null-author-render.ts          # set up
//   npx tsx scripts/prove-null-author-render.ts --clean  # tear down
//
// Needs SUPABASE_SERVICE_ROLE_KEY.

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { eraseAccount } from '../lib/eraseAccount'

const env: Record<string, string> = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const i = line.indexOf('=')
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('SKIP  needs the service role key'); process.exit(2) }
const admin = createClient(URL_, KEY, { auth: { persistSession: false } })

const MARK = 'erasure-render-fixture'
const pad = (k: string, v: unknown) => console.log('  ' + String(k).padEnd(40) + v)

async function clean() {
  console.log('\nTEARING DOWN THE FIXTURE')
  const { data: posts } = await admin.from('temp_posts').select('id, employer_id').eq('title', MARK)
  for (const p of posts || []) {
    await admin.from('temp_post_comments').delete().eq('post_id', p.id)
    await admin.from('temp_posts').delete().eq('id', p.id)
    pad('removed post', p.id)
    const { data: u } = await admin.auth.admin.getUserById(p.employer_id)
    if (u?.user) {
      await admin.from('employer_profiles').delete().eq('user_id', p.employer_id)
      await admin.from('employer_subscriptions').delete().eq('user_id', p.employer_id)
      await admin.auth.admin.deleteUser(p.employer_id)
      pad('removed disposable employer', u.user.email)
    }
  }
  if (!(posts || []).length) pad('nothing to remove', 'already clean')
}

async function main() {
  if (process.argv.includes('--clean')) { await clean(); return }

  const stamp = Date.now()
  console.log('\nBUILDING A SELF-CONTAINED FIXTURE')

  // ── a disposable employer ────────────────────────────────────────────
  const empEmail = `pauldavies.gbr+renderemp${stamp}@gmail.com`
  const { data: emp, error: empErr } = await admin.auth.admin.createUser({
    email: empEmail, password: 'render-' + stamp, email_confirm: true,
    user_metadata: { role: 'employer', company_name: MARK },
  })
  if (empErr) throw new Error('employer: ' + empErr.message)
  const empId = emp.user.id
  await admin.from('employer_profiles').insert({ user_id: empId, company_name: MARK, email: empEmail })
  pad('disposable employer', empEmail)

  // ── an OPEN post, so a signed-in candidate can see it ────────────────
  const { data: post, error: pErr } = await admin.from('temp_posts')
    .insert({ employer_id: empId, title: MARK, status: 'open',
              category: 'kitchen', location_area: 'London',
              description: 'Fixture for proving an author-less comment renders. Safe to delete.' })
    .select('id').single()
  if (pErr) throw new Error('post: ' + pErr.message)
  pad('open post', post.id)

  // ── a disposable candidate who comments ──────────────────────────────
  // A PER-RUN DOMAIN, BECAUSE eraseAccount WRITES A user_departures ROW.
  // That row carries reason 'self_deleted', a FIXED zero uuid and the email
  // DOMAIN — nothing else. THREE proofs call eraseAccount and verify runs
  // them concurrently, so on a shared domain their rows are indistinguishable:
  // this one used to leave its row behind forever, and tombstonelive's
  // over-broad teardown was silently sweeping up after it. When that was
  // narrowed (eca71cb) the leak surfaced — 2 rows after one verify run,
  // measured 3 Sept 2026. The domain is the only column we control, so it is
  // the discriminator.
  //
  // user_departures is the ONLY durable record of a self-deletion, so a proof
  // row in it is not untidiness — it is a fake departure in the one table
  // that answers how many people leave and how soon.
  const DOMAIN = `rendercand-proof-${stamp}.invalid`
  const candEmail = `proof@${DOMAIN}`
  const { data: cand, error: cErr } = await admin.auth.admin.createUser({
    email: candEmail, password: 'render-' + stamp, email_confirm: true,
    user_metadata: { role: 'candidate', full_name: 'Render Fixture' },
  })
  if (cErr) throw new Error('candidate: ' + cErr.message)
  const candId = cand.user.id
  await admin.from('candidate_profiles').insert({
    user_id: candId, full_name: 'Render Fixture', email: candEmail, is_discoverable: false })
  await admin.from('temp_post_comments').insert({
    post_id: post.id, user_id: candId, body: 'This is the comment that will lose its author.',
    author_name: 'Render Fixture', author_role: 'candidate',
  })
  pad('disposable candidate', candEmail)

  // ── BEFORE ───────────────────────────────────────────────────────────
  const before = await admin.from('temp_post_comments')
    .select('user_id, body, author_name').eq('post_id', post.id).single()
  console.log('\nTHE COMMENT BEFORE ERASURE')
  pad('user_id', before.data?.user_id)
  pad('author_name', before.data?.author_name)
  pad('body', before.data?.body)

  // ── ERASE ────────────────────────────────────────────────────────────
  const receipt = await eraseAccount(admin, candId, { email: candEmail })
  console.log('\nERASED')
  pad('auth deleted', receipt.authDeleted)
  pad('errors', receipt.errors.length)
  for (const e of receipt.errors) console.log('      ' + e)

  const after = await admin.from('temp_post_comments')
    .select('user_id, body, author_name, author_avatar').eq('post_id', post.id).single()
  console.log('\nTHE COMMENT AFTER ERASURE')
  pad('user_id', String(after.data?.user_id))
  pad('author_name', String(after.data?.author_name))
  pad('author_avatar', String(after.data?.author_avatar))
  pad('body', after.data?.body)
  pad('the row still exists', !!after.data)

  // OUR OWN DEPARTURE ROW. eraseAccount wrote it; nothing else removes it,
  // and it would otherwise sit in user_departures looking like a real
  // candidate who deleted their account. Scoped to the per-run domain so a
  // concurrent sibling proof's row is never touched.
  await admin.from('user_departures').delete()
    .eq('reason', 'self_deleted').eq('email_domain', DOMAIN)
    .eq('user_id', '00000000-0000-0000-0000-000000000000').then(() => {}, () => {})
  const { count: depLeft } = await admin.from('user_departures')
    .select('*', { count: 'exact', head: true })
    .eq('reason', 'self_deleted').eq('email_domain', DOMAIN)
  pad('departure row cleaned up', (depLeft || 0) === 0)

  console.log('\nNOW DRIVE IT:')
  console.log(`  node scripts/drive-null-author-comment.mjs ${post.id}`)
  console.log('THEN TEAR IT DOWN:')
  console.log('  npx tsx scripts/prove-null-author-render.ts --clean')
}

main().catch(e => { console.error('\nFAILED: ' + e.message); process.exitCode = 1 })
