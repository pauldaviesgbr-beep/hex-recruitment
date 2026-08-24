// SHOW PAUL WHAT THE DIRECTORY ACTUALLY LOOKS LIKE WITH PHOTOS ON IT.
//
// The plain top-of-page screenshot is misleading in BOTH directions: only four
// of fifty candidates have uploaded a photo and they are not at the top, so a
// shot of the fold shows fifty initials and looks like the feature does
// nothing. This scrolls to where the photos are and captures there.
//
// Two shots per width, deliberately:
//   -fold   the page as it opens — which is what most employers will see
//   -photos scrolled to a card that has one — which is the design question
//
// Read-only. Signs in, scrolls, screenshots. Clicks nothing.
//
//   node scripts/capture-directory-photos.mjs <baseUrl>

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const PASSWORD = process.env.TEST_EMPLOYER_PASSWORD || process.env.TEST_ACCOUNT_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
if (!PASSWORD) { console.error('SKIP  no employer password'); process.exit(2) }
if (BASE.includes('.vercel.app') && !BYPASS) { console.error('SKIP  preview needs the bypass secret'); process.exit(2) }
mkdirSync('drive-shots', { recursive: true })

const browser = await chromium.launch()

for (const vp of [{ w: 390, h: 844 }, { w: 1280, h: 900 }]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 45000 })

  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="cardDirectory"]', { timeout: 60000 })
  await page.waitForTimeout(10000)

  // Dismiss the cookie banner so it does not sit over the bottom row. It is a
  // consent choice, so it is only clicked because this is a throwaway browser
  // context that is discarded at the end of the loop.
  const accept = page.getByRole('button', { name: /accept all/i })
  if (await accept.count()) { await accept.first().click(); await page.waitForTimeout(800) }

  await page.screenshot({ path: `drive-shots/directory-${vp.w}-fold.png` })

  const info = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[class*="cardDirectory"]'))
    const withPhoto = cards.filter(c => c.querySelector('img'))
    // 'instant', never 'smooth' — a screenshot taken mid-animation is the same
    // fault as measuring a scroll that has not finished.
    if (withPhoto[0]) withPhoto[0].scrollIntoView({ behavior: 'instant', block: 'center' })
    return {
      cards: cards.length,
      withPhoto: withPhoto.length,
      names: withPhoto.map(c => (c.innerText || '').trim().split('\n')[0]),
    }
  })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `drive-shots/directory-${vp.w}-photos.png` })

  console.log(`  ${vp.w}px  ${info.cards} cards, ${info.withPhoto} with a photo: ${info.names.join(', ')}`)
  await ctx.close()
}

await browser.close()
console.log('\n  drive-shots/directory-{390,1280}-{fold,photos}.png')
