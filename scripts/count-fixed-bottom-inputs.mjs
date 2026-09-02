// EVERY SURFACE PINNED TO THE BOTTOM OF THE VIEWPORT THAT CARRIES AN INPUT.
//
//   node scripts/count-fixed-bottom-inputs.mjs
//
// Filesystem only. Prints a matrix, not a number I chose.
//
// ── WHY ──────────────────────────────────────────────────────────────────
//
// On iOS the software keyboard does NOT shrink the layout viewport — only the
// visual one. So `position: fixed; bottom: 0` keeps resolving to a point that
// is now behind the keyboard, and iOS scrolls the visual viewport to reveal
// the focused input, dragging the fixed element across the content above it.
// `/messages` is where it was found; the question is how many others there
// are, and it has to be answered BEFORE any of them is fixed.
//
// ── WHAT COUNTS, AND WHAT DOES NOT ───────────────────────────────────────
//
// The fault needs TWO things together: an element pinned to the bottom of the
// LAYOUT viewport, and a focusable text control inside it. A fixed banner with
// no input never summons a keyboard. A form in normal flow scrolls with the
// page and is fine.
//
// A full-screen overlay (`inset: 0`, or top/bottom both 0) is pinned to the
// bottom too, so it is included and marked — but it is a DIFFERENT shape from
// a bottom bar and may well behave differently. They are reported separately
// rather than added together, because a single number here would hide the
// distinction that decides the fix.
//
// ── THE PAIRING IS THE MEASUREMENT ───────────────────────────────────────
//
// A CSS class alone says nothing: `.overlay` is fixed in fourteen stylesheets
// and most of those modals have no text field. So this reads the CSS for the
// pinned classes and then reads the COMPONENT that imports that stylesheet to
// see whether it renders an input. Neither half is the answer on its own.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, sep, dirname, basename } from 'node:path'

const files = []
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else files.push(p)
  }
}
walk('app'); walk('components')

const css = files.filter(f => f.endsWith('.css'))
const tsx = files.filter(f => f.endsWith('.tsx'))

// STRIP COMMENTS FIRST. This codebase's stylesheets carry long explanatory
// comments, and several of them contain the words "position: fixed" and
// "bottom" while describing a fault. A first pass counted those as rules.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

// A declaration block, with the selector that opens it.
const RULE = /([^{}]+)\{([^{}]*)\}/g

const RENDERS_TEXT_INPUT =
  /<textarea|<input(?![^>]*type=["'](?:checkbox|radio|hidden|file|submit|button)["'])|contentEditable/

const found = []
for (const f of css) {
  const body = stripComments(readFileSync(f, 'utf8'))
  for (const m of body.matchAll(RULE)) {
    const sel = m[1].trim().split('\n').pop().trim()
    const decl = m[2]
    if (!/position:\s*fixed/.test(decl)) continue
    // BOTTOM: ANY VALUE, NOT bottom: 0.
    // The first version asked for `bottom: 0` and MISSED ChatBot, whose panel
    // is `bottom: calc(24px + var(--consent-h, 0px))` — fixed, anchored to the
    // bottom edge, carrying an input, and autofocusing it on open. An offset
    // from the bottom is still anchored to the bottom, and the iOS keyboard
    // does not care about the 24px. Same shape as checking for the instances
    // instead of the class.
    const bottomAnchored = /bottom:\s*[^;}]+/.test(decl)
    const inset0 = /inset:\s*0/.test(decl)
    if (!bottomAnchored && !inset0) continue
    const top0 = /top:\s*[^;}]+/.test(decl) || inset0
    // THE SPLIT IS DESCRIPTIVE, NOT DECISIVE, AND THE FIRST VERSION HAD IT
    // BACKWARDS. Widening `bottom: 0` to `bottom: <any>` moved
    // `.messagesLayout` out of "bottom bar" and into "full-screen", because it
    // sets top AND bottom — and it is the one surface where this fault is
    // PROVEN. A category that hides the known case is the wrong category.
    //
    // What decides risk is that the element's BOTTOM EDGE is pinned to the
    // layout viewport while an input sits inside it. Everything below is
    // at risk; the sub-split only says what shape it is.
    found.push({
      file: f.split(sep).join('/'),
      selector: sel,
      shape: top0 ? 'full-height panel (top and bottom both pinned)' : 'floating bar (bottom only)',
    })
  }
}

// WHICH COMPONENT USES THAT STYLESHEET, and does it render a text control?
// A stylesheet is imported by the .tsx beside it (page.module.css by page.tsx)
// or by a component of the same name.
const usesStylesheet = (cssPath) => {
  const dir = dirname(cssPath)
  const base = basename(cssPath).replace(/\.module\.css$/, '')
  const candidates = [
    join(dir, base + '.tsx'),
    join(dir, 'page.tsx'),
  ].filter(p => existsSync(p))
  // Fall back to anything importing it by name.
  if (candidates.length === 0) {
    for (const t of tsx) {
      if (readFileSync(t, 'utf8').includes(basename(cssPath))) candidates.push(t)
    }
  }
  return [...new Set(candidates)]
}

const rows = []
for (const hit of found) {
  const owners = usesStylesheet(hit.file.split('/').join(sep))
  const hasInput = owners.some(o => RENDERS_TEXT_INPUT.test(readFileSync(o, 'utf8')))
  rows.push({ ...hit, owners: owners.map(o => o.split(sep).join('/')), hasInput })
}
rows.sort((a, b) =>
  (a.shape.localeCompare(b.shape)) || (Number(b.hasInput) - Number(a.hasInput)) ||
  a.file.localeCompare(b.file))

const bars = rows.filter(r => r.shape.startsWith('floating'))
const full = rows.filter(r => r.shape.startsWith('full-height'))

const table = (label, set) => {
  console.log('')
  console.log(label.toUpperCase() + `  (${set.length})`)
  console.log('')
  console.log('  input?  selector                     file')
  console.log('  ------  ---------------------------  ------------------------------------')
  for (const r of set) {
    console.log('  ' + (r.hasInput ? ' YES  ' : '  -   ') +
      '  ' + r.selector.slice(0, 27).padEnd(27) +
      '  ' + r.file)
  }
}

console.log('SURFACES PINNED TO THE VIEWPORT, AND WHETHER THEY CARRY A TEXT INPUT')
table('floating bars — bottom edge pinned only', bars)
table('full-height panels — top AND bottom pinned (this is the /messages shape)', full)

const atRisk = rows.filter(r => r.hasInput)
console.log('')
console.log('THE ANSWER')
console.log('')
console.log(`  ${bars.filter(r => r.hasInput).length}  floating bars carrying a text input`)
console.log(`  ${full.filter(r => r.hasInput).length}  full-height panels carrying one   <- .messagesLayout is in here`)
console.log(`  ${atRisk.length}  total`)
console.log('')
console.log('  This PRINTS. It does not pass or fail — it is the survey before the sweep,')
console.log('  and whether a full-screen overlay suffers the same fault has to be DRIVEN,')
console.log('  not inferred from the fact that it is also fixed.')
