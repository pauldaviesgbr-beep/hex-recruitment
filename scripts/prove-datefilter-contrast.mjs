// THE SELECTED DATE PILL GOES BLACK-ON-BLACK, and it is a specificity fault
// rather than a missing rule. Reported from a phone on 18 Aug 2026: "the tabs
// completely black out when you click on them".
//
//   .dateFilterBtn:hover      { color: #1e293b }   specificity 0,2,0
//   .dateFilterBtnActive      { color: #FFE500 }   specificity 0,1,0
//
// Hover wins, so the active pill's text is repainted the same navy as its own
// background. On a desktop it recovers when the pointer leaves. ON A TOUCH
// DEVICE THE HOVER STICKS after the tap, so the label stays invisible until
// you tap somewhere else — which is why this was found on a phone and not in
// any of the drives.
//
// Measured, not read: the rendered colours come from getComputedStyle in a
// real engine, and the control is the same markup WITHOUT the hover, which
// must give a different answer or this probe proves nothing.

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const css = readFileSync('app/dashboard/analytics/page.module.css', 'utf8')

const page = (withHoverRule) => `<!doctype html><meta charset=utf-8>
<style>
${withHoverRule ? css : css.replace(/\.dateFilterBtn:hover\s*\{[^}]*\}/, '')}
</style>
<button id="pill" class="dateFilterBtn dateFilterBtnActive">30 Days</button>`

const browser = await chromium.launch()
const results = []

async function measure(withHoverRule, hovering) {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.setContent(page(withHoverRule))
  if (hovering) await p.hover('#pill')
  // WAIT FOR THE COLOUR TO SETTLE. The rule carries transition: all 0.2s, and
  // the first version of this probe read getComputedStyle immediately after
  // hover(). It got rgb(239,216,4) — yellow about 6% of the way to navy — and
  // PASSED, reporting a legible button on a page where the label is invisible.
  // A false pass in the dangerous direction, and exactly the "never both
  // animate and measure" fault. Polls until two consecutive reads agree
  // rather than sleeping: a sleep long enough today is a race lost later.
  await p.waitForFunction(() => {
    const el = document.getElementById('pill')
    const now = getComputedStyle(el).color
    const settled = window.__last === now
    ;window.__last = now
    return settled
  }, null, { polling: 60, timeout: 5000 })
  const out = await p.evaluate(() => {
    const el = document.getElementById('pill')
    const s = getComputedStyle(el)
    return { color: s.color, background: s.backgroundColor }
  })
  await ctx.close()
  return out
}

/**
 * THE PHONE HALF, AND WHAT IT CAN AND CANNOT SHOW.
 *
 * The first version of this tapped the pill on a mobile context and checked
 * the colours. IT PASSED ON THE BROKEN CSS TOO — Playwright's tap() does not
 * leave a sticky :hover behind, so the check could not distinguish the two
 * states and proved nothing whichever way it landed. Exactly the fault this
 * file exists to avoid, found by running it against the original.
 *
 * What CAN be measured honestly is the guard's own condition: on a touch
 * context `(hover: hover)` must evaluate FALSE, which is what keeps the rule
 * off the phone entirely. The desktop cases above prove the :not() guard, and
 * this proves the media query is doing something rather than being decorative.
 *
 * NOT DRIVEN: sticky hover after a real finger tap. That needs a real device.
 */
async function measureTouch() {
  const ctx = await browser.newContext({
    hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 },
  })
  const p = await ctx.newPage()
  await p.setContent(page(true))
  const out = await p.evaluate(() => ({
    hoverCapable: window.matchMedia('(hover: hover)').matches,
    anyHover: window.matchMedia('(any-hover: hover)').matches,
  }))
  await ctx.close()
  return out
}

/** AND THE AFFORDANCE MUST SURVIVE. Guarding with :not() could be
 *  over-applied; an UNSELECTED pill must still respond to hover, or the fix
 *  has traded one fault for a duller page. */
async function measureUnselected() {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.setContent(page(true).replace(' dateFilterBtnActive', ''))
  const before = await p.evaluate(() => getComputedStyle(document.getElementById('pill')).color)
  await p.hover('#pill')
  await p.waitForFunction(() => {
    const now = getComputedStyle(document.getElementById('pill')).color
    const settled = window.__u === now
    window.__u = now
    return settled
  }, null, { polling: 60, timeout: 5000 })
  const after = await p.evaluate(() => getComputedStyle(document.getElementById('pill')).color)
  await ctx.close()
  return { before, after }
}

const hovered = await measure(true, true)
const resting = await measure(true, false)
const control = await measure(false, true)   // hover rule deleted
const touched = await measureTouch()
const unselected = await measureUnselected()

await browser.close()

const same = (a, b) => a === b
const check = (name, got, want, ok) => results.push({ name, got, want, ok })

// THE FAULT: while hovered, text colour equals background colour.
check('hovered: text is the same colour as the background',
  `${hovered.color} on ${hovered.background}`, 'they must differ',
  !same(hovered.color, hovered.background))

// THE CONTROL, and it is what makes the check meaningful: at rest the same
// element is legible, so the probe can tell the two states apart.
check('at rest: text and background differ',
  `${resting.color} on ${resting.background}`, 'they must differ',
  !same(resting.color, resting.background))

// SECOND CONTROL: with the hover rule deleted, hovering must no longer break
// it. If this failed, the cause would be something other than that rule.
check('hover rule removed: hovering no longer collapses it',
  `${control.color} on ${control.background}`, 'they must differ',
  !same(control.color, control.background))

// The media query the phone fix rests on. Not "the phone is fixed" — see the
// note on measureTouch for why that cannot be driven here.
check('on a touch context, (hover: hover) is false so the rule cannot apply',
  `hover:hover=${touched.hoverCapable} any-hover:hover=${touched.anyHover}`,
  'hover:hover must be false',
  touched.hoverCapable === false)

// THE OVER-FIX GUARD. :not() must not have killed hover on the pills that
// still want it.
check('an unselected pill still responds to hover',
  `${unselected.before} -> ${unselected.after}`, 'they must differ',
  !same(unselected.before, unselected.after))

let failed = 0
for (const r of results) {
  if (r.ok) console.log(`  ok    ${r.name}  ->  ${r.got}`)
  else { failed++; console.log(`  FAIL  ${r.name}\n          ${r.got}`) }
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
