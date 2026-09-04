// THE SIDEBAR FAMILY SITS ON THE TOKENS, BELOW EVERY MODAL.
//
//   node scripts/prove-sidebar-z-tokens.mjs
//
// Filesystem only. No network, no database, milliseconds. In verify.
//
// ── WHAT THIS GUARDS ─────────────────────────────────────────────────────
//
// For weeks the sidebar family lived on hardcoded literals (nav 1000,
// toggle 1001, overlay 1099, drawer 1100) while every modal sat at
// var(--z-modal) = 200. The 31 Aug entry called it: "a real fault waiting
// for somebody to open a modal." On 4 Sept 2026 somebody did, on camera —
// /saved-jobs opens the advert in JobDetailModal, and the hamburger
// painted ON TOP of the advert (elementFromPoint, measured), reading to a
// person as the icon drifting over the page.
//
// The fix is the shape that entry recorded: the family moves ONTO tokens
// BELOW the modals; --z-modal is never raised (raising it pushes sixteen
// modals over the cookie banner — the wrong-way fix, named in advance).
//
// ── WHAT IS ASSERTED — VALUES AND RELATIONSHIPS, NOT PRESENCE ────────────
//
// The democrop lesson: asserting a property EXISTS passes on a wrong
// value. So this parses the numbers and asserts the ORDERING that makes
// the fix true — every sidebar token above the header, below the modal,
// relative order inside the family preserved. And it asserts the two
// sidebar stylesheets carry ZERO hardcoded z-index numbers, so the fault
// cannot come back as a literal typed into one of them — with a zero-
// guard, because a file with no z-index lines at all must read as the
// SEARCH breaking, not as a pass.

import { readFileSync } from 'node:fs'

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(64) + (detail ?? ''))
}

const globals = readFileSync('app/globals.css', 'utf8')
const token = (name) => {
  const m = globals.match(new RegExp(`--${name}:\\s*(\\d+)`))
  return m ? Number(m[1]) : null
}

console.log('the sidebar z tokens')
console.log('')

const header = token('z-header')
const modal = token('z-modal')
const nav = token('z-sidebar-nav')
const toggle = token('z-sidebar-toggle')
const overlay = token('z-sidebar-overlay')
const drawer = token('z-sidebar')

check('all four sidebar tokens are declared in globals.css',
  [nav, toggle, overlay, drawer].every(v => v !== null),
  `nav=${nav} toggle=${toggle} overlay=${overlay} drawer=${drawer}`)

if ([header, modal, nav, toggle, overlay, drawer].every(v => v !== null)) {
  check('the whole family sits ABOVE the header', Math.min(nav, toggle, overlay, drawer) > header,
    `min ${Math.min(nav, toggle, overlay, drawer)} vs header ${header}`)
  check('the whole family sits BELOW every modal', Math.max(nav, toggle, overlay, drawer) < modal,
    `max ${Math.max(nav, toggle, overlay, drawer)} vs modal ${modal}`)
  check('relative order preserved: nav < toggle < overlay < drawer',
    nav < toggle && toggle < overlay && overlay < drawer,
    `${nav} < ${toggle} < ${overlay} < ${drawer}`)
}

console.log('')
for (const f of ['components/CandidateSidebar.module.css', 'components/EmployerSidebar.module.css']) {
  const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const zLines = css.match(/z-index:[^;]+;/g) || []
  const literals = zLines.filter(l => /z-index:\s*\d/.test(l))
  const tokens = zLines.filter(l => /z-index:\s*var\(--z-sidebar/.test(l))
  // ZERO-GUARD: a sidebar stylesheet with no z-index lines at all means the
  // search is broken or the file was gutted — never a pass.
  check(`${f.split('/').pop()} still declares z-index at all`, zLines.length >= 4, `${zLines.length} lines`)
  check(`…zero HARDCODED z-index literals`, literals.length === 0,
    literals.length ? literals.join(' ') : '')
  check(`…and the family lines use the sidebar tokens`, tokens.length >= 4, `${tokens.length}`)
}

console.log('')
if (bad) { console.log(`${bad} FAILED`); process.exit(1) }
console.log('the sidebar family is on the tokens, above the header, below every modal')
process.exit(0)
