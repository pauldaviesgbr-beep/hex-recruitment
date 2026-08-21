// THE NO-PHOTOGRAPH CARD, ON THE REAL BOARD, BESIDE THE PHOTO CARDS.
//
// "State beats screen for whether it's CORRECT; screen beats state for whether
// it's FINISHED." Every assertion about the colour rule and the sentence rule
// passes offline — and none of them can see a quotation colliding with the
// title, a monogram cropped by the card edge, or a panel that reads as a bug
// beside 226 photographs. Only a picture answers that, and the mixed grid is
// the only comparison design says matters.
//
// STRICTLY READ-ONLY. It signs in as nobody and clicks nothing that writes.
//
// It ASSERTS as well as photographs, because a screenshot that looks fine is
// not the same as a card that is correct:
//   · the panel really is painting a colour, not left transparent
//   · white type on it clears 4.5:1 — the band's whole promise
//   · nothing inside the panel overflows the card
//   · the branded card carries NO avatar and the photo card still does
//
//   node scripts/drive-branded-card.mjs <base-url>

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const SHOTS = 'drive-shots'

if (BASE.includes('.vercel.app') && !BYPASS) {
  console.error('SKIP  preview target needs VERCEL_AUTOMATION_BYPASS_SECRET')
  process.exit(2)
}
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, got, ok) => results.push({ name, got, ok })

// sRGB relative luminance, for the contrast the band exists to guarantee.
const lum = ([r, g, b]) => {
  const c = [r, g, b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const parseRgb = s => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)

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
  await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle', timeout: 90_000 })
  // Wait for real cards rather than a fixed sleep: this page is client-rendered
  // and curl cannot see it at all, which is the whole reason this is a browser.
  await page.locator('[class*="jobCard"]').first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(1200)   // let the grid settle before measuring

  const total = await page.locator('[class*="jobCard"]').count()
  check('the board rendered cards', total, total > 50)

  // ── FIND THE BRANDED ONES ────────────────────────────────────────────────
  // By the class the card itself sets for "no banner", not by looking for a
  // panel — asking "is the fallback class present" is a question about the
  // card's own decision rather than about my selector guessing right.
  const branded = page.locator('[class*="jobCardFallback"]')
  const brandedCount = await branded.count()
  check('at least one branded card is on the board', brandedCount, brandedCount >= 1)

  if (brandedCount === 0) {
    console.log('\nNo branded card on this board — nothing further to measure.')
  } else {
    const first = branded.first()
    await first.scrollIntoViewIfNeeded()
    // Default 'auto' scrolling, deliberately: a smooth scroll is still moving
    // when the next line asks where the thing is.
    await page.waitForTimeout(400)

    const m = await first.evaluate(el => {
      const panel = el.querySelector('[class*="panel"]')
      const quote = el.querySelector('[class*="quote"]:not([class*="quoteMark"])')
      const mono = el.querySelector('[class*="monogram"]')
      const tag = el.querySelector('[class*="tag"]:not([class*="tags"])')
      const title = el.querySelector('h3')
      const chip = el.querySelector('[class*="cardChip"]')
      const card = el.getBoundingClientRect()

      // Every descendant, asked whether it sticks out of the card. Checking a
      // CLASS of fault rather than the two elements I happen to suspect.
      const overflowing = []
      el.querySelectorAll('*').forEach(n => {
        const r = n.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return
        if (r.right > card.right + 1 || r.bottom > card.bottom + 1 || r.left < card.left - 1 || r.top < card.top - 1) {
          overflowing.push((n.className || n.tagName) + '')
        }
      })

      return {
        panelBg: panel ? getComputedStyle(panel).backgroundColor : null,
        quoteText: quote ? quote.textContent.trim() : null,
        quoteColour: quote ? getComputedStyle(quote).color : null,
        monogram: mono ? mono.textContent.trim() : null,
        tagText: tag ? tag.textContent.trim() : null,
        titleText: title ? title.textContent.trim() : null,
        hasChip: !!chip,
        overflowing: overflowing.slice(0, 4),
        // IS THE PANEL CONTENT CLIPPED BY ITS OWN BLOCK?
        //
        // This started as an overlap test between the content's rect and the
        // title's, and that was the wrong question twice over. A clipped
        // element still reports its FULL layout rect, so the test reported an
        // overlap that was not visible — and it reported "clear" on a monogram
        // that was cropped straight through the letterforms, because a cropped
        // letter does not overlap anything.
        //
        // Clipping is the fault. Ask the block whether its content fits.
        clipped: (() => {
          const content = quote || mono || tag
          if (!content) return null
          const block = content.closest('[class]')
          if (!block) return null
          const over = block.scrollHeight - block.clientHeight
          return over > 2 ? `${over}px of content does not fit` : false
        })(),
      }
    })

    check('the panel paints a colour', m.panelBg,
      !!m.panelBg && m.panelBg !== 'rgba(0, 0, 0, 0)' && m.panelBg !== 'transparent')
    check('it shows a quote, tags or a monogram',
      m.quoteText || m.tagText || m.monogram || '(nothing)',
      !!(m.quoteText || m.tagText || m.monogram))
    check('NO avatar on the branded card', m.hasChip ? 'chip present' : 'none', m.hasChip === false)
    check('nothing inside the panel overflows the card',
      m.overflowing.length ? m.overflowing : 'none', m.overflowing.length === 0)
    check('the panel content is not clipped by its own block',
      m.clipped === false ? 'fits' : m.clipped, m.clipped === false)

    if (m.quoteColour && m.panelBg) {
      const [l1, l2] = [lum(parseRgb(m.quoteColour)), lum(parseRgb(m.panelBg))].sort((a, b) => b - a)
      const ratio = (l1 + 0.05) / (l2 + 0.05)
      check(`quote contrast on the panel (${ratio.toFixed(1)}:1)`, ratio.toFixed(2), ratio >= 4.5)
    }

    console.log(`\n  branded card: ${m.titleText}`)
    console.log(`  panel ${m.panelBg} · ${m.quoteText ? `quote "${m.quoteText}"` : m.tagText ? `tags "${m.tagText}"` : `monogram "${m.monogram}"`}`)

    await first.screenshot({ path: `${SHOTS}/branded-card-single.png` })
  }

  // THE PHOTO CARD MUST BE UNCHANGED — it is the thing the handoff most asks
  // us to protect, and the avatar rule is the one place this change could have
  // reached it.
  const photo = page.locator('[class*="jobCard"]:not([class*="jobCardFallback"])').first()
  const photoHasChip = await photo.locator('[class*="cardChip"]').count()
  check('the PHOTO card still has its avatar', photoHasChip ? 'yes' : 'no', photoHasChip > 0)

  // THE MIXED GRID — the only comparison design says matters, because the board
  // is permanently mixed.
  await page.locator('[class*="jobsGrid"]').first().screenshot({ path: `${SHOTS}/branded-mixed-grid.png` }).catch(() => {})
  await page.screenshot({ path: `${SHOTS}/branded-board.png`, fullPage: false })

  // AND ON A PHONE, where the card is widest relative to its type and the
  // quotation has the fewest characters per line.
  const phone = await ctx.newPage()
  await phone.setViewportSize({ width: 390, height: 844 })
  await phone.goto(`${BASE}/jobs`, { waitUntil: 'networkidle', timeout: 90_000 })
  await phone.locator('[class*="jobCard"]').first().waitFor({ timeout: 60_000 })
  await phone.waitForTimeout(1200)
  const pb = phone.locator('[class*="jobCardFallback"]').first()
  if (await pb.count()) {
    await pb.scrollIntoViewIfNeeded()
    await phone.waitForTimeout(400)
    await pb.screenshot({ path: `${SHOTS}/branded-card-phone.png` })
  }
  await phone.screenshot({ path: `${SHOTS}/branded-board-phone.png` })
} catch (e) {
  check('the drive completed', 'threw: ' + e.message, false)
  await page.screenshot({ path: `${SHOTS}/branded-FAILED.png` }).catch(() => {})
}

await browser.close()

let failed = 0
console.log('')
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}${r.got !== undefined ? `  (${JSON.stringify(r.got)})` : ''}`)
  else { failed++; console.log(`  FAIL  ${r.name}  got ${JSON.stringify(r.got)}`) }
}
console.log(`\n${results.length - failed}/${results.length} passed · shots in ${SHOTS}/\n`)
process.exit(failed ? 1 : 0)
