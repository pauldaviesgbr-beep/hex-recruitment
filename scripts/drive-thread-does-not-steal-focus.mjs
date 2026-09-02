// OPENING A CONVERSATION MUST NOT PUT THE CURSOR IN THE COMPOSER.
//
//   node scripts/drive-thread-does-not-steal-focus.mjs [base-url]
//
// Exit 0 when the thread does NOT steal focus. Exit 1 when it does.
// Skips (exit 2) without credentials.
//
// ── WHY THIS IS A DRIVE AND NOT A GREP ───────────────────────────────────
//
// A grep can tell you `inputRef.current?.focus()` is gone from the file. It
// cannot tell you nothing else focuses the composer — an autoFocus attribute,
// a library, a scroll-into-view that happens to focus, a second effect added
// later. The question is what `document.activeElement` IS after the thread
// opens, and only the rendered page answers it.
//
// ── WHY IT MATTERS, AND IT IS NOT A NICETY ───────────────────────────────
//
// `app/messages/page.tsx` focused the composer 100ms after every conversation
// opened — a line from `cce9f68`, the repository's FIRST COMMIT on 1 March
// 2026, written before a mobile layout existed to weigh it against.
//
// On iOS that raises the keyboard unprompted, and the keyboard does not shrink
// the LAYOUT viewport — only the visual one. `.messagesLayout` is
// `position: fixed; bottom: 0` at <=768px, so its bottom edge stays behind the
// keyboard and iOS scrolls the visual viewport to reveal the focused input.
// THE HEADER GOES WITH IT — and the header is where Report and Block live.
//
// So on the screen an App Store reviewer opens to check that moderation
// controls exist, the moderation controls were scrolled off before they
// touched anything. That is a 2.1 answer contradicted by its own screenshot.
//
// ── WHAT THIS DOES NOT PROVE ─────────────────────────────────────────────
//
// It does not prove the viewport fault is fixed. Tapping the composer
// deliberately still triggers it; that is a separate change on
// `.messagesLayout` itself. This proves only that the fault is no longer
// reached WITHOUT the person asking for it.

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
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(56) + (detail ?? ''))
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'] })
const page = await ctx.newPage()

console.log(`driving ${BASE}`)

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await withSeededStorage(page, 'consentAccepted')
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
// Fill after hydration, not after domcontentloaded: a fill into an input React
// then re-renders empty submits a blank form and reads as a wrong password.
await page.locator('#login-email').waitFor({ state: 'visible', timeout: 60000 })
await page.waitForFunction(() => {
  const b = document.querySelector('button[type="submit"]')
  return !!b && !b.disabled
}, undefined, { timeout: 60000 })
await page.fill('#login-email', EMAIL)
await page.fill('#login-password', PASSWORD)
if (!(await page.evaluate(() => document.querySelector('#login-email').value.length))) {
  throw new Error('the email field is empty after fill — the form had not hydrated')
}
// .first(): there are TWO submit buttons on /login — the panel's and the Ask
// Thrive widget's send arrow.
await page.locator('button[type="submit"]:not([disabled])').first().click()
for (let i = 0; i < 120 && /\/login/.test(page.url()); i++) await page.waitForTimeout(1000)
if (/\/login/.test(page.url())) throw new Error('still on the login page after 120s')

await page.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction((who) => new RegExp(who, 'i').test(document.body.innerText || ''),
  CORRESPONDENT.source, { timeout: 120000 })

const focusNow = () => page.evaluate(() => {
  const a = document.activeElement
  const ta = document.querySelector('textarea')
  return {
    active: a ? a.tagName.toLowerCase() + '.' + String(a.className).split(' ')[0] : 'nothing',
    isComposer: !!ta && a === ta,
  }
})

const before = await focusNow()
console.log('')
console.log(`  before opening a thread, focus is on: ${before.active}`)

await page.getByText(CORRESPONDENT).first().click()
// Wait for the thread to be fully rendered — BOTH header controls, because
// BlockControl renders nothing until its own query returns.
await page.waitForFunction(() =>
  !!document.querySelector('[data-report-control="message"]') &&
  !!document.querySelector('[data-block-control]'),
undefined, { timeout: 120000 })

// SAMPLE OVER TIME, NOT ONCE. The call this watches was a setTimeout at 100ms,
// so a single reading taken at the wrong instant would pass on the broken
// state. Every sample must be clean, and the whole sequence is printed.
console.log('')
const samples = []
for (const ms of [0, 100, 250, 600, 1500, 3000]) {
  if (ms) await page.waitForTimeout(ms === 100 ? 100 : ms - (samples.at(-1)?.ms ?? 0))
  const r = await focusNow()
  samples.push({ ms, ...r })
  console.log(`  +${String(ms).padStart(4)}ms  active=${r.active.padEnd(34)} composer focused: ${r.isComposer}`)
}

console.log('')
check('OPENING A THREAD DOES NOT FOCUS THE COMPOSER',
  samples.every(s => !s.isComposer),
  samples.some(s => s.isComposer) ? 'it stole focus' : 'focus never moved to it')

// AND THE COMPOSER STILL WORKS WHEN ASKED. Without this, the check passes on a
// composer that is disabled, missing or unfocusable — which would be a far
// worse product than the one it is fixing.
await page.locator('textarea').first().click()
await page.waitForTimeout(200)
const afterTap = await focusNow()
check('…and it DOES focus when deliberately tapped', afterTap.isComposer, afterTap.active)

console.log('')
console.log(bad ? `${bad} FAILED` : 'the thread opens without summoning the keyboard')
await browser.close()
process.exit(bad ? 1 : 0)
