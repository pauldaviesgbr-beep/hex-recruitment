// WHAT HAPPENS WHEN A CANDIDATE ASKS US TO DELETE THEIR DATA?
//
// READ-ONLY IN THE STRONGEST SENSE: the whole point of this check is that the
// button fires NO network request at all. That is the finding. Nothing is
// written because there is nothing that writes — which this proves by counting
// requests rather than by reading the handler.
//
// Driven on the TEST CANDIDATE fixture, never a real account.
//
//   node scripts/drive-deletion-request.mjs [baseUrl]

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+candidate@gmail.com'
const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const SHOTS = 'drive-shots'
if (!PASSWORD) { console.error('SKIP  TEST_ACCOUNT_PASSWORD not set'); process.exit(2) }
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})
const page = await ctx.newPage()
const pad = (k, v) => console.log('  ' + String(k).padEnd(46) + v)

// HOW THE ORIGINAL FAULT WAS PROVED, kept because it is the evidence.
// Before the fix this clicked "Confirm Request" with a request listener armed
// and counted what left the browser: ZERO, while the screen said the request
// had been submitted. There is no button to click now — that is the fix — so
// the script asserts the copy and the route instead. If a real request route
// is built (step 2), the counting comes back and should read ONE.

try {
  console.log('\nSIGN IN AS THE TEST CANDIDATE')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 45000 })
  pad('landed on', page.url().replace(BASE, ''))

  console.log('\n/settings/privacy')
  await page.goto(`${BASE}/settings/privacy`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  pad('url', page.url().replace(BASE, ''))

  // ── WHAT THE SCREEN SAYS NOW ──────────────────────────────────────────
  //
  // ASKED SO THE TWO STATES GIVE DIFFERENT ANSWERS. "Is there a deletion
  // control" was true before the fix and after it, so it cannot tell them
  // apart. These four can: the false claims are GONE and a real route is
  // PRESENT, and each half fails on its own.
  const page_text = await page.evaluate(() => document.body.innerText || '')

  // TWO ASSERTIONS WERE REMOVED FROM HERE AND THE REASON MATTERS.
  // They checked for "48 hours" and "request submitted" — and both PASSED
  // against the un-fixed production page, because those strings only enter the
  // DOM after the button is clicked. A check that is true in both states
  // cannot tell you which state you are in, and the passing direction is the
  // dangerous one. What is asserted below is static text that genuinely
  // differs before and after.
  const bad = [
    ['the old "Submit a request…" copy is gone',
      !/Submit a request to permanently delete/i.test(page_text)],
    ['the old "Request data deletion" heading is gone',
      !/Request data deletion/i.test(page_text)],
    ['export no longer claims "…settings, and activity"',
      !/settings,?\s*and activity/i.test(page_text)],
    ['the export description says what it omits',
      /applications, messages, CVs/i.test(page_text)],
  ]
  for (const [label, ok] of bad) pad(label, ok ? 'ok' : 'STILL THERE')

  // A ROUTE MUST REMAIN. Removing the lie and leaving nothing would pass
  // every check above and still fail the person.
  const mailto = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
      .find(x => /contact@/i.test(x.getAttribute('href') || ''))
    return a ? { text: (a.textContent || '').trim(), href: a.getAttribute('href') } : null
  })
  pad('a real route to a human is present', mailto ? 'ok' : 'MISSING')
  if (mailto) {
    pad('  the control reads', '"' + mailto.text + '"')
    pad('  it goes to', decodeURIComponent(mailto.href).slice(0, 80))
    pad('  it names a timescale we publish', /30 days/i.test(page_text) ? 'ok (30 days)' : 'NO TIMESCALE')
  }

  const stillAButton = await page.getByRole('button', { name: /request deletion|confirm request/i }).count()
  pad('the old lying button is gone', stillAButton === 0 ? 'ok' : 'STILL PRESENT')

  // SCROLL TO THE THING BEFORE PHOTOGRAPHING IT. The first run shot the top of
  // the page and proved nothing about the section that changed — assertions on
  // innerText are not the same as seeing it render.
  // 'instant', never 'smooth': a screenshot taken mid-animation is the same
  // family of fault as measuring a scroll that has not finished.
  await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
      .find(x => /contact@/i.test(x.getAttribute('href') || ''))
    if (a) a.scrollIntoView({ behavior: 'instant', block: 'center' })
  })
  await page.screenshot({ path: `${SHOTS}/deletion-after-fix.png`, fullPage: false })

  const failures = bad.filter(([, ok]) => !ok).length + (mailto ? 0 : 1) + (stillAButton ? 1 : 0)
  console.log('')
  if (failures) { console.log('  ' + failures + ' FAILED — read them above.'); process.exitCode = 1 }
  else console.log('  The screen makes no claim the product cannot keep, and still offers a route.')
  console.log('\nSHOTS  ' + SHOTS + '/deletion-after-fix.png')
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
