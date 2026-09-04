// THE SAVED-JOBS BAND MOVES WITH THE CONTENT — BECAUSE ITS STICKY WAS DEAD.
//
//   node scripts/drive-saved-jobs-band-scrolls-honestly.mjs <deployment-url>
//
// URL REQUIRED — a script that signs in and drives must not guess where.
//
// THE FAULT THIS GUARDS AGAINST COMING BACK: the band declared
// position: sticky; top: var(--nav-height), and that sticky was DEAD at
// mobile (body's overflow-x: hidden makes body a scroll container whose
// scrollport never scrolls — the 31 Aug mechanism). Measured 4 Sept 2026:
// computed top 70px, actual top 25px after a 500px scroll. A dead sticky
// drifts in Chromium and HALF-PINS AND JUMPS in WKWebView, which is what
// "scroll is glitchy" looks like on a handset.
//
// A POSITION ASSERTED AT LOAD SAYS NOTHING ABOUT A POSITION UNDER SCROLL —
// so this drive scrolls, and asserts the band moved WITH the content: the
// distance the band travelled matches the distance a card travelled, within
// tolerance. A revived-but-dead sticky fails that (band drifts while
// claiming a pin); a genuinely pinned sticky also fails it (band does not
// move at all), WHICH IS DELIBERATE — if sticky is ever brought back here it
// must come WITH the safe-area-aware top and a rewrite of this assertion,
// not by surprise.

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
if (!process.env.TEST_ACCOUNT_PASSWORD) { console.log('SKIP  no TEST_ACCOUNT_PASSWORD'); process.exit(2) }

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(62) + (detail ?? ''))
}

const browser = await chromium.launch()
const page = await (await browser.newContext({
  ...devices['iPhone 14 Pro'],
  extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {},
})).newPage()
await withSeededStorage(page, 'consentAccepted')
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#login-email', { timeout: 30000 })
await page.fill('#login-email', 'pauldavies.gbr+candidate@gmail.com')
await page.fill('#login-password', process.env.TEST_ACCOUNT_PASSWORD)
await page.locator('button[type="submit"]').first().click()
await page.waitForFunction(() => !location.pathname.includes('/login'), null, { timeout: 30000 })
await page.goto(`${BASE}/saved-jobs`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelectorAll('[class*="listCardTitle"]').length > 0, null, { timeout: 30000 })

const snap = () => page.evaluate(() => {
  const band = [...document.querySelectorAll('[class*="pageHeader"]')].find(e => e.textContent.includes('Saved Jobs'))
  const card = document.querySelector('[class*="listCardTitle"]')
  return {
    bandTop: band ? Math.round(band.getBoundingClientRect().top) : null,
    bandPosition: band ? getComputedStyle(band).position : null,
    cardTop: card ? Math.round(card.getBoundingClientRect().top) : null,
  }
})

const before = await snap()
check('the band exists and is NOT declared sticky at this width',
  before.bandPosition !== 'sticky', String(before.bandPosition))

// SCROLL WHAT EXISTS. The first version demanded scrollY > 300 and timed
// out on BOTH deployments: with three saved cards the page's entire scroll
// range is ~45px, and the earlier 900px measurements were of the MODAL'S
// inner scroller, not the page. Ask for the maximum, read what was
// achieved, and require only that it is nonzero - the assertion is about
// AGREEMENT of travel, not about distance.
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await page.waitForFunction(() => window.scrollY > 10, null, { timeout: 10000 })
const scrolled = await page.evaluate(() => Math.round(window.scrollY))
console.log(`  (page scrolled ${scrolled}px — the whole range available)`)
const after = await snap()

const bandMoved = before.bandTop - after.bandTop
const cardMoved = before.cardTop - after.cardTop
check('the band MOVED WITH THE CONTENT under scroll',
  Math.abs(bandMoved - cardMoved) <= 2,
  `band moved ${bandMoved}px, a card moved ${cardMoved}px`)
check('…and it genuinely travelled, not pinned somewhere',
  bandMoved >= Math.min(scrolled, 20), `${bandMoved}px of ${scrolled}px scrolled`)

await browser.close()
console.log('')
console.log(bad ? `${bad} FAILED` : 'the band scrolls honestly with its content')
process.exit(bad ? 1 : 0)
