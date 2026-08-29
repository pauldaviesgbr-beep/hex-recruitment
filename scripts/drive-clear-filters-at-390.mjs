// CAN A CANDIDATE UNDO A FILTER ON A PHONE?
//
// The fault this watches is NOT "the result count is hidden". It is that
// .filterStripRight held BOTH the count and the only always-present "Clear
// filters" button, and display:none took both. The other clear lives inside
// the empty state, which by definition only renders once the candidate has
// filtered down to ZERO results — so somebody who filters and gets SOME
// results they did not want had no way back except reloading the page.
//
// So this drive does not ask whether the button is visible. It asks whether
// the filter can be undone: apply one, assert the board narrowed, click the
// clear, assert the board came back. A check that only asserted visibility
// would pass on a button that is present and does nothing.
//
// Every element is printed FOUND or NOT FOUND, and both states of the board
// are printed as counts read off the page.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2]
const TAG = process.argv[3]
if (!BASE || !TAG) {
  console.error('usage: node scripts/drive-clear-filters-at-390.mjs <base-url> <before|after>')
  process.exit(2)
}
const SHOTS = 'drive-shots'
mkdirSync(SHOTS, { recursive: true })

const rows = []
const fails = []
const note = t => rows.push('  ' + t)

function probe(sel) {
  const el = document.querySelector(sel)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    text: (el.textContent || '').trim().replace(/[\s ]+/g, ' ').slice(0, 40),
    right: Math.round(r.right * 10) / 10,
    top: Math.round(r.top * 10) / 10,
    w: Math.round(r.width * 10) / 10,
    display: getComputedStyle(el).display,
    visible: el.checkVisibility(),
  }
}

async function look(page, name, sel, vw) {
  const g = await page.evaluate(probe, sel)
  if (!g) { note(name.padEnd(20) + 'NOT FOUND  (' + sel + ')'); return null }
  const past = g.visible && g.right > vw
  note(name.padEnd(20) + 'FOUND  "' + g.text + '"  display=' + g.display +
    '  visible=' + g.visible + '  right=' + g.right + '/' + vw + (past ? '  PAST THE EDGE' : ''))
  return g
}

const count = page => page.evaluate(
  () => ((document.querySelector('[class*="jobCount"]') || {}).textContent || 'NOT FOUND').trim()
)
const cards = page => page.evaluate(() => document.querySelectorAll('[class*="jobCard"]').length)

const browser = await chromium.launch()
try {
  for (const vw of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    rows.push('')
    rows.push('=== ' + vw + ' ===')
    await page.goto(BASE + '/jobs', { waitUntil: 'networkidle' })
    await page.locator('[class*="filterStripLeft"]').first().waitFor({ timeout: 45000 })
    await page.waitForFunction(
      () => /[1-9]/.test((document.querySelector('[class*="jobCount"]') || {}).textContent || ''),
      { timeout: 45000 }
    ).catch(() => {})
    await page.locator('button', { hasText: /^Accept All$/ }).first().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(500)

    const unfilteredCount = await count(page)
    const unfilteredCards = await cards(page)
    note('landed on ' + page.url().replace(BASE, ''))
    note('unfiltered:         ' + unfilteredCount + ' / ' + unfilteredCards + ' cards')
    if (!/[1-9]/.test(unfilteredCount)) fails.push('board never loaded — measured "' + unfilteredCount + '"')

    // ── apply a filter that narrows WITHOUT emptying ──────────────────────
    //
    // THE FILTER CHOICE IS PART OF THE CHECK, AND THE FIRST ONE WAS WRONG.
    // Clicking "Remote" takes the board to ZERO — every live listing is in
    // person — and at zero the EMPTY STATE renders, which carries its own
    // "Clear all filters" button. So the candidate could still recover, and
    // the run proved nothing about the fault. The fault is the case where
    // some results remain: the empty state never appears, and the strip's
    // clear was the only one there was.
    //
    // Every experience level also gives zero, so the select is no good
    // either. A search for "chef" gives 160 of 251 — narrowed, populated,
    // and the state a real candidate is actually in.
    const searchFound = await page.locator('input[class*="searchInput"]').count()
    note('search input:       ' + (searchFound ? 'FOUND' : 'NOT FOUND'))
    if (!searchFound) { fails.push('search input NOT FOUND — nothing was filtered, the rest proves nothing'); await ctx.close(); continue }
    await page.fill('input[class*="searchInput"]', 'chef')
    await page.waitForTimeout(1600)

    const filteredCount = await count(page)
    const filteredCards = await cards(page)
    note('after searching:    ' + filteredCount + ' / ' + filteredCards + ' cards')
    if (filteredCards >= unfilteredCards) {
      fails.push('the filter did not narrow the board (' + unfilteredCards + ' -> ' + filteredCards + ') — the undo test would be vacuous')
    }
    if (filteredCards === 0) {
      fails.push('the filter emptied the board — the empty state and its own clear button appear, so this run cannot test the fault')
    }

    await look(page, 'the count', '[class*="jobCount"]', vw)
    const clear = await look(page, 'Clear filters', '[class*="clearFiltersBtn"]', vw)
    const strip = await look(page, 'filterStripRight', '[class*="filterStripRight"]', vw)

    await page.locator('[class*="filterStrip"]').first()
      .screenshot({ path: SHOTS + '/' + TAG + '-' + vw + '-clear-strip.png' }).catch(() => {})
    await page.screenshot({ path: SHOTS + '/' + TAG + '-' + vw + '-clear-page.png' })

    // ── THE QUESTION: can it be undone? ──────────────────────────────────
    if (!clear || !clear.visible) {
      note('THE UNDO:           UNREACHABLE — the clear control is not visible at ' + vw)
      fails.push(vw + ': "Clear filters" is not reachable, so a filter applied here cannot be undone')
    } else if (clear.right > vw) {
      note('THE UNDO:           UNREACHABLE — the clear control is past the edge')
      fails.push(vw + ': "Clear filters" is past the viewport edge')
    } else {
      await page.locator('[class*="clearFiltersBtn"]').first().click()
      await page.waitForTimeout(900)
      const restoredCount = await count(page)
      const restoredCards = await cards(page)
      note('after clearing:     ' + restoredCount + ' / ' + restoredCards + ' cards')
      if (restoredCards === unfilteredCards && restoredCount === unfilteredCount) {
        note('THE UNDO:           WORKS — clicked, and the board came back to ' + restoredCount)
      } else {
        note('THE UNDO:           CLICKED BUT DID NOT RESTORE')
        fails.push(vw + ': clearing left ' + restoredCards + ' cards, not the original ' + unfilteredCards)
      }
    }
    if (strip) note('strip right row:    top=' + strip.top + ' width=' + strip.w)
    await ctx.close()
  }
} finally {
  await browser.close()
}

console.log(rows.join('\n'))
console.log('\n' + '-'.repeat(64))
if (fails.length) {
  console.log(TAG.toUpperCase() + ': ' + fails.length + ' problem(s)')
  fails.forEach(f => console.log('  ' + f))
} else {
  console.log(TAG.toUpperCase() + ': a filter applied at 390 can be undone at 390')
}
process.exit(0)
