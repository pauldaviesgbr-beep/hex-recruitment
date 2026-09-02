// THE KEYBOARD INSET IS WIRED UP — AND THAT IS ALL THIS PROVES.
//
//   node scripts/drive-keyboard-inset-wiring.mjs [base-url]
//
// ── WHAT THIS CAN AND CANNOT ANSWER, SAID FIRST ──────────────────────────
//
// A headless browser has no software keyboard and none can be summoned, so
// NOTHING here proves the fault is fixed on a handset. That needs a person
// with an iPhone, and the report says exactly what to look at.
//
// What it CAN prove is everything between the measurement and the layout:
//
//   1. the page publishes `--keyboard-inset` at all
//   2. with no keyboard it is 0px — so the change is a no-op for every
//      desktop visitor, which is the risk of shipping it unverified
//   3. `.messagesLayout` actually READS it, by setting the variable by hand
//      and measuring that the element's bottom edge moves by that amount
//   4. the header stays put while the bottom edge moves — which is the whole
//      point, because the header carries Report and Block
//
// (3) is the manufactured state this codebase already uses for `env()` faults:
// a value a browser will not produce is set deliberately, and the element is
// measured before and after. It is labelled as manufactured in the output so
// nobody reads it as a keyboard.

import { chromium, devices } from 'playwright'
import { loadEnv } from './lib/rls-probe.mjs'
import { withSeededStorage } from './lib/seed-storage.mjs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const CORRESPONDENT = /Marcus/i
const EMAIL = 'pauldavies.gbr+employer@gmail.com'

const env = loadEnv()
const PASSWORD = process.env.TEST_EMPLOYER_PASSWORD || env.TEST_EMPLOYER_PASSWORD
if (!PASSWORD) { console.error('SKIP  TEST_EMPLOYER_PASSWORD not set'); process.exit(2) }

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(58) + (detail ?? ''))
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'] })
const page = await ctx.newPage()
console.log(`driving ${BASE}`)

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await withSeededStorage(page, 'consentAccepted')
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('#login-email').waitFor({ state: 'visible', timeout: 60000 })
await page.waitForFunction(() => {
  const b = document.querySelector('button[type="submit"]')
  return !!b && !b.disabled
}, undefined, { timeout: 60000 })
await page.fill('#login-email', EMAIL)
await page.fill('#login-password', PASSWORD)
await page.locator('button[type="submit"]:not([disabled])').first().click()
for (let i = 0; i < 120 && /\/login/.test(page.url()); i++) await page.waitForTimeout(1000)
if (/\/login/.test(page.url())) throw new Error('still on the login page after 120s')

await page.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction((who) => new RegExp(who, 'i').test(document.body.innerText || ''),
  CORRESPONDENT.source, { timeout: 120000 })
await page.getByText(CORRESPONDENT).first().click()
await page.waitForFunction(() =>
  !!document.querySelector('[data-report-control="message"]') &&
  !!document.querySelector('[data-block-control]'),
undefined, { timeout: 120000 })

const read = () => page.evaluate(() => {
  const el = document.querySelector('[class*="messagesLayout"]')
  const header = document.querySelector('[class*="chatHeader"]')
  const r = el.getBoundingClientRect()
  const h = header.getBoundingClientRect()
  return {
    inset: getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset').trim(),
    cssBottom: getComputedStyle(el).bottom,
    layoutBottom: Math.round(r.bottom),
    layoutTop: Math.round(r.top),
    headerTop: Math.round(h.top),
    viewport: innerHeight,
  }
})

console.log('')
console.log('── 1. THE PAGE PUBLISHES IT, AND WITH NO KEYBOARD IT IS ZERO ──────')
console.log('')
const rest = await read()
console.log(`  --keyboard-inset          "${rest.inset}"`)
console.log(`  .messagesLayout bottom     css=${rest.cssBottom}  rendered bottom=${rest.layoutBottom}  viewport=${rest.viewport}`)
check('the variable is published', rest.inset !== '', rest.inset || '(nothing)')
check('WITH NO KEYBOARD IT IS 0px — a no-op for every desktop visitor',
  rest.inset === '0px', rest.inset)
check('…and the layout still reaches the bottom of the viewport',
  Math.abs(rest.layoutBottom - rest.viewport) <= 1,
  `${rest.layoutBottom} vs ${rest.viewport}`)

console.log('')
console.log('── 2. THE CSS READS IT — MANUFACTURED STATE, NOT A KEYBOARD ───────')
console.log('')
console.log('  Setting --keyboard-inset to 300px by hand. A real iPhone keyboard is')
console.log('  around 290-340px; no browser here will produce one, so this is the')
console.log('  reproduction, clearly labelled, of a value the CSS must respond to.')
console.log('')
await page.evaluate(() => document.documentElement.style.setProperty('--keyboard-inset', '300px'))
await page.waitForTimeout(150)
const moved = await read()
console.log(`  .messagesLayout bottom     css=${moved.cssBottom}  rendered bottom=${moved.layoutBottom}`)
console.log(`  chat header top            ${rest.headerTop} -> ${moved.headerTop}`)

const delta = rest.layoutBottom - moved.layoutBottom
check('THE BOTTOM EDGE MOVED UP BY THE INSET', Math.abs(delta - 300) <= 2, `${delta}px`)
check('…so .messagesLayout really does read the variable',
  moved.cssBottom === '300px', moved.cssBottom)
check('AND THE HEADER DID NOT MOVE — Report and Block stay on screen',
  moved.headerTop === rest.headerTop, `${rest.headerTop} -> ${moved.headerTop}`)

// AND IT GOES BACK. A one-way change would leave the layout wrong the moment
// the keyboard closes, which is a worse fault than the one being fixed.
await page.evaluate(() => document.documentElement.style.setProperty('--keyboard-inset', '0px'))
await page.waitForTimeout(150)
const back = await read()
check('setting it back to 0 restores the layout exactly',
  back.layoutBottom === rest.layoutBottom, `${back.layoutBottom} vs ${rest.layoutBottom}`)

console.log('')
console.log('  THIS DOES NOT PROVE THE FAULT IS FIXED ON A PHONE. It proves the')
console.log('  measurement reaches the layout. The keyboard half needs a handset.')
console.log('')
console.log(bad ? `${bad} FAILED` : 'the inset is published, read, and reversible')
await browser.close()
process.exit(bad ? 1 : 0)
