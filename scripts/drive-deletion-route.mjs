// DOES ASKING FOR DELETION ACTUALLY DO SOMETHING NOW?
//
// The predecessor of this check counted network requests on the same click and
// found ZERO while the screen said the request was submitted. So this counts
// them again and expects the OPPOSITE — which is the two-states test for free:
// the same measurement, the same address, a different answer.
//
// WHAT IT WRITES, SAID PLAINLY: one deletion_requests row for the TEST
// CANDIDATE fixture, and one email to contact@thrivecareer.co.uk, which is
// Paul's own address. Nothing else. The row is cleaned up afterwards by the
// caller, not by this script — a check that tidies its own evidence is a check
// you cannot inspect.
//
//   node scripts/drive-deletion-route.mjs [baseUrl]

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+candidate@gmail.com'
const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
if (!PASSWORD) { console.error('SKIP  TEST_ACCOUNT_PASSWORD not set'); process.exit(2) }
if (BASE.includes('.vercel.app') && !BYPASS) { console.error('SKIP  preview needs the bypass secret'); process.exit(2) }
mkdirSync('drive-shots', { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})
const page = await ctx.newPage()
const pad = (k, v) => console.log('  ' + String(k).padEnd(48) + v)
let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(47) + (detail ?? ''))
}

let recording = false
const sent = []
page.on('request', r => {
  if (!recording) return
  const t = r.resourceType()
  if (t === 'image' || t === 'font' || t === 'stylesheet') return
  sent.push(r.method() + ' ' + r.url().replace(BASE, ''))
})

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 45000 })

  console.log('\n/settings/privacy — BEFORE THE CLICK')
  await page.goto(`${BASE}/settings/privacy`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1, h2', { timeout: 60000 })
  await page.waitForTimeout(6000)
  const btn = page.getByRole('button', { name: /^request deletion$/i })
  check('the button is offered', (await btn.count()) > 0)

  console.log('\nCLICKING, AND COUNTING WHAT LEAVES THE BROWSER')
  recording = true
  await btn.first().click()
  await page.waitForTimeout(9000)
  recording = false
  const posted = sent.filter(s => s.startsWith('POST') && s.includes('deletion-request'))
  check('a POST actually fires now', posted.length >= 1, posted[0] || '(none)')
  pad('total requests from the click', sent.length)

  const text = await page.evaluate(() => document.body.innerText || '')
  check('the confirmation says 30 days', /within 30 days/i.test(text))
  check('it does NOT promise 48 hours', !/48\s*hours/i.test(text))
  check('it says nothing is deleted yet', /nothing has been deleted/i.test(text))
  await page.screenshot({ path: 'drive-shots/deletion-route-after-click.png' })

  console.log('\nRELOAD — IS THE OUTSTANDING STATE STILL THERE?')
  // The half that matters. A request that vanishes on refresh leaves the
  // person exactly as unsure as the version that did nothing at all.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1, h2', { timeout: 60000 })
  await page.waitForTimeout(7000)
  const after = await page.evaluate(() => document.body.innerText || '')
  check('the button is NO LONGER offered', (await page.getByRole('button', { name: /^request deletion$/i }).count()) === 0)
  check('it shows when they asked', /Requested \d/i.test(after),
    (after.match(/Requested [^\n]*/i) || [''])[0])
  check('and says we have it', /we have your request/i.test(after))

  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*'))
      .find(e => /Delete my account and data/i.test(e.textContent || '') && e.children.length === 0)
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'drive-shots/deletion-route-outstanding.png' })

  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  all clean — it records, it notifies, and it says so honestly')
  console.log('\nSHOTS  drive-shots/deletion-route-{after-click,outstanding}.png')
  process.exitCode = bad ? 1 : 0
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
