// WHAT DOES /candidates WEIGH, AND HOW MANY REQUESTS DOES IT MAKE?
//
// THE GATE FOR PUTTING PHOTOS ON THE DIRECTORY. The card avatar is 46px and
// the stored photos are full size — one of them is 1052x1536 and 1.7MB. Fifty
// cards each pulling a full-resolution photograph into a 46px circle is the
// base64-logo fault in a new coat: the one that took the job board to a
// multi-megabyte page and put an employer's login over Vercel's header limit.
//
// NOTE ON THE UNIT: response.body() returns DECOMPRESSED bytes, so the text
// assets read larger here than they cost on the wire. Images are already
// compressed and are unaffected, and images are the entire delta this gate is
// about — so the before/after comparison is sound even though the absolute
// total is not a wire figure. Said plainly rather than labelled "transferred".
//
// MEASURED FROM THE NETWORK, not from the markup. Every response that arrives
// is counted and its transferred size summed, so a photo feature that doubles
// the page cannot be described as "a few small thumbnails".
//
//   node scripts/measure-candidates-weight.mjs <baseUrl> <label>
//
// Read-only. Signs in as the test employer, loads the page, clicks nothing.

import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const LABEL = process.argv[3] || BASE.replace(/^https?:\/\//, '').slice(0, 28)
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const PASSWORD = process.env.TEST_EMPLOYER_PASSWORD || process.env.TEST_ACCOUNT_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
if (!PASSWORD) { console.error('SKIP  no employer password'); process.exit(2) }
if (BASE.includes('.vercel.app') && !BYPASS) { console.error('SKIP  preview needs the bypass secret'); process.exit(2) }

const WIDTHS = [
  { w: 390, h: 844, name: '390 (phone)' },
  { w: 1280, h: 900, name: '1280 (desktop)' },
]

const browser = await chromium.launch()
const pad = (k, v) => console.log('    ' + String(k).padEnd(38) + v)
const kb = n => (n / 1024).toFixed(0) + ' kB'

console.log('\n/candidates PAGE WEIGHT — ' + LABEL)

for (const vp of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  const page = await ctx.newPage()

  // Count only what the MEASURED page loads — arm after login, disarm at the end.
  let armed = false
  const seen = []
  page.on('response', async res => {
    if (!armed) return
    let size = 0
    try { size = (await res.body()).length } catch { /* redirects, aborted */ }
    seen.push({ type: res.request().resourceType(), size, url: res.url(), status: res.status() })
  })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 45000 })

  armed = true
  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
  // Photos resolve through a signed-URL round trip AFTER hydration, so a short
  // wait would measure a page that has not finished fetching them — and would
  // flatter the "after" run precisely where honesty matters.
  await page.waitForTimeout(12000)
  armed = false

  const total = seen.reduce((a, r) => a + r.size, 0)
  const images = seen.filter(r => r.type === 'image')
  const imgBytes = images.reduce((a, r) => a + r.size, 0)
  const cards = await page.evaluate(() =>
    document.querySelectorAll('[class*="cardDirectory"]').length)
  const shown = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="cardDirectory"] img'))
      .filter(i => i.naturalWidth > 0).length)

  console.log('\n  ' + vp.name)
  pad('cards on the page', cards)
  pad('candidate photos rendered', shown)
  pad('TOTAL requests', seen.length)
  pad('TOTAL body bytes (decompressed)', kb(total))
  pad('image requests', images.length)
  pad('image bytes', kb(imgBytes))
  if (images.length) {
    const biggest = images.slice().sort((a, b) => b.size - a.size)[0]
    pad('largest single image', kb(biggest.size))
    // The number that decides the gate: what one avatar costs.
    const photoish = images.filter(r => /storage\/v1|\/photos\//.test(r.url))
    if (photoish.length) {
      pad('candidate-photo requests', photoish.length)
      pad('candidate-photo bytes', kb(photoish.reduce((a, r) => a + r.size, 0)))
      pad('  mean per photo', kb(photoish.reduce((a, r) => a + r.size, 0) / photoish.length))
      pad('  transform applied?',
        photoish.some(r => /width=|height=|render\/image/.test(r.url)) ? 'YES' : 'no — full size')
    }
  }
  const failed = seen.filter(r => r.status >= 400)
  pad('4xx/5xx responses', failed.length)
  for (const f of failed.slice(0, 3)) console.log('      ' + f.status + '  ' + f.url.slice(0, 90))

  await page.screenshot({ path: `drive-shots/candidates-${vp.w}-${LABEL.replace(/[^a-z0-9]/gi, '')}.png` })
  await ctx.close()
}

await browser.close()
console.log('')
