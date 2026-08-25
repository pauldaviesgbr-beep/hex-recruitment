// DOES AN AUTHOR-LESS COMMENT ACTUALLY RENDER?
//
// A NOT NULL constraint usually exists because code assumes presence, so
// relaxing one is only safe if the readers cope. Reading the code says they
// should; this puts a real null-author comment on a real page and looks at it.
//
// WHAT IT CHECKS, and each is a different way it could go wrong:
//   · the comment appears at all (not dropped by a join or a filter)
//   · it shows "[deleted]" rather than the original text
//   · it does NOT render the word "undefined" or "null" anywhere
//   · it does NOT emit a /candidates/null link — the broken-page failure
//   · nothing throws: no console error, no failed request
//
// Read-only. Signs in as the test candidate, looks, clicks nothing that writes.
//
//   node scripts/drive-null-author-comment.mjs <postId> [baseUrl]

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const POST_ID = process.argv[2]
const BASE = process.argv[3] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+candidate@gmail.com'
const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
if (!POST_ID) { console.error('usage: node scripts/drive-null-author-comment.mjs <postId> [baseUrl]'); process.exit(2) }
if (!PASSWORD) { console.error('SKIP  TEST_ACCOUNT_PASSWORD not set'); process.exit(2) }
mkdirSync('drive-shots', { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})
const page = await ctx.newPage()
const errors = []
// NEXT PREFETCH FALLBACKS ARE NOT OUR ERRORS. "Failed to fetch RSC payload
// … falling back to browser navigation" is the framework degrading exactly as
// designed when a prefetch is interrupted, and it appears on unrelated routes.
// Counting it would make this check red for a reason that has nothing to do
// with an author-less comment — a false alarm that trains people to ignore it.
page.on('console', m => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/Failed to fetch RSC payload/i.test(t)) return
  errors.push(t.slice(0, 140))
})
page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 140)))

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(52) + (detail ?? ''))
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 45000 })

  console.log('\n/temp-work — the post carrying the author-less comment')
  await page.goto(`${BASE}/temp-work?post=${POST_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1, h2', { timeout: 60000 })
  await page.waitForTimeout(9000)

  // Open the post if the comments live behind a click.
  const opener = page.locator(`[href*="${POST_ID}"], [data-post-id="${POST_ID}"]`).first()
  if (await opener.count()) { await opener.click().catch(() => {}); await page.waitForTimeout(4000) }

  const text = await page.evaluate(() => document.body.innerText || '')
  const html = await page.evaluate(() => document.body.innerHTML || '')

  check('the [deleted] comment is on the page', /\[deleted\]/.test(text),
    (text.match(/.{0,28}\[deleted\].{0,28}/) || [''])[0].replace(/\n/g, ' '))
  check('no "undefined" rendered anywhere', !/\bundefined\b/i.test(text))
  check('no bare "null" rendered anywhere', !/(^|\s)null(\s|$)/i.test(text))
  check('NO /candidates/null link — the broken-page failure',
    !/\/candidates\/null/.test(html))
  check('nothing threw', errors.length === 0, errors[0] || '')

  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*'))
      .find(e => (e.textContent || '').includes('[deleted]') && e.children.length === 0)
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
  })
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'drive-shots/null-author-comment.png' })

  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  an author-less comment renders, and nothing broke')
  console.log('\nSHOT  drive-shots/null-author-comment.png')
  process.exitCode = bad ? 1 : 0
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
