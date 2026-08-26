// DOES /support EXIST, AND DOES IT PROMISE ANYTHING WE CANNOT KEEP?
//
// The App Store listing needs a Support URL. But the more important half of
// this check is the NEGATIVE one: a support page is where invented promises
// go. This project has already published a support route that went nowhere —
// privacy@ appeared four times on the Privacy Policy and the mailbox had never
// been created, so every message vanished with no bounce and no one knew.
//
// So this asserts absence as hard as presence: no phone number, no
// response-time promise, no opening hours, no postal address, no "support
// team". Those are the things a reasonable person would add, and every one of
// them is a promise somebody then has to keep.
//
//   node scripts/drive-support-page.mjs <baseUrl>

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2]
if (!BASE) { console.error('usage: node scripts/drive-support-page.mjs <baseUrl>'); process.exit(2) }
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
mkdirSync('drive-shots', { recursive: true })

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(56) + (detail ?? ''))
  return ok
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})

try {
  const page = await ctx.newPage()
  const res = await page.goto(`${BASE}/support`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)

  console.log('\n1. IT EXISTS AND IT IS A REAL URL')
  check('HTTP 200', res?.status() === 200, String(res?.status()))
  check('it stayed on /support', new URL(page.url()).pathname === '/support', new URL(page.url()).pathname)

  const text = await page.evaluate(() => document.body.innerText || '')

  console.log('\n2. WHAT IT SAYS')
  check('the support address is on the page', /support@thrivecareer\.co\.uk/.test(text))
  check('it points at Ask Thrive', /Ask Thrive/i.test(text))
  check('it covers being locked out', /forgot it\?/i.test(text))
  check('it says NEWEST email — the second-link trap', /newest/i.test(text))
  check('it covers data and deletion', /delete your account yourself/i.test(text.replace(/\s+/g, ' ')))
  check('it links Terms and Privacy', /Terms of Service/i.test(text) && /Privacy Policy/i.test(text))

  console.log('\n3. WHAT IT MUST NOT SAY — the half that matters')
  const flat = text.replace(/\s+/g, ' ')
  check('NO phone number', !/(\+44|\b0[12378]\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})/.test(flat),
    (flat.match(/(\+44|\b0[12378]\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})/) || [''])[0])
  check('NO response-time promise', !/within \d+\s*(hour|working day|day|business day)/i.test(flat),
    (flat.match(/within \d+\s*\w+/i) || [''])[0])
  check('NO opening hours', !/(mon(day)?\s*[-–]\s*fri|9am|9\s*am|office hours|opening hours)/i.test(flat))
  check('NO "support team"', !/support team|our team is/i.test(flat))
  check('NO 24\/7 or "always" claim', !/24\/7|around the clock|always available/i.test(flat))
  check('NO price, rate or trial length', !/£\s?\d|\bper month\b|free for \d/i.test(flat))
  check('NO unverified address (privacy@ or hello@)', !/privacy@thrivecareer|hello@thrivecareer/.test(text))

  console.log('\n4. IT RENDERS PROPERLY ON A PHONE')
  const entities = text.match(/&(?:apos|quot|amp|mdash|rarr|ldquo|rdquo|#\d+);/g) || []
  check('no raw HTML entity is visible', entities.length === 0, entities.length ? JSON.stringify([...new Set(entities)]) : '')
  const overflow = await page.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > window.innerWidth + 1) bad.push(el.tagName + '.' + (el.className || '').toString().slice(0, 30))
    }
    return { count: bad.length, sample: bad.slice(0, 3), docWidth: document.documentElement.scrollWidth, win: window.innerWidth }
  })
  check('nothing spills past the right edge', overflow.count === 0,
    overflow.count ? overflow.count + ' e.g. ' + JSON.stringify(overflow.sample) : '')
  check('the page does not scroll sideways', overflow.docWidth <= overflow.win + 1,
    overflow.docWidth + ' vs ' + overflow.win)
  await page.screenshot({ path: 'drive-shots/support-page.png', fullPage: true })

  console.log('\n5. IT IS REACHABLE — the footers')
  for (const from of ['/', '/terms', '/privacy-policy']) {
    const p = await ctx.newPage()
    await p.goto(`${BASE}${from}`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(3500)
    const has = await p.evaluate(() =>
      [...document.querySelectorAll('a[href="/support"]')].length > 0)
    check(`reachable from ${from}`, has)
    await p.close()
  }

  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  /support is a real URL, reachable, and promises nothing we cannot keep')
  console.log('  shot: drive-shots/support-page.png')
  process.exitCode = bad ? 1 : 0
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  process.exitCode = 1
} finally {
  await ctx.close()
  await browser.close()
}
