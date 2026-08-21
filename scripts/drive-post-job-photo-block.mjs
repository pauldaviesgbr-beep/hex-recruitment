// THE STEP-3 PHOTO BLOCK: the "not your logo" line and the live branded preview.
//
// This is the half of the fix that stops the fault recurring. Ricci uploaded his
// company logo because the field asked for an image and a business puts its logo
// in an empty image box — a LABELLING fault, which no card design can reach.
//
// It also drives the quotation path end to end, which the board cannot: the one
// live advert with no photograph has no "What we offer" section, so it renders
// the monogram. Typing a line into the guided box and reading it back off the
// preview is the only way to see the sentence rule work through real code rather
// than through a unit fixture.
//
// STRICTLY READ-ONLY AGAINST THE DATABASE. It fills form fields in the browser
// and NEVER submits: no publish, no draft, no row. Nothing is emailed, because
// nothing is posted.
//
//   node scripts/drive-post-job-photo-block.mjs <base-url>

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const PASSWORD = process.env.TEST_EMPLOYER_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const SHOTS = 'drive-shots'

if (!PASSWORD) { console.error('SKIP  TEST_EMPLOYER_PASSWORD not in the environment'); process.exit(2) }
if (BASE.includes('.vercel.app') && !BYPASS) { console.error('SKIP  preview target needs the bypass secret'); process.exit(2) }
mkdirSync(SHOTS, { recursive: true })

// The line the preview should lift. Written here so the assertion can compare
// what came OUT of the card against what went IN — a check that only asked
// "is there a quote" would pass on any sentence at all, including the wrong one.
const OFFER = 'Four days across a rota, no late finishes, sixty covers.'
const EXPECTED = 'Four days across a rota, no late finishes, sixty covers'

const results = []
const check = (name, got, ok) => results.push({ name, got, ok })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1100 },
  deviceScaleFactor: 2,
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } }
    : {}),
})
const page = await ctx.newPage()

try {
  // /login/employer and name= selectors, matching the drive that works. The
  // generic /login with input[type="email"] timed out -- a selector fault, not
  // a broken page.
  await page.goto(`${BASE}/login/employer`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30_000 })
  await page.click('button[type="submit"]')
  // NOT /employer/ -- that matches "/login/employer", the page we are on.
  await page.waitForURL(/\/(employer\/dashboard|my-jobs|dashboard)(\?|$|\/)/, { timeout: 60_000 })
  check('signed in as the employer fixture', page.url().replace(BASE, ''), true)

  await page.goto(`${BASE}/post-job`, { waitUntil: 'networkidle', timeout: 90_000 })
  await page.waitForTimeout(1500)

  // ── STEP 1 ───────────────────────────────────────────────────────────────
  // Enough to advance, and no more. The salary PERIOD is included because
  // leaving it out makes step 1 legitimately refuse — a real validation rule
  // that a previous drive misread as the button being broken.
  const fill = async (label, value) => {
    const el = page.locator(`input[name="${label}"], textarea[name="${label}"], select[name="${label}"]`).first()
    if (await el.count()) { await el.fill(value).catch(async () => { await el.selectOption(value).catch(() => {}) }) }
  }
  // The cookie banner sits over the footer and can swallow a click on Next.
  const accept = page.locator('button:has-text("Accept All")').first()
  if (await accept.count()) { await accept.click().catch(() => {}); await page.waitForTimeout(400) }

  await fill('title', 'Sous Chef')
  await fill('location', 'Bath')
  await fill('salaryMin', '32000')
  await fill('salaryMax', '36000')

  // EMPLOYMENT TYPE AND CONTRACT TYPE ARE PILL BUTTONS, NOT SELECTS.
  // selectOption found nothing, both stayed unset, and step 1 refused to
  // advance — correctly. The first run read that as "the form is broken"; it
  // was the instrument, same family as the icon in the button label and the
  // hidden checkbox styled through its <label>. Click what a person clicks.
  for (const label of ['Full-time', 'Permanent']) {
    const pill = page.locator(`button:text-is("${label}")`).first()
    if (await pill.count()) await pill.click().catch(() => {})
  }
  const period = page.locator('select').filter({ hasText: /Per year|Per hour/ }).first()
  if (await period.count()) await period.selectOption({ label: 'Per year (£)' }).catch(() => {})

  // CATEGORY is required and is a real <select>. It was being skipped, so the
  // form refused for a second, different reason after the pills were fixed —
  // and refused identically, which is why the failure looked unchanged.
  const cat = page.locator('select').filter({ hasText: /Select a category/ }).first()
  if (await cat.count()) {
    await cat.selectOption({ label: 'Hospitality, Tourism & Sport' })
      .catch(async () => { await cat.selectOption({ index: 1 }).catch(() => {}) })
  }

  await page.screenshot({ path: `${SHOTS}/photoblock-step1.png` })

  const next1 = page.locator('button:has-text("Next")').first()
  if (await next1.count()) { await next1.click(); await page.waitForTimeout(1500) }
  // Did it actually advance? A refused step looks identical to a slow one, and
  // the previous run reported "0 guided boxes" without ever saying it was still
  // on step 1 — which read as a missing feature rather than a blocked form.
  const onStep2 = await page.locator('textarea').count() > 0
  check('step 1 advanced', onStep2 ? 'yes' : 'still on step 1', onStep2)

  // ── STEP 2 — the guided description boxes ────────────────────────────────
  const boxes = page.locator('textarea')
  const n = await boxes.count()
  check('step 2 shows the guided boxes', n, n >= 1)
  // "What we offer" is the LAST of the three guided boxes; the selection rule
  // prefers it, which is the branch worth exercising.
  if (n >= 3) await boxes.nth(2).fill(OFFER)
  else if (n >= 1) await boxes.first().fill(OFFER)
  await page.screenshot({ path: `${SHOTS}/photoblock-step2.png` })

  const next2 = page.locator('button:has-text("Next")').first()
  if (await next2.count()) { await next2.click(); await page.waitForTimeout(1500) }

  // ── STEP 3 — the photo block ─────────────────────────────────────────────
  const notLogo = page.locator('text=/Not your logo/i').first()
  const hasNotLogo = await notLogo.count()
  check('the "Not your logo" line is on the page', hasNotLogo ? 'present' : 'absent', hasNotLogo > 0)

  const previewText = page.locator('text=/what yours looks like now/i').first()
  const hasPreview = await previewText.count()
  check('the branded preview caption is on the page', hasPreview ? 'present' : 'absent', hasPreview > 0)

  // THE ASSERTION THAT MATTERS: the sentence on the preview is the sentence
  // typed into the form. "Is there a quote" would pass on any text at all.
  const quoteEl = page.locator('[class*="quote"]:not([class*="quoteMark"])').first()
  const quoted = (await quoteEl.count()) ? (await quoteEl.textContent() || '').trim() : '(no quote element)'
  check('the preview lifts the sentence that was typed', quoted, quoted === EXPECTED)

  if (hasNotLogo) {
    await notLogo.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/photoblock-step3.png` })
  }
  if (hasPreview) {
    // THE EXISTING board preview, not a second thumbnail. A first pass added
    // its own and the screenshot showed two previews of the same advert
    // disagreeing — one with the quotation, one with a monogram.
    const row = page.locator('[class*="cardPreviewFrame"]').first()
    if (await row.count()) {
      await row.scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      await row.screenshot({ path: `${SHOTS}/photoblock-preview.png` })
    }
  }

  // NOTHING IS SUBMITTED. Asserted rather than merely intended, so a future
  // edit that adds a click cannot quietly start publishing test adverts.
  check('still on the form, nothing published', page.url().includes('/post-job'), page.url().includes('/post-job'))
} catch (e) {
  check('the drive completed', 'threw: ' + e.message, false)
  await page.screenshot({ path: `${SHOTS}/photoblock-FAILED.png` }).catch(() => {})
}

await browser.close()

let failed = 0
console.log('')
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}  ${JSON.stringify(r.got)}`)
  else { failed++; console.log(`  FAIL  ${r.name}  got ${JSON.stringify(r.got)}`) }
}
console.log(`\n${results.length - failed}/${results.length} passed · shots in ${SHOTS}/\n`)
process.exit(failed ? 1 : 0)
