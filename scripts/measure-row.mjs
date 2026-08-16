// MEASURE ELEMENT AGAINST CONTAINER. Never scrollWidth.
//
// WHY THIS FILE EXISTS. This is the fourth question of the same shape in two
// days — does this row of controls fit, and does my change move anything that
// already fitted — and each time it was answered by a throwaway harness that
// died with its session. CLAUDE.md's own argument applies: a rule reached for
// repeatedly deserves a mechanism rather than another line.
//
// THE TRAP IT EXISTS TO AVOID. html and body both carry `overflow-x: clip`
// (app/globals.css). An element that is too wide inside .main is therefore
// UNREACHABLE, not swipeable — there is no scroller anywhere. The usual walk
// check, `scrollWidth > clientWidth where overflow-x is auto/scroll`, finds
// nothing and reports clean on every one of these. It is not a weak check
// here, it is a blind one. The only honest question is whether a child's
// right edge is past its container's content edge.
//
// WHAT IT REFUSES TO DO:
//   · measure text in a fallback face — a wrong font gives wrong widths, so a
//     missing font THROWS rather than quietly measuring in whatever the OS
//     offers. Run a build first; the woff2 comes off .next.
//   · trust one reading — a reference string is re-measured on every page and
//     the run aborts if it moves, so a face swapping mid-run cannot pass.
//   · call a pass a pass without a control either side. compareRows() is the
//     negative control (did anything move that should not have) and
//     findBreakingPoint() is the positive one (can this instrument SEE the
//     fault it claims is absent).
//
// USAGE — the two questions it is for:
//
//   import { measureRow, compareRows, findBreakingPoint } from './measure-row.mjs'
//
//   // NEGATIVE CONTROL: same markup, CSS before and after. Nothing may move.
//   const before = await measureRow({ css: cssFromGit, markup, selector: '.filters', width: 390 })
//   const after  = await measureRow({ css: cssFromDisk, markup, selector: '.filters', width: 390 })
//   compareRows(before, after)      // -> { identical: true, drift: [] }
//
//   // POSITIVE CONTROL: add children until the UNFIXED row overflows.
//   await findBreakingPoint({ css: cssFromGit, markupFor: n => ..., selector: '.filters', width: 390 })
//
// Nothing here writes to the repo, the database, or the network.

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(path.join(REPO, 'package.json'))('playwright')

/** The real face, or nothing. A fallback font silently changes every number. */
export function findFont(root = path.join(REPO, '.next')) {
  const hits = []
  const walk = d => {
    let ents
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.woff2?$/.test(e.name)) hits.push(p)
    }
  }
  walk(root)
  if (!hits.length) {
    throw new Error(
      `No web font found under ${root}. Run \`npm run build\` first.\n` +
      `REFUSING to measure text in a fallback face — the widths would be wrong ` +
      `and the run would look like it succeeded.`
    )
  }
  // Largest file is the full latin face rather than a subset fragment.
  hits.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)
  return hits[0]
}

const REFERENCE_STRING = 'All Statuses'

const IN_PAGE = ({ selector, reference }) => {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`selector ${selector} matched nothing`)
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const contentRight = r.right - parseFloat(cs.paddingRight)
  const containerWidth = contentRight - (r.left + parseFloat(cs.paddingLeft))
  const gap = parseFloat(cs.columnGap) || 0
  const kids = [...el.children]
  if (!kids.length) throw new Error(`${selector} has no children to measure`)
  const rects = kids.map(k => k.getBoundingClientRect())
  const needed = rects.reduce((s, x) => s + x.width, 0) + gap * (kids.length - 1)
  const maxRight = Math.max(...rects.map(x => x.right))

  const probe = document.createElement('span')
  probe.style.cssText = 'font:400 14px Inter;position:absolute;white-space:nowrap;visibility:hidden'
  probe.textContent = reference
  document.body.appendChild(probe)
  const probeWidth = +probe.getBoundingClientRect().width.toFixed(2)
  probe.remove()

  return {
    containerWidth: +containerWidth.toFixed(1),
    needed: +needed.toFixed(1),
    headroom: +(containerWidth - needed).toFixed(1),
    // Half one: past its own container's content edge.
    overflows: maxRight > contentRight + 0.5,
    pastEdge: +(maxRight - contentRight).toFixed(1),
    rows: new Set(rects.map(x => Math.round(x.top))).size,
    childWidths: rects.map(x => +x.width.toFixed(1)),
    flexWrap: cs.flexWrap,
    flexDirection: cs.flexDirection,
    alignItems: cs.alignItems,
    // Half two: past the VIEWPORT — gone rather than merely unreachable.
    pastViewport: [...document.querySelectorAll('body *')]
      .filter(e => e.getBoundingClientRect().right > window.innerWidth + 0.5)
      .map(e => `${e.className || e.tagName} +${(e.getBoundingClientRect().right - window.innerWidth).toFixed(1)}`),
    fontLoaded: document.fonts.check('400 14px Inter'),
    probeWidth,
  }
}

let _browser = null
let _probeSeen = null

async function browser() {
  if (!_browser) _browser = await chromium.launch()
  return _browser
}

/** Close the shared browser. Call once at the end of a script. */
export async function close() {
  if (_browser) { await _browser.close(); _browser = null }
  _probeSeen = null
}

/**
 * Render `markup` under `css` at `width` and measure `selector`'s children
 * against its content box.
 *
 * css / markup are STRINGS — read them from the real stylesheet and the real
 * component rather than retyping, or the harness measures your typing.
 */
export async function measureRow({
  css, markup, selector, width, height = 900, fontPath = findFont(), fontFamily = 'Inter',
}) {
  if (typeof css !== 'string' || typeof markup !== 'string') {
    throw new Error('measureRow needs css and markup as strings')
  }
  const b64 = fs.readFileSync(fontPath).toString('base64')
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: '${fontFamily}'; src: url(data:font/woff2;base64,${b64}) format('woff2'); font-display: block; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; overflow-x: clip; }
body { font-family: ${fontFamily}, system-ui, sans-serif; line-height: 1.6; }
${css}
</style></head><body>${markup}</body></html>`

  const pg = await (await browser()).newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  try {
    await pg.setContent(html, { waitUntil: 'load' })
    // The scroll/measure race in reverse: settle the FONT before asking any
    // question about width. Never animate and measure.
    //
    // `document.fonts.ready` ALONE IS NOT ENOUGH and the failure is silent in
    // the dangerous direction. It resolves when pending loads finish — so if
    // nothing has yet TRIGGERED a load it resolves immediately, with the face
    // still unloaded. That happens whenever the row's only text lives inside
    // <select> widgets, which the browser paints itself: awaiting ready then
    // returned true-looking timing and a fallback face. Ask for the font
    // explicitly first, then wait.
    await pg.evaluate(async (family) => {
      await document.fonts.load(`400 14px ${family}`)
      await document.fonts.load(`500 14px ${family}`)
      await document.fonts.ready
    }, fontFamily)
    const m = await pg.evaluate(IN_PAGE, { selector, reference: REFERENCE_STRING })

    if (!m.fontLoaded) throw new Error(`INSTRUMENT FAILED: ${fontFamily} did not load — every width below would be a fallback face`)
    if (_probeSeen === null) _probeSeen = m.probeWidth
    else if (Math.abs(_probeSeen - m.probeWidth) > 0.05) {
      throw new Error(`INSTRUMENT UNSTABLE: reference string measured ${m.probeWidth}px here vs ${_probeSeen}px earlier in this run`)
    }
    return { ...m, width, selector }
  } finally {
    await pg.close()
  }
}

/**
 * NEGATIVE CONTROL. Two measurements of the same markup under different CSS
 * must be geometrically identical. A layout rule that moves something today
 * has done work nobody asked for, and that is a failure, not a bonus.
 */
export function compareRows(before, after) {
  const drift = []
  if (before.containerWidth !== after.containerWidth) drift.push(`container ${before.containerWidth} -> ${after.containerWidth}`)
  if (before.rows !== after.rows) drift.push(`rows ${before.rows} -> ${after.rows}`)
  if (JSON.stringify(before.childWidths) !== JSON.stringify(after.childWidths)) {
    drift.push(`child widths ${JSON.stringify(before.childWidths)} -> ${JSON.stringify(after.childWidths)}`)
  }
  return { identical: drift.length === 0, drift }
}

/**
 * POSITIVE CONTROL. Grow the row until it actually overflows, and report how
 * many children that took.
 *
 * A fixed "add one and see" is not good enough: a row with 185px of headroom
 * legitimately absorbs one more child and reports "no overflow", which proves
 * nothing about that page. This asks the question that HAS two answers.
 *
 * Returns null if it never overflows within `max` — which is itself a finding,
 * not a pass.
 */
export async function findBreakingPoint({ css, markupFor, selector, width, max = 6, ...rest }) {
  for (let n = 1; n <= max; n++) {
    const m = await measureRow({ css, markup: markupFor(n), selector, width, ...rest })
    if (m.overflows) return { extraChildren: n, ...m }
  }
  return null
}
