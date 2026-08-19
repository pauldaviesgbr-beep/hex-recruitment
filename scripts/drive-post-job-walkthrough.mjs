// CAN AN AGENCY POST A ROLE WITHOUT WANTING TO STOP HALFWAY?
//
// Reading the form tells you the fields. It does not tell you how it FEELS to
// fill in, which is the whole question when someone has 73 roles to move.
//
// IT DELIBERATELY NEVER PUBLISHES. A test employer's active advert would land
// on the public board next to the 250 real listings — JobsContext filters on
// status='active' and nothing else, with no is_test exclusion. So this walks
// to the edge of step 3 and stops. Nothing is written.
//
// WHAT IT MEASURES: how many fields are required before you can advance, what
// the form has already DECIDED on the employer's behalf, and whether the whole
// thing is usable at 390.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const PASSWORD = process.env.TEST_EMPLOYER_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const SHOTS = 'drive-shots'
if (!PASSWORD) { console.error('SKIP  TEST_EMPLOYER_PASSWORD not set'); process.exit(2) }
mkdirSync(SHOTS, { recursive: true })

const out = { steps: [] }
const browser = await chromium.launch()

async function walk(width, height, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  const page = await ctx.newPage()

  await page.goto(`${BASE}/login/employer`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(employer\/dashboard|my-jobs|dashboard)(\?|$|\/)/, { timeout: 40000 })

  await page.goto(`${BASE}/post-job`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !/^\s*Loading\.\.\.\s*$/m.test(document.body.innerText || ''), null, { timeout: 45000 },
  ).catch(() => {})
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/${tag}-postjob-step1.png`, fullPage: true })

  // WHAT HAS THE FORM ALREADY DECIDED? A default that states something only the
  // employer can know is a claim in their voice — full-time, permanent, a pay
  // period. Read every control's current value before touching anything.
  const prefilled = await page.evaluate(() => {
    const rows = []
    for (const el of document.querySelectorAll('input, select, textarea')) {
      const type = el.type || el.tagName.toLowerCase()
      if (['hidden', 'file', 'submit', 'button'].includes(type)) continue
      const name = el.name || el.id || ''
      if (!name) continue
      const val = type === 'checkbox' || type === 'radio'
        ? (el.checked ? 'CHECKED' : '')
        : (el.value || '')
      if (val) rows.push(`${name}=${val}`)
    }
    return rows
  })

  const counts = await page.evaluate(() => ({
    inputs: document.querySelectorAll('input:not([type=hidden]):not([type=file])').length,
    selects: document.querySelectorAll('select').length,
    textareas: document.querySelectorAll('textarea').length,
    required: document.querySelectorAll('[required]').length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))

  out.steps.push({ tag, step: 1, prefilled, ...counts })

  // Fill only what step 1 demands: company, title, category, location.
  const setIf = async (sel, val) => {
    const el = page.locator(sel).first()
    if (await el.count()) { try { await el.fill(val) } catch { /* select */ } }
  }
  await setIf('input[name="title"]', 'PROBE Sous Chef — walkthrough only')
  await setIf('input[name="location"]', 'Bath')
  const cat = page.locator('select[name="category"]').first()
  if (await cat.count()) {
    const opts = await cat.locator('option').allTextContents()
    const pick = opts.find(o => o && !/choose|select/i.test(o))
    if (pick) await cat.selectOption({ label: pick })
  }
  await page.screenshot({ path: `${SHOTS}/${tag}-postjob-step1-filled.png`, fullPage: true })

  // Advance — and record whether it complains, and whether the message NAMES
  // the field or just says "fill in the required fields".
  const next = page.locator('button', { hasText: /^(Next|Continue)/i }).first()
  let advanced = false, complaint = ''
  if (await next.count()) {
    await next.click()
    await page.waitForTimeout(2500)
    advanced = await page.evaluate(() => /step 2|2 of 3/i.test(document.body.innerText || ''))
    complaint = await page.evaluate(() => {
      const a = document.querySelector('[role="alert"]')
      return a ? (a.textContent || '').trim().slice(0, 120) : ''
    })
  }
  await page.screenshot({ path: `${SHOTS}/${tag}-postjob-after-next.png`, fullPage: true })
  out.steps.push({ tag, step: 'advance', advanced, complaint })

  await ctx.close()
}

try {
  await walk(1440, 1000, 'desktop')
  await walk(390, 844, 'mobile')
} catch (e) {
  out.error = e.message
} finally {
  await browser.close()
}
console.log(JSON.stringify(out, null, 2))
