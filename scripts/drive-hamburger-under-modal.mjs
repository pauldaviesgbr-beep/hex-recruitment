// AN OPEN MODAL COVERS THE SIDEBAR FAMILY — TOGGLE AND DRAWER ALIKE.
//
//   node scripts/drive-hamburger-under-modal.mjs <deployment-url>
//
// URL REQUIRED — a script that signs in and drives must not guess where.
//
// ── THE FAULT, so the next reader knows what green means ─────────────────
//
// 4 Sept 2026, on camera: /saved-jobs opened an advert in JobDetailModal
// (z 200) and the sidebar hamburger (hardcoded 1001) PAINTED ON TOP OF THE
// ADVERT — a floating icon over a full-screen sheet, reading to a person
// as the icon drifting with the page. The 31 Aug entry had named this in
// advance: every var(--z-modal) user was beneath the sidebar family.
//
// This drive asks the question the browser answers with PAINT, not
// stylesheets: elementFromPoint at the toggle's centre while a modal is
// open. Run against a deployment with the OLD numbers it fails — that is
// the watched failure, and production before the merge is that deployment.
//
// It also answers the holding-up questions from the go-prompt:
//   · the modal's own close still works under the new order
//   · a drawer opened FIRST is covered by a modal opened after it
//   · candidate AND employer sides, because the stylesheets are twins

import { chromium, devices } from 'playwright'
import { readFileSync } from 'node:fs'
import { withSeededStorage } from './lib/seed-storage.mjs'

const BASE = process.argv[2]
if (!BASE || !/^https:\/\//.test(BASE)) {
  console.log('SKIP  pass the deployment URL to drive.')
  process.exit(2)
}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const CAND_PASS = process.env.TEST_ACCOUNT_PASSWORD
const EMP_PASS = process.env.TEST_EMPLOYER_PASSWORD
if (!CAND_PASS || !EMP_PASS) { console.log('SKIP  fixture passwords missing from the environment'); process.exit(2) }

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(64) + (detail ?? ''))
}

const browser = await chromium.launch()

async function signIn(page, email, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 30000 })
  await page.fill('#login-email', email)
  await page.fill('#login-password', pass)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForFunction(() => !location.pathname.includes('/login'), null, { timeout: 30000 })
}

const whatPaintsOnToggle = (page) => page.evaluate(() => {
  const t = document.querySelector('[class*="mobileToggle"]')
  if (!t) return 'NO TOGGLE ON THIS PAGE'
  const r = t.getBoundingClientRect()
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  if (!el) return 'nothing'
  return el.closest('[class*="mobileToggle"]') ? 'THE TOGGLE' : 'THE MODAL LAYER'
})

// ── CANDIDATE SIDE: /saved-jobs + JobDetailModal ─────────────────────────
{
  const page = await (await browser.newContext({
    ...devices['iPhone 14 Pro'],
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {},
  })).newPage()
  await withSeededStorage(page, 'consentAccepted')
  await signIn(page, 'pauldavies.gbr+candidate@gmail.com', CAND_PASS)
  await page.goto(`${BASE}/saved-jobs`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelectorAll('[class*="listCardTitle"]').length > 0, null, { timeout: 30000 })

  console.log('candidate — /saved-jobs')
  check('the toggle paints on its own page, no modal open',
    (await whatPaintsOnToggle(page)) === 'THE TOGGLE', await whatPaintsOnToggle(page))

  // DRAWER MECHANICS STILL WORK AT THE NEW z: open it, dismiss it by its
  // own overlay, and PROVE it is gone - the first version of this drive
  // left the drawer open on a wrong heuristic and its overlay ate the next
  // click, which read as a broken page.
  await page.locator('[class*="mobileToggle"]').first().click()
  await page.waitForFunction(() => {
    const o = document.querySelector('[class*="overlay"]')
    return o && getComputedStyle(o).display !== 'none'
  }, null, { timeout: 5000 })
  // The drawer covers the overlay's centre, so click a point the drawer
  // does not reach - the right-hand edge of the screen.
  await page.mouse.click(380, 500)
  await page.waitForFunction(() => {
    const o = document.querySelector('[class*="CandidateSidebar_overlay"]')
    return !o || getComputedStyle(o).display === 'none'
  }, null, { timeout: 5000 })
  check('the drawer opens and its overlay dismisses it at the new z', true)

  // AND THE HOLDING-UP ANSWER, stated as an assertion: once a modal is up,
  // the toggle is UNDERNEATH it, so no flow can reach the drawer from
  // inside a modal - the modal's own close is the only way out, and it is
  // asserted below. Nothing was found leaning on the old order.
  await page.locator('[class*="listCardTitle"]').first().click()
  await page.waitForFunction(() => document.querySelectorAll('[data-report-control="job"]').length > 0, null, { timeout: 15000 })
  const paints = await whatPaintsOnToggle(page)
  check('WITH THE ADVERT MODAL OPEN, the modal covers the toggle',
    paints === 'THE MODAL LAYER' || paints === 'NO TOGGLE ON THIS PAGE', paints)

  // The holding-up question: the modal's own close must still work.
  const closed = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const c = btns.find(b => /close/i.test(b.getAttribute('aria-label') || '') || b.textContent.trim() === '×' || b.textContent.trim() === '✕')
    if (!c) return 'no close button found'
    c.click(); return 'clicked'
  })
  await page.waitForTimeout(500)
  const modalGone = await page.evaluate(() => document.querySelectorAll('[data-report-control="job"]').length === 0)
  check('…and the modal\'s own close still works', closed === 'clicked' && modalGone,
    `${closed}, modal gone: ${modalGone}`)
  await page.context().close()
}

// ── EMPLOYER SIDE: /candidates + the profile overlay ─────────────────────
{
  const page = await (await browser.newContext({
    ...devices['iPhone 14 Pro'],
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {},
  })).newPage()
  await withSeededStorage(page, 'consentAccepted')
  await signIn(page, 'pauldavies.gbr+employer@gmail.com', EMP_PASS)
  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const h = document.querySelector('h1, h2')
    return !!h && !/loading/i.test(h.textContent)
  }, null, { timeout: 30000 })

  console.log('')
  console.log('employer — /candidates')
  const before = await whatPaintsOnToggle(page)
  check('the employer toggle paints on its own page', before === 'THE TOGGLE', before)

  // Open a candidate card to raise the overlay at --z-modal.
  const opened = await page.evaluate(() => {
    const card = document.querySelector('[class*="candidateCard"], [class*="card"]')
    if (!card) return false
    card.click(); return true
  })
  await page.waitForTimeout(800)
  const overlayUp = await page.evaluate(() =>
    [...document.querySelectorAll('*')].some(e => getComputedStyle(e).zIndex === '200' && getComputedStyle(e).position === 'fixed'))
  if (opened && overlayUp) {
    const paints = await whatPaintsOnToggle(page)
    check('WITH THE OVERLAY OPEN, it covers the employer toggle',
      paints === 'THE MODAL LAYER' || paints === 'NO TOGGLE ON THIS PAGE', paints)
  } else {
    check('an overlay at --z-modal could be raised on /candidates', false,
      `card clicked: ${opened}, overlay seen: ${overlayUp} — pick another employer surface`)
  }
  await page.context().close()
}

await browser.close()
console.log('')
console.log(bad ? `${bad} FAILED` : 'an open modal covers the sidebar family, both roles')
process.exit(bad ? 1 : 0)
