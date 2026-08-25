// WHAT DOES AN EMPLOYER ACTUALLY SEE WHEN THEY SIGN IN?
//
// Not what the file declares — what a person sees, in order, at both widths.
//
// THE DISTINCTION THIS IS BUILT AROUND: an EMPTY STATE is not a MISSING
// COMPONENT, and confusing the two is exactly how "the page is broken" and
// "the page is fine, the fixture is empty" get mixed up. So every section is
// reported with its heading, its visible text, and how many child items it
// holds — and the test employer's data is stated up front so an empty panel
// can be read against it.
//
// Read-only. Signs in, reads, screenshots. Clicks nothing that writes.
//
//   node scripts/drive-employer-dashboard.mjs [baseUrl]

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

for (const vp of [{ w: 1280, h: 900 }, { w: 390, h: 844 }]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
  page.on('response', r => {
    if (r.status() >= 400 && r.request().resourceType() !== 'image') {
      errors.push(r.status() + ' ' + r.url().slice(0, 100))
    }
  })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 45000 })

  await page.goto(`${BASE}/employer/dashboard`, { waitUntil: 'domcontentloaded' })
  // Wait for a heading rather than a fixed sleep — a cold lambda otherwise
  // gets photographed mid-"Loading..." and reported as an empty page.
  await page.waitForSelector('h1, h2', { timeout: 60000 })
  await page.waitForTimeout(9000)

  const accept = page.getByRole('button', { name: /accept all/i })
  if (await accept.count()) { await accept.first().click(); await page.waitForTimeout(600) }

  console.log(`\n══════ ${vp.w}px ══════`)

  const model = await page.evaluate(() => {
    const vis = el => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'
    }
    // Walk the headings in DOM order and describe the block each one titles.
    const heads = Array.from(document.querySelectorAll('h1, h2, h3')).filter(vis)
    const out = heads.map(h => {
      let panel = h
      for (let i = 0; i < 4 && panel.parentElement; i++) {
        panel = panel.parentElement
        if (panel.getBoundingClientRect().height > h.getBoundingClientRect().height * 2) break
      }
      const text = (panel.innerText || '').trim()
      return {
        heading: (h.innerText || '').trim().slice(0, 60),
        tag: h.tagName,
        y: Math.round(h.getBoundingClientRect().top + window.scrollY),
        links: panel.querySelectorAll('a').length,
        buttons: panel.querySelectorAll('button').length,
        imgs: panel.querySelectorAll('img').length,
        chars: text.length,
        body: text.split('\n').slice(1, 6).join(' | ').slice(0, 150),
      }
    })
    return {
      title: document.title,
      pageChars: (document.body.innerText || '').length,
      scrollHeight: document.documentElement.scrollHeight,
      headings: out,
      // Anything that scrolls sideways, per the standing controls-wrap rule.
      sideScrollers: Array.from(document.querySelectorAll('*')).filter(e => {
        const cs = getComputedStyle(e)
        return e.scrollWidth > e.clientWidth + 2 && /auto|scroll/.test(cs.overflowX)
      }).length,
      clipped: Array.from(document.querySelectorAll('*')).filter(e => {
        const cs = getComputedStyle(e)
        return e.scrollWidth > e.clientWidth + 2 && /visible|hidden|clip/.test(cs.overflowX)
      }).length,
    }
  })

  console.log('  page height ' + model.scrollHeight + 'px, ' + model.pageChars + ' chars of text')
  console.log('  sections, in the order they appear:')
  for (const h of model.headings) {
    console.log(`    y=${String(h.y).padStart(5)}  ${h.tag}  "${h.heading}"`)
    console.log(`             ${h.links} links · ${h.buttons} buttons · ${h.imgs} imgs · ${h.chars} chars`)
    if (h.body) console.log(`             ${h.body}`)
  }
  console.log('  horizontal scrollers: ' + model.sideScrollers + '   clipped-overflow: ' + model.clipped)
  console.log('  console errors / failed requests: ' + errors.length)
  for (const e of errors.slice(0, 4)) console.log('    ' + e)

  await page.screenshot({ path: `drive-shots/empdash-${vp.w}-top.png` })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `drive-shots/empdash-${vp.w}-bottom.png` })
  await ctx.close()
}

await browser.close()
console.log('\n  drive-shots/empdash-{1280,390}-{top,bottom}.png\n')
