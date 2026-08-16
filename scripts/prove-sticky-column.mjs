// Does the sticky identity column actually hold position, and is its
// background actually opaque? Measured in a real engine, not argued from CSS.
//
// This is a RECONSTRUCTION: it proves the CSS RULES behave, not that the
// component emits them. The second claim is asserted separately, against the
// JSX, in sticky-structure.mjs. No session can reach /admin, so this is the
// most that can be driven here and it is labelled as such.
//
// The control is the same page with the sticky block deleted. If the "before"
// and "after" measurements were the same, the probe could not tell the two
// states apart and would prove nothing whichever way it landed.

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const css = readFileSync('components/admin/AdminTable.module.css', 'utf8')

// The rules under test, lifted verbatim. Everything else on the page is
// scaffolding.
const STICKY_BLOCK_PRESENT = css.includes('.stickyCol {') && css.includes('position: sticky')
if (!STICKY_BLOCK_PRESENT) {
  console.error('FAIL: no .stickyCol / position:sticky in the stylesheet — nothing to test')
  process.exit(1)
}

function page(withSticky) {
  // Strip the sticky declarations for the control run. Asked as two questions
  // with different answers: with the block, the cell must not move; without
  // it, it must.
  const sheet = withSticky
    ? css
    : css.replace(/position: sticky;/g, 'position: static;')

  return `<!doctype html><meta charset=utf-8>
<style>
  body { margin: 0; font: 14px system-ui; }
  #frame { width: 390px; }
  ${sheet}
</style>
<div id=frame>
  <div class="wrapper">
    <div class="tableContainer">
      <table class="table" style="--sticky-offset: 40px">
        <thead><tr>
          <th class="th stickyCheck"><input type=checkbox></th>
          <th class="th stickyCol">Job title</th>
          ${Array.from({ length: 7 }, (_, i) => `<th class="th">Column ${i + 1}</th>`).join('')}
        </tr></thead>
        <tbody>
          <tr class="row">
            <td class="td stickyCheck"><input type=checkbox></td>
            <td class="td stickyCol" id="identity">Head Chef — The Ivy Bath</td>
            ${Array.from({ length: 7 }, (_, i) => `<td class="td">value ${i + 1}</td>`).join('')}
          </tr>
          <tr class="row selected">
            <td class="td stickyCheck"><input type=checkbox checked></td>
            <td class="td stickyCol" id="identitySelected">Sous Chef</td>
            ${Array.from({ length: 7 }, (_, i) => `<td class="td">value ${i + 1}</td>`).join('')}
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>`
}

const browser = await chromium.launch()
const p = await browser.newPage({ viewport: { width: 390, height: 800 } })

async function measure(withSticky) {
  await p.setContent(page(withSticky))
  return p.evaluate(() => {
    const c = document.querySelector('.tableContainer')
    const id = document.querySelector('#identity')
    const sel = document.querySelector('#identitySelected')
    const other = document.querySelectorAll('.td:not(.stickyCol):not(.stickyCheck)')[3]

    const before = { id: id.getBoundingClientRect().left, other: other.getBoundingClientRect().left }
    // Instantaneous. A smooth scroll would still be moving when the next line
    // reads the position, and the answer would be somewhere on the way there.
    c.scrollLeft = c.scrollWidth - c.clientWidth
    const after = { id: id.getBoundingClientRect().left, other: other.getBoundingClientRect().left }

    const check = document.querySelector('.td.stickyCheck')

    return {
      scrollable: c.scrollWidth > c.clientWidth,
      scrolledBy: c.scrollLeft,
      identityMoved: Math.round(before.id - after.id),
      otherMoved: Math.round(before.other - after.other),
      identityLeft: Math.round(after.id),
      bg: getComputedStyle(id).backgroundColor,
      bgSelected: getComputedStyle(sel).backgroundColor,
      width: Math.round(id.getBoundingClientRect().width),
      rowBg: getComputedStyle(document.querySelector('.row')).backgroundColor,
      // THE INVARIANT, not a magic number: the identity column's sticky offset
      // is a constant in the CSS, and it is only correct if the checkbox
      // column is ACTUALLY that wide. Those were different numbers, and
      // nothing but a measurement could have said so.
      checkboxWidth: Math.round(check.getBoundingClientRect().width),
      // EVERY sticky cell, not the one that came to mind. The first version of
      // this probe sampled a body cell, passed, and the HEADER cell was
      // transparent — the scrolling column labels read straight through
      // "JOB TITLE" as a pile of overlapping words. A screenshot found it;
      // this line is so the next one does not need a screenshot.
      transparentStickyCells: Array.from(document.querySelectorAll('[class*="sticky"]'))
        .filter(el => /rgba\(0, 0, 0, 0\)/.test(getComputedStyle(el).backgroundColor))
        .map(el => `${el.tagName}:${(el.textContent || '').trim().slice(0, 20)}`),
      declaredOffset: parseInt(getComputedStyle(document.querySelector('.table')).getPropertyValue('--sticky-offset'), 10),
    }
  })
}

const on = await measure(true)
const off = await measure(false)
await browser.close()

const fails = []
if (!on.scrollable) fails.push('the reconstruction does not scroll at all — the probe cannot see the thing')
if (on.identityMoved !== 0) fails.push(`identity column moved ${on.identityMoved}px while scrolled (must be 0)`)
if (on.otherMoved <= 0) fails.push('no other column moved — nothing actually scrolled under it')
if (off.identityMoved <= 0) fails.push(`CONTROL FAILED: without position:sticky the identity column still did not move (${off.identityMoved}px). This probe cannot distinguish the two states.`)
if (on.transparentStickyCells.length) fails.push(`${on.transparentStickyCells.length} sticky cell(s) transparent — the scrolling columns read through them: ${JSON.stringify(on.transparentStickyCells)}`)
if (on.bgSelected === on.bg) fails.push(`selected row's sticky cell has the same background as an unselected one (${on.bgSelected}) — the wash is not inheriting`)
if (on.width !== 112) fails.push(`sticky column is ${on.width}px at 390, spec says 112px`)
if (on.checkboxWidth !== on.declaredOffset) fails.push(`the identity column is offset by ${on.declaredOffset}px but the checkbox column renders ${on.checkboxWidth}px — they do not stick as one unit, and the ${Math.abs(on.checkboxWidth - on.declaredOffset)}px difference is where one slides under the other`)

console.log(JSON.stringify({ withSticky: on, control_withoutSticky: off, fails }, null, 2))
console.log(fails.length ? `\nFAIL (${fails.length}):\n  ${fails.join('\n  ')}` : '\nPASS — column held at 0px while the rest scrolled; control moved; background opaque and inherited')
process.exit(fails.length ? 1 : 0)
