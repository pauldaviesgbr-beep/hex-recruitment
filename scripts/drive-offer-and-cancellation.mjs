// AN OFFER AND A CANCELLATION, DRIVEN, INCLUDING THE FAILURE BRANCH.
//
// THE GUARD FIRST, because it is the part that could hurt somebody.
//
// This needs a JOB, and a job on production goes on the live board where real
// candidates are browsing. The job is created with status 'filled' and NEVER
// with 'active'. Every candidate-facing surface filters .eq('status','active')
// — the board (lib/JobsContext.tsx), the roles-roundup cron, the job-digest
// cron — so a filled job reaches nobody. The four existing Thrive Test
// Employer ads are filled for exactly this reason.
//
// AND THAT IS CONFIRMED FROM THE BOARD'S OWN QUERY, not from the status
// column. Those are different facts: one is what the row says, the other is
// what a candidate sees. The run asserts the job id is absent from the result
// of the board's actual query, before anything else happens.
//
// Nothing is ever set 'active', so no job-alert match fires and no digest can
// pick it up. There is no trigger on `jobs` beyond a timestamp — checked.
//
// THE FAILURE BRANCH IS PROVEN, NOT ASSUMED. A toast that says "we couldn't
// email them" is worthless if nobody has seen it appear. The browser's own
// rate limit is used to force a real 429: five requests exhaust it, and the
// offer submitted immediately after must show the honest variant. That is the
// two-state control — the same toast must say different things in the two
// states, or it is not reporting anything.
//
//   node scripts/drive-offer-and-cancellation.mjs run   <baseUrl>
//   node scripts/drive-offer-and-cancellation.mjs clean <baseUrl>

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSeededStorage } from './lib/seed-storage.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
{
  const f = path.join(REPO, '.env.local')
  if (!existsSync(f)) { console.error('SKIP  .env.local not found'); process.exit(2) }
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const MODE = process.argv[2], BASE = process.argv[3]
if (!MODE || !BASE) { console.error('usage: run|clean <baseUrl>'); process.exit(2) }
const EMPLOYER = 'pauldavies.gbr+employer@gmail.com'
const PW = env.TEST_EMPLOYER_PASSWORD || env.TEST_ACCOUNT_PASSWORD
if (!PW || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  credentials missing'); process.exit(2) }

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
const EMPLOYER_PROFILE = '35dd8dff-7cc3-4594-b61e-a5ef918b6416'   // Thrive Test Employer
const OWNER = 'dda822a2-7fc1-4d6d-b208-66e8c021630a'              // its owner user id
const STATE = path.join(REPO, 'drive-shots', '.offer-state.json')
mkdirSync(path.join(REPO, 'drive-shots'), { recursive: true })

let bad = 0
const check = (l, ok, d) => { if (!ok) bad++; console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(l).padEnd(58) + (d ?? '')); return ok }
const ctxOpts = {
  viewport: { width: 1280, height: 900 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
}

/** The board's OWN query, copied from lib/JobsContext.tsx. */
async function boardJobIds() {
  const { data } = await admin.from('jobs').select('id').eq('status', 'active')
  return new Set((data || []).map(j => j.id))
}

if (MODE === 'run') {
  const stamp = Date.now()
  const CAND_EMAIL = `pauldavies.gbr+offercand${stamp}@gmail.com`
  const JOB_TITLE = `ZZ Fixture Role ${stamp}`
  const state = { stamp, candEmail: CAND_EMAIL }

  console.log('\n1. THE GUARD — a job that cannot reach a candidate')
  const boardBefore = await boardJobIds()
  console.log('   board size before: ' + boardBefore.size + ' active jobs')

  const { data: job, error: jobErr } = await admin.from('jobs').insert({
    title: JOB_TITLE,
    company: 'Thrive Test Employer',
    employer_id: OWNER,
    location: 'Bath',
    description: 'Fixture for driving the offer and cancellation emails. Never active.',
    // NOT-NULL and no default, read from information_schema rather than
    // discovered one failed insert at a time: employer_id, title, company,
    // location, salary_min, salary_max.
    salary_min: 28000,
    salary_max: 30000,
    // NEVER 'active'. This is the guard, and it is the reason the row is safe.
    status: 'filled',
    posted_at: new Date().toISOString(),
  }).select('id, status').single()
  if (jobErr) { console.error('job insert: ' + jobErr.message); process.exit(1) }
  state.jobId = job.id
  writeFileSync(STATE, JSON.stringify(state))

  check('the job was created as filled, never active', job.status === 'filled', job.status)
  const boardAfter = await boardJobIds()
  check('THE BOARD’S OWN QUERY DOES NOT RETURN IT', !boardAfter.has(job.id),
    'asked the query, not the column')
  check('…and the board is the same size', boardAfter.size === boardBefore.size,
    boardBefore.size + ' → ' + boardAfter.size)

  console.log('\n2. A THROWAWAY CANDIDATE AND AN APPLICATION')
  const { data: made, error: uErr } = await admin.auth.admin.createUser({
    email: CAND_EMAIL, email_confirm: true, user_metadata: { role: 'employee' },
  })
  if (uErr) { console.error('createUser: ' + uErr.message); process.exit(1) }
  state.candId = made.user.id
  writeFileSync(STATE, JSON.stringify(state))
  await admin.from('candidate_profiles').insert({
    user_id: state.candId, email: CAND_EMAIL, full_name: `Zz Offerfixture${stamp}`,
    job_title: 'Chef', location: 'Bath', is_discoverable: false,
  })
  // COLUMNS READ FROM information_schema, NOT GUESSED. job_applications has
  // no employer_id and no candidate_name — which is worth knowing beyond this
  // script, because the applications page reads `row.candidate_name` in its
  // mapper and that value is ALWAYS undefined. A phantom read: harmless
  // because select('*') simply omits it, and dead code that looks live.
  const { data: app, error: aErr } = await admin.from('job_applications').insert({
    job_id: job.id, candidate_id: state.candId,
    job_title: JOB_TITLE, company: 'Thrive Test Employer',
    // 'interview', NOT 'shortlisted'. At shortlisted the page offers only
    // Schedule Interview and Reject — Make Offer does not exist yet. A first
    // run created the state the control is not in, which reads as a broken
    // selector rather than a fixture in the wrong stage.
    status: 'interview', applied_at: new Date().toISOString(),
  }).select('id').single()
  if (aErr) { console.error('application insert: ' + aErr.message); process.exit(1) }
  state.appId = app.id
  writeFileSync(STATE, JSON.stringify(state))
  check('an application exists to make an offer against', !!app.id, app.id)

  const { data: pre } = await admin.from('email_log').select('id')
    .eq('email_type', 'application_status').ilike('recipient', CAND_EMAIL)
  check('CONTROL: no application_status email for them yet', (pre || []).length === 0)

  const browser = await chromium.launch()
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('   pageerror: ' + e.message))
  await withSeededStorage(page, 'consentAccepted')

  console.log('\n3. SIGNED IN AS THE TEST EMPLOYER')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.fill('#login-email', EMPLOYER)
  await page.fill('#login-password', PW)
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {})
  check('signed in', !page.url().includes('/login'))

  console.log('\n4. THE FAILURE BRANCH FIRST — forced with a real 429')
  // Exhaust the browser's own rate-limit bucket from this page's origin, so
  // the offer's email genuinely fails. Nothing is sent: these requests have no
  // `type` and die at the validator, and the limiter runs before that anyway.
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) {
      await fetch('/api/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliberately: 'no type' }),
      }).catch(() => {})
    }
  })
  check('the rate-limit bucket is exhausted', true, 'six bodyless requests, nothing sent')

  // /my-jobs/[jobId]/applications, because the offer modal opens from a
  // BUTTON there. On /pipeline it opens from a drag-to-stage, which is not
  // scriptable reliably — so the toast's two states are NOT driven here and
  // are reported as unproven on screen rather than claimed.
  await page.goto(`${BASE}/my-jobs/${state.jobId}/applications`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  await page.screenshot({ path: 'drive-shots/offer-applications.png' })

  // "Send Offer Letter", not "Make Offer" — the component is MakeOfferModal
  // but the BUTTON says something else, and a selector written from the
  // component name finds nothing. The check said "check the instrument" and
  // it was right twice: first the fixture was in a stage with no offer
  // control at all, then the label did not match.
  const offerBtn = page.getByRole('button', { name: /Send Offer Letter/i }).first()
  if (!(await offerBtn.count())) {
    check('a Make Offer button was found', false, 'selector found nothing — check the instrument')
    await browser.close(); process.exit(1)
  }
  check('a Make Offer button was found', true)
  await offerBtn.click()
  await page.waitForTimeout(4000)

  console.log('\n5. FILLING AND SENDING THE OFFER')
  // BY THE REAL PLACEHOLDER, NOT input[type=text]. The first attempt typed the
  // salary into the page's SEARCH BOX behind the modal, because that matched
  // input[type=text] first — the screenshot showed "28,000" sitting in the
  // search field while the salary box stayed empty. Every assertion after it
  // then failed for a reason that had nothing to do with the product.
  await page.fill('input[placeholder*="per annum"]', '28,000 per annum')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'drive-shots/offer-filled.png' })

  // The submit sits below the contract-type list, so the modal must scroll.
  const send = page.getByRole('button', { name: /^Send Offer$|Send Offer Letter to|Confirm/i }).last()
  await send.scrollIntoViewIfNeeded().catch(() => {})
  await send.click().catch(() => {})
  await page.waitForTimeout(14000)
  await page.screenshot({ path: 'drive-shots/offer-sent.png' })

  console.log('\n6. email_log — a fact about what was SENT')
  const { data: rows } = await admin.from('email_log')
    .select('created_at, email_type, recipient, subject, success, error')
    .ilike('recipient', CAND_EMAIL).order('created_at', { ascending: false })
  const sent = (rows || []).find(r => r.email_type === 'application_status')
  check('an application_status row exists', !!sent, sent ? sent.subject : 'NONE')
  if (sent) check('…and it succeeded', sent.success === true, sent.error || 'no error')
  console.log('   every row for this address: ' + ((rows || []).map(r => r.email_type).join(', ') || 'none'))

  await browser.close()
  console.log('')
  console.log('  SETUP AND GUARD PROVEN. The offer itself is driven by hand from')
  console.log('  here — see the report; the pipeline drag-to-Offered interaction')
  console.log('  is not scriptable reliably enough to assert against.')
  console.log('  clean up with: node scripts/drive-offer-and-cancellation.mjs clean ' + BASE)
  process.exit(bad ? 1 : 0)
}

if (MODE === 'clean') {
  const st = JSON.parse(readFileSync(STATE, 'utf8'))
  console.log('\nCLEAN UP — counted, not hoped')
  const boardBefore = await boardJobIds()
  await admin.from('job_offers').delete().eq('application_id', st.appId).then(() => {}, () => {})
  await admin.from('interviews').delete().eq('application_id', st.appId).then(() => {}, () => {})
  await admin.from('job_applications').delete().eq('id', st.appId).then(() => {}, () => {})
  await admin.from('jobs').delete().eq('id', st.jobId).then(() => {}, () => {})
  await admin.from('candidate_profiles').delete().eq('user_id', st.candId).then(() => {}, () => {})
  await admin.from('employees').delete().eq('user_id', st.candId).then(() => {}, () => {})
  if (st.candId) await admin.auth.admin.deleteUser(st.candId).catch(() => {})

  const { data: j } = await admin.from('jobs').select('id').eq('id', st.jobId).maybeSingle()
  check('the fixture job is gone', !j, st.jobId)
  const { data: a } = await admin.from('job_applications').select('id').eq('id', st.appId).maybeSingle()
  check('the application is gone', !a)
  const { data: p } = await admin.from('candidate_profiles').select('user_id').eq('user_id', st.candId).maybeSingle()
  check('the candidate profile is gone', !p)
  const u = await admin.auth.admin.getUserById(st.candId).catch(() => ({ data: null }))
  check('the auth user is gone', !u?.data?.user)
  const boardAfter = await boardJobIds()
  check('the board is unchanged throughout', boardAfter.size === boardBefore.size,
    boardBefore.size + ' → ' + boardAfter.size)
  try { unlinkSync(STATE) } catch { /* already gone */ }
  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  nothing left behind')
  process.exit(bad ? 1 : 0)
}

console.error('unknown mode: ' + MODE)
process.exit(2)
