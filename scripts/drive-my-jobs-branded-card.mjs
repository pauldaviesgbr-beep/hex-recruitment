// THE BRANDED PANEL IN ITS THIRD SLOT: the employer's own Manage Job Ads page.
//
// The board and the detail header are driven elsewhere. This is the slot that
// was only ever INFERRED — "it is the same component, so it must be fine" —
// which is the reasoning the detail header disproved an hour earlier.
//
// AND THIS SLOT HAS A COMBINATION NEITHER OTHER ONE DOES. All four fixture
// adverts are `filled`, so every card also carries the RETIRED treatment: a
// grayscale wash over the panel and a FILLED stamp positioned in the card's
// UPPER HALF — which is exactly where the quotation now lives. Nothing about
// that pairing has ever been looked at, and the two were designed years apart.
//
// STRICTLY READ-ONLY. It signs in, reads tabs and screenshots. It clicks no
// kebab, no Remove, no Reactivate, no Repost, no Edit. The four adverts are
// rows other drives assert against.
//
//   node scripts/drive-my-jobs-branded-card.mjs <base-url>

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

const results = []
const check = (name, got, ok) => results.push({ name, got, ok })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1400 },
  deviceScaleFactor: 2,
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } }
    : {}),
})
const page = await ctx.newPage()

try {
  await page.goto(`${BASE}/login/employer`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30_000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(employer\/dashboard|my-jobs|dashboard)(\?|$|\/)/, { timeout: 60_000 })

  // ALL JOBS, not Active. The four fixtures are `filled`, and filled adverts
  // appear under All — a rule this project got wrong for weeks and wrote down.
  await page.goto(`${BASE}/my-jobs?filter=all`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForFunction(
    () => !/^\s*Loading\.\.\.\s*$/m.test(document.body.innerText || ''),
    null, { timeout: 45_000 },
  ).catch(() => {})
  await page.locator('[class*="jobCard"]').first().waitFor({ timeout: 45_000 })
  await page.waitForTimeout(1500)

  const cards = await page.locator('[class*="jobCard"]').count()
  const branded = page.locator('[class*="jobCardFallback"]')
  const brandedCount = await branded.count()
  check('Manage Job Ads rendered cards', cards, cards > 0)
  // FAIL, not skip, if there are none: the whole point of this drive is that
  // these four adverts have no banner. Zero means the page changed, not that
  // there is nothing to check.
  check('the fixture adverts render the branded card', brandedCount, brandedCount > 0)

  if (brandedCount > 0) {
    const all = await branded.evaluateAll(els => els.map(el => {
      const card = el.getBoundingClientRect()
      const panel = el.querySelector('[class*="panel"]')
      const quote = el.querySelector('[class*="quote"]:not([class*="quoteMark"])')
      const mono = el.querySelector('[class*="monogram"]')
      const tag = el.querySelector('[class*="tag"]:not([class*="tags"])')
      const content = quote || mono || tag
      const title = el.querySelector('h3')
      const chip = el.querySelector('[class*="cardChip"]')
      // The retired treatment: a wash and a word, both of which sit OVER the
      // panel. This is the pairing no other slot has.
      const stamp = el.querySelector('[class*="cardRetired"]:not([class*="Wash"]):not([class*="Wrap"])')

      const overflowing = []
      el.querySelectorAll('*').forEach(n => {
        const r = n.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return
        if (r.right > card.right + 1 || r.bottom > card.bottom + 1 || r.left < card.left - 1) {
          overflowing.push(String(n.className).slice(0, 36))
        }
      })

      const cut = content
        ? Math.round(content.getBoundingClientRect().bottom - content.parentElement.getBoundingClientRect().bottom)
        : null

      // Does the FILLED stamp land on top of the quotation? Both are in the
      // upper half by design, and neither knew about the other.
      let stampOverlap = false
      if (stamp && content) {
        const a = stamp.getBoundingClientRect(), b = content.getBoundingClientRect()
        stampOverlap = a.bottom > b.top + 2 && a.top < b.bottom - 2 && a.right > b.left + 2 && a.left < b.right - 2
      }

      return {
        title: title ? title.textContent.trim().slice(0, 34) : '(none)',
        w: Math.round(card.width), h: Math.round(card.height),
        panelBg: panel ? getComputedStyle(panel).backgroundColor : null,
        shows: quote ? 'quote' : mono ? 'monogram' : tag ? 'tags' : 'nothing',
        text: content ? content.textContent.trim().slice(0, 44) : null,
        cut,
        hasChip: !!chip,
        stamp: stamp ? stamp.textContent.trim() : null,
        stampOverlap,
        overflowing: overflowing.slice(0, 2),
      }
    }))

    console.log('')
    for (const c of all) {
      console.log(`  ${c.w}x${c.h}  ${c.shows.padEnd(9)} ${c.stamp ? '[' + c.stamp + '] ' : ''}${c.title}`)
      if (c.text) console.log(`             "${c.text}"`)
    }

    check('every branded card paints a colour',
      all.filter(c => !c.panelBg || c.panelBg === 'rgba(0, 0, 0, 0)').map(c => c.title),
      all.every(c => c.panelBg && c.panelBg !== 'rgba(0, 0, 0, 0)'))

    check('every branded card shows something',
      all.filter(c => c.shows === 'nothing').map(c => c.title),
      all.every(c => c.shows !== 'nothing'))

    check('nothing is cut off',
      all.filter(c => (c.cut ?? 0) > 1).map(c => `${c.title}: ${c.cut}px`),
      all.every(c => (c.cut ?? 0) <= 1))

    check('nothing runs past a card edge',
      all.flatMap(c => c.overflowing), all.every(c => c.overflowing.length === 0))

    check('no avatar on any branded card',
      all.filter(c => c.hasChip).map(c => c.title), all.every(c => !c.hasChip))

    // THE PAIRING THAT IS NEW HERE.
    const stamped = all.filter(c => c.stamp)
    check('the retired stamp is still drawn over the panel',
      stamped.length ? `${stamped.length} of ${all.length} stamped` : 'none stamped',
      stamped.length > 0)
    check('and it does not sit on top of the quotation',
      all.filter(c => c.stampOverlap).map(c => c.title),
      all.every(c => !c.stampOverlap))

    await page.locator('[class*="jobCard"]').first().screenshot({ path: `${SHOTS}/myjobs-branded-card.png` })
  }

  await page.screenshot({ path: `${SHOTS}/myjobs-branded.png`, fullPage: false })
} catch (e) {
  check('the drive completed', 'threw: ' + e.message, false)
  await page.screenshot({ path: `${SHOTS}/myjobs-FAILED.png` }).catch(() => {})
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
