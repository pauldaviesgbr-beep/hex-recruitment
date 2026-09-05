// THE no-pad BANDS RENDER BELOW THE HEADER, NOT BEHIND IT.
//
//   node scripts/drive-no-pad-bands-clear-the-header.mjs <deployment-url>
//
// URL REQUIRED — a script that signs in and drives must not guess where.
//
// ── THE FAULT THIS GUARDS ────────────────────────────────────────────────
//
// The dead stickies on /cv-builder and /saved-jobs were doing TWO jobs:
// the pin that never worked, and — via their top: 70px — the ONLY header
// clearance on two no-pad pages, where main carries no padding and the
// mobile header is position: fixed. Removing the sticky removed both, and
// every existing check stayed green: "all four buttons inside the
// viewport" is TRUE OF AN ELEMENT BEHIND ANOTHER ELEMENT. Paul filmed the
// yellow button-bottoms peeking out from under the header on 5 Sept 2026.
//
// THE ASSERTION TARGETS THE CONTENT, NOT THE BAND BOX — the no-pad idiom
// deliberately extends the band's padded box UNDER the header (dark band
// flush under dark header), so the box top being 0 is CORRECT rendering.
// The first version asserted the box and failed the FIX — the inside-the-
// viewport lesson's cousin, caught by the pair refusing to pass.
// So this asserts VISIBILITY of the content: on each page, the
// band's top edge sits at or below the header's bottom edge, AND
// elementFromPoint just inside the band's top returns the band — the
// paint question, which a rect comparison alone cannot answer.

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
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(58) + (detail ?? ''))
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

for (const [path, sel, label] of [
  ['/cv-builder', '[class*="bannerTitle"]', 'the CV Builder toolbar CONTENT'],
  ['/saved-jobs', '[class*="pageTitle"]', 'the Saved Jobs band CONTENT'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction((s) => !!document.querySelector(s), sel, { timeout: 30000 })
  await page.waitForTimeout(600)
  const m = await page.evaluate((s) => {
    const header = document.querySelector('header')
    const band = document.querySelector(s)
    const hb = header.getBoundingClientRect().bottom
    const bt = band.getBoundingClientRect().top
    const r = band.getBoundingClientRect()
    // At the ELEMENT'S OWN CENTRE - a fixed x=196 probed the flex container
    // BESIDE a left-aligned title and misread the fix as failing.
    const probe = document.elementFromPoint(r.left + r.width / 2, bt + 10)
    return {
      headerBottom: Math.round(hb), bandTop: Math.round(bt),
      paints: probe ? (probe.closest(s) ? 'the band' : (probe.closest('header') ? 'THE HEADER' : String(probe.className).slice(0, 30))) : 'nothing',
    }
  }, sel)
  console.log(`${path}  header bottom ${m.headerBottom}, band top ${m.bandTop}`)
  check(`${label} starts at or below the header`, m.bandTop >= m.headerBottom - 1,
    `${m.bandTop} vs ${m.headerBottom}`)
  check(`…and the PAINT at its top edge is the band`, m.paints === 'the band', m.paints)
}

await browser.close()
console.log('')
console.log(bad ? `${bad} FAILED` : 'both no-pad bands render below the header — visible, not merely in the viewport')
process.exit(bad ? 1 : 0)
