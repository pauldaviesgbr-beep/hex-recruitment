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

// Everything that leaves the browser, so "no request fired" is a measurement.
let recording = false
const sent = []
page.on('request', r => {
  if (!recording) return
  const t = r.resourceType()
  if (t === 'image' || t === 'font' || t === 'stylesheet') return
  sent.push(r.method() + '  ' + r.url().slice(0, 120))
})

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

  const askBtn = page.getByRole('button', { name: /request deletion/i })
  const askCount = await askBtn.count()
  pad('"Request Deletion" control present', askCount > 0)
  if (!askCount) throw new Error('control not found — the instrument, not the product; stop and look')

  const promise = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*'))
      .find(e => /Submit a request to permanently delete/i.test(e.textContent || '')
                 && e.children.length === 0)
    return el ? el.textContent.trim() : null
  })
  pad('what we promise the candidate', promise ? '"' + promise + '"' : '(not found)')

  // Reveal the confirm step. No network, no write — it is a useState flip.
  await askBtn.first().click()
  await page.waitForTimeout(1500)
  const confirmBtn = page.getByRole('button', { name: /confirm request/i })
  pad('"Confirm Request" appears', (await confirmBtn.count()) > 0)
  await page.screenshot({ path: `${SHOTS}/deletion-confirm-step.png` })

  // THE MEASUREMENT. Record everything from here, then click Confirm.
  console.log('\nCLICKING "CONFIRM REQUEST" AND COUNTING WHAT LEAVES THE BROWSER')
  recording = true
  await confirmBtn.first().click()
  await page.waitForTimeout(6000)
  recording = false

  pad('network requests fired by the click', sent.length)
  for (const s of sent.slice(0, 10)) console.log('    ' + s)

  const banner = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*'))
      .find(e => /deletion request submitted/i.test(e.textContent || '') && e.children.length === 0)
    return el ? el.textContent.trim() : null
  })
  pad('what the candidate is told', banner ? '"' + banner + '"' : '(no message found)')
  await page.screenshot({ path: `${SHOTS}/deletion-after-confirm.png` })

  console.log('')
  if (sent.length === 0 && banner) {
    console.log('  CONFIRMED ON SCREEN: the candidate is told the request was')
    console.log('  submitted and that a confirmation email will follow, and NOTHING')
    console.log('  LEFT THE BROWSER. No request recorded, no email, no deletion.')
  } else if (sent.length) {
    console.log('  Requests DID fire — read them above before concluding anything.')
  }
  console.log('\nSHOTS  ' + SHOTS + '/deletion-confirm-step.png, ' + SHOTS + '/deletion-after-confirm.png')
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
