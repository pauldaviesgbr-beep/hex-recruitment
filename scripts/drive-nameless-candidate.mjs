// WHAT AN EMPLOYER SEES WHEN A CANDIDATE HAS NO NAME.
//
// Until this branch the answer was "a person called Unknown", because the
// mapper wrote `row.full_name || 'Unknown'`. Before that it was a random
// ten-character token from the email local-part. Both are the same fault: an
// invented name that nothing downstream can tell from a real one.
//
// The decision is SHOW NOTHING. The job title and location already identify
// the row; an employer seeing a card with no name understands it, and one
// seeing "Unknown" thinks that is somebody's name.
//
// THREE SURFACES, and the third is the one that used to crash:
//   /candidates            the directory card
//   the detail view        initials, the message button, the contact panel
//   THE SEARCH BOX         candidate.fullName.toLowerCase() on a null. Silent
//                          for the employer and invisible to us.
//
// A disposable candidate, made discoverable directly. That state cannot arise
// through the product any more — the flip gate now requires a name — but the
// employer-facing surfaces must not crash if it ever does, and this is the
// only way to see them.
//
//   node scripts/drive-nameless-candidate.mjs <baseUrl>

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv() {
  const out = {}
  const f = path.join(REPO, '.env.local')
  if (!existsSync(f)) { console.error('SKIP  .env.local not found'); process.exit(2) }
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = loadEnv()
const BASE = process.argv[2]
if (!BASE) { console.error('usage: node scripts/drive-nameless-candidate.mjs <baseUrl>'); process.exit(2) }
const EMPLOYER = 'pauldavies.gbr+employer@gmail.com'
const EMPLOYER_PW = env.TEST_EMPLOYER_PASSWORD || env.TEST_ACCOUNT_PASSWORD
if (!EMPLOYER_PW || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  credentials missing'); process.exit(2) }

mkdirSync('drive-shots', { recursive: true })
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET

let bad = 0
const check = (l, ok, d) => { if (!ok) bad++; console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(l).padEnd(58) + (d ?? '')); return ok }

const stamp = Date.now()
const EMAIL = `thrive-nameless-${stamp}@example.com`
const JOB_TITLE = `Pastry Chef ${stamp}`      // unique, so the search can find exactly this row
let userId = null

const browser = await chromium.launch()
const errors = []

try {
  console.log('\n1. A DISCOVERABLE CANDIDATE WITH NO NAME')
  const { data: made, error: mkErr } = await admin.auth.admin.createUser({
    email: EMAIL, email_confirm: true, user_metadata: { role: 'employee' },
  })
  if (mkErr) throw new Error('createUser: ' + mkErr.message)
  userId = made.user.id
  const { error: insErr } = await admin.from('candidate_profiles').insert({
    user_id: userId, email: EMAIL, full_name: null,
    job_title: JOB_TITLE, location: 'Bath', is_discoverable: true,
  })
  if (insErr) throw new Error('profile insert: ' + insErr.message)
  const { data: row } = await admin.from('candidate_profiles')
    .select('full_name, job_title, is_discoverable').eq('user_id', userId).maybeSingle()
  check('full_name is NULL, not a placeholder', row?.full_name === null, String(row?.full_name))
  check('it is discoverable', row?.is_discoverable === true)

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  const page = await ctx.newPage()
  // ANY uncaught error on any of these pages is a failure, whether or not it
  // changes what is on screen. A crash in a React subtree can blank a card
  // without blanking the page.
  page.on('pageerror', e => errors.push(e.message))

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.fill('#login-email', EMPLOYER)
  await page.fill('#login-password', EMPLOYER_PW)
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {})
  check('signed in as the test employer', !page.url().includes('/login'))

  console.log('\n2. THE DIRECTORY')
  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  const dirText = await page.evaluate(() => document.body.innerText || '')
  check('the page rendered at all', dirText.length > 200, dirText.length + ' chars')
  check('NO invented name anywhere — no "Unknown"', !/\bUnknown\b/.test(dirText))
  check('and no "Candidate" used as a name', !/^Candidate$/m.test(dirText))
  check('the nameless row IS present, by its job title', dirText.includes(JOB_TITLE))
  await page.screenshot({ path: 'drive-shots/nameless-directory.png', fullPage: false })

  console.log('\n3. THE SEARCH — the one that crashed')
  const search = page.locator('input[placeholder="Name, role or skill"]').first()
  if (await search.count()) {
    await search.fill(stamp.toString())
    await page.waitForTimeout(3000)
    const afterSearch = await page.evaluate(() => document.body.innerText || '')
    check('searching does not blank the page', afterSearch.length > 100, afterSearch.length + ' chars')
    check('the nameless row survives a search', afterSearch.includes(JOB_TITLE))
    check('no error thrown by the search', errors.length === 0, errors.join(' | '))
    await search.fill('')
    await page.waitForTimeout(2000)
  } else {
    check('a search box was found', false, 'selector found nothing — check the instrument')
  }

  console.log('\n4. THE DETAIL VIEW')
  const card = page.locator(`text=${JOB_TITLE}`).first()
  if (await card.count()) {
    await card.click()
    await page.waitForTimeout(6000)
    const detail = await page.evaluate(() => document.body.innerText || '')
    check('the detail view opened', detail.includes(JOB_TITLE))
    check('still no "Unknown"', !/\bUnknown\b/.test(detail))
    check('the message button reads sensibly', /Message them|Message\b/.test(detail),
      (detail.match(/Message[^\n]{0,20}/) || [''])[0].trim())
    await page.screenshot({ path: 'drive-shots/nameless-detail.png', fullPage: false })
  } else {
    check('the card was clickable', false, 'could not find it to open')
  }

  console.log('\n5. NOTHING THREW, ANYWHERE')
  check('no uncaught page errors across all three surfaces', errors.length === 0,
    errors.length ? errors.join(' | ') : 'clean')

  await ctx.close()
  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  a nameless candidate renders as nameless, and nothing crashes')
  console.log('  shots: drive-shots/nameless-directory.png, nameless-detail.png')
  process.exitCode = bad ? 1 : 0
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  process.exitCode = 1
} finally {
  if (userId) {
    await admin.from('candidate_profiles').delete().eq('user_id', userId).then(() => {}, () => {})
    await admin.auth.admin.deleteUser(userId).catch(() => {})
    console.log('  cleanup: disposable candidate removed')
  }
  await browser.close()
}
