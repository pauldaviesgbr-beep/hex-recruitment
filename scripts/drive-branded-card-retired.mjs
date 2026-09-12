// THE BRANDED PANEL UNDER THE RETIRED TREATMENT.
//
// ── THIS DRIVE MOVED SURFACE, AND THAT IS NOT A URL CHANGE ──────────────
//
// It used to read /my-jobs, because that page rendered the board's own
// photographic FeedCard and all four fixture adverts are `filled` -- so
// every card there carried BOTH the branded no-photograph panel AND the
// retired wash. That pairing was the whole point: no other slot had it, and
// the two treatments were designed years apart without either knowing about
// the other.
//
// THE SEPTEMBER REBUILD TOOK FeedCard OFF /my-jobs ENTIRELY. The employer
// now sees a management card, and the public view is one tap away on View.
// So the subject of this drive did not change — it LEFT that page.
//
// Pointing it at ?filter=live would have been the quiet failure: a drive
// that finds no branded cards, on a page that correctly has none, reporting
// red about a product that is right. The honest move is to follow the
// subject, and after the rebuild there is exactly ONE `retired=` call site
// left in the codebase -- app/temp-work/page.tsx:696, the shift feed, where
// a retired shift gets the same wash over the same branded panel. Same two
// treatments, same collision, same assertions.
//
// ── ONE ASSERTION HAD TO SOFTEN, AND HERE IS WHY ───────────────────────
//
// On /my-jobs the population was four known fixture adverts, so "no branded
// cards found" could only mean the page had changed, and this file said so:
// FAIL, not skip. On /temp-work the population is whatever shifts are live,
// which nobody controls and which the takes routinely empty. So a run that
// finds no retired branded card now SKIPS with exit 2 and says what it was
// looking for.
//
// THAT IS A REAL LOSS OF COVERAGE AND IT IS NAMED RATHER THAN HIDDEN: a
// skip is a check that did not run, and a check that usually skips is a
// check nobody will notice has stopped working. If the shift feed is empty
// for long the right answer is a fixture this drive creates and removes
// itself, not a lower bar.
//
// STRICTLY READ-ONLY. It reads and screenshots. It clicks nothing.
//
//   node scripts/drive-branded-card-retired.mjs <base-url>

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const SHOTS = 'drive-shots'

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
  // No sign-in. The shift feed is public, and a drive that needs no
  // credential is a drive that cannot spend one.
  await page.goto(`${BASE}/temp-work`, { waitUntil: 'domcontentloaded', timeout: 90_000 })

  // WAIT ON A PREDICATE THAT IS FALSE WHILE THE ANSWER IS MISSING. A card
  // or an empty state -- either is a settled page; neither is "the nav has
  // rendered", which is what a text-length threshold actually measures.
  await page.waitForFunction(() => {
    return document.querySelector('[class*="jobCard"]') !== null
      || /no shifts|nothing here|no results/i.test(document.body.innerText || '')
  }, null, { timeout: 45_000 }).catch(() => {})

  // THE STATE THIS DRIVE IS ABOUT: a branded panel that is ALSO retired.
  // Both halves, together, or there is nothing here to measure.
  const retiredBranded = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[class*="jobCardFallback"]')]
    return els.filter(el => el.closest('[class*="jobCard"]')?.querySelector('[class*="cardRetiredBadge"]')).length
  })
  if (retiredBranded === 0) {
    console.error('SKIP  no retired branded card on the shift feed right now — this drive needs a shift that is both photo-less and retired, and the feed has none')
    await browser.close()
    process.exit(2)
  }
  console.log(`the feed shows: ${retiredBranded} retired branded card(s)`)

  const cards = await page.locator('[class*="jobCard"]').count()
  const branded = page.locator('[class*="jobCardFallback"]')
  const brandedCount = await branded.count()
  check('the shift feed rendered cards', cards, cards > 0)
  // Reaching here at all means the guard above found a retired branded card,
  // so a zero now really would mean the page changed under us.
  check('at least one shift renders the branded card', brandedCount, brandedCount > 0)

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

    // A RETIRED PANEL IS COLOUR ONLY, on purpose — no quote, no tags, no
    // monogram. The wash and the badge carry it. So the assertion is not
    // "something is shown" but "the right thing for the state".
    check('a retired panel is colour only',
      all.filter(c => c.shows !== 'nothing').map(c => c.title + ': ' + c.shows),
      all.every(c => c.shows === 'nothing'))

    check('nothing is cut off',
      all.filter(c => (c.cut ?? 0) > 1).map(c => `${c.title}: ${c.cut}px`),
      all.every(c => (c.cut ?? 0) <= 1))

    check('nothing runs past a card edge',
      all.flatMap(c => c.overflowing), all.every(c => c.overflowing.length === 0))

    // FLIPPED with its sibling on the board. The branded card carried no avatar
    // — design's decision, on the grounds that three of five marks are
    // illegible at 26px — until the live board put the two card types side by
    // side and the missing chip read as a hole rather than as a choice.
    check('every branded card has its avatar, like the photo card',
      all.filter(c => !c.hasChip).map(c => c.title), all.every(c => c.hasChip))

    // THE PAIRING THAT IS NEW HERE, and both halves changed because of it.
    const stamped = all.filter(c => c.stamp)
    check('every retired advert still says so',
      stamped.length + ' of ' + all.length, stamped.length === all.length)
    check('and the badge is inside the card',
      all.filter(c => c.overflowing.length).map(c => c.title),
      all.every(c => c.overflowing.length === 0))

    // A RETIRED ADVERT MUST NOT SELL ITSELF. The quotation is the employer
    // pitching the job; under FILLED it is pitching a job that has gone. This
    // is the assertion for that decision, not for the layout it also fixed.
    check('a retired advert shows no quotation',
      all.filter(c => c.shows === 'quote').map(c => c.title),
      all.every(c => c.shows !== 'quote'))

    await page.locator('[class*="jobCard"]').first().screenshot({ path: `${SHOTS}/tempwork-branded-card.png` })
  }

  await page.screenshot({ path: `${SHOTS}/tempwork-branded.png`, fullPage: false })
} catch (e) {
  check('the drive completed', 'threw: ' + e.message, false)
  await page.screenshot({ path: `${SHOTS}/tempwork-FAILED.png` }).catch(() => {})
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
