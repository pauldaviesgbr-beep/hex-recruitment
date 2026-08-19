// A CANDIDATE MUST NOT SEE THE EMPLOYER TOOLS.
//
// The database side is proved separately (probe-candidate-cannot-edit-jobs.mjs
// — RLS refuses the writes). This is the other half: what a signed-in
// CANDIDATE actually sees if they type the employer URLs in.
//
// Both halves are needed and neither substitutes for the other. RLS holding
// means a candidate cannot DO damage; this means they are not shown controls
// that would fail, which is a different promise.
//
// READ-ONLY. Navigates and reads. Clicks nothing.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+candidate@gmail.com'
const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const SHOTS = 'drive-shots'
if (!PASSWORD) { console.error('SKIP  TEST_ACCOUNT_PASSWORD not set'); process.exit(2) }
if (BASE.includes('.vercel.app') && !BYPASS) { console.error('SKIP  preview needs the bypass secret'); process.exit(2) }
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (n, got, ok) => results.push({ n, got, ok })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})
const page = await ctx.newPage()

try {
  await page.goto(`${BASE}/login/employee`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  // Must NOT match the login page it is already on.
  await page.waitForURL(/\/(dashboard|jobs|welcome)(\?|$|\/)/, { timeout: 40000 })
  check('signed in as the candidate', page.url().replace(BASE, ''), !page.url().includes('/login'))

  // isGate: an EMPLOYER-ONLY page that refuses a candidate outright.
  // /my-jobs is NOT one — it is dual-purpose, showing a candidate the jobs
  // they have applied to and an employer the jobs they have posted. Asserting
  // "explains one email = one side" there was my error, not the product's:
  // nothing is being refused, so there is nothing to explain.
  for (const [name, path, isGate] of [
    ['/my-jobs', '/my-jobs', false],
    ['/post-job', '/post-job', true],
    ['/candidates', '/candidates', true],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    const url = page.url().replace(BASE, '')
    const body = await page.evaluate(() => document.body.innerText || '')
    const kebabs = await page.locator('button[aria-label="Job actions"]').count()
    const editDialog = await page.locator('[aria-labelledby="quick-edit-title"]').count()
    await page.screenshot({ path: `${SHOTS}/candidate${path.replace(/\//g, '-')}.png` })

    // The promise: no employer editing control is reachable. Either bounced
    // away, or shown a page with none of the tools on it.
    const bounced = !url.startsWith(path)
    check(`candidate at ${name}: no job-editing controls`,
      `url=${url} kebabs=${kebabs} editDialog=${editDialog} bounced=${bounced}`,
      kebabs === 0 && editDialog === 0)
    check(`candidate at ${name}: no "Edit job" text on the page`,
      `hasEditJob=${/edit job/i.test(body)}`, !/edit job/i.test(body))

    // THE TRAP. A signed-in job seeker offered "Sign up for free" is how Ricci
    // ended up with three accounts and no employer access. These gates are
    // only ever reached by someone who already HAS an account, so the invite
    // is wrong every single time it renders.
    check(`candidate at ${name}: not invited to "Sign up for free"`,
      `hasSignUpFree=${/sign up for free/i.test(body)}`, !/sign up for free/i.test(body))
    if (isGate) {

    // And it must say WHY, or it is just a locked door.
    check(`candidate at ${name}: explains one email = one side`,
      `explains=${/one or the other|separate/i.test(body)}`,
      /one or the other|separate/i.test(body))
    }
  }
} catch (e) {
  check('drive completed', e.message, false)
  try { await page.screenshot({ path: `${SHOTS}/candidate-error.png` }) } catch {}
} finally {
  await browser.close()
}

let failed = 0
for (const r of results) {
  if (r.ok) console.log(`  ok    ${r.n}  ->  ${r.got}`)
  else { failed++; console.log(`  FAIL  ${r.n}  ->  ${r.got}`) }
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
