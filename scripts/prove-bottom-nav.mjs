// THE BOTTOM BAR'S TWO STRUCTURAL RULES, ASSERTED RATHER THAN REMEMBERED.
//
//   node scripts/prove-bottom-nav.mjs
//
// Filesystem only. No network, no database, milliseconds. In verify.
//
// ── WHY THESE TWO AND NOT A SCREENSHOT ───────────────────────────────────
//
// Both faults are invisible in a browser and cost a fortnight of discovery
// on a handset each. Neither produces a red anywhere: the page renders, the
// assertions about content pass, and the damage only appears on a real phone
// held by a real person.
//
//   1. TWO BOTTOM PADDINGS. globals.css reserves ONE padding-bottom on body,
//      summing every fixed thing at the foot. It used to be two: a
//      `body { padding-bottom: 80px }` for the chat launcher sat at the same
//      specificity as the consent reserve and, being later, silently WON —
//      so --consent-h was published and then ignored, and the cookie banner
//      covered the Apply button on a job post. That cost Javier Salido his
//      application on 13 Aug 2026. Adding a bar at the foot is exactly the
//      shape of change that reintroduces it.
//
//   2. A LITERAL 70px INSTEAD OF var(--nav-height). The token is
//      calc(70px + env(safe-area-inset-top, 0px)). env() is ZERO in every
//      desktop browser and cannot be set from script, so a literal measures
//      identically to the token everywhere a check can see — and is 59px
//      short in the iOS WKWebView, where nobody is looking.
//
// ── WHAT IS ASSERTED: THE AGREEMENT, NOT EITHER SIDE ─────────────────────
//
// "The bar publishes a token" passes on a token nothing reads. "The sum
// mentions --nav-bottom-h" passes on a bar that never sets it. Each rule
// below needs BOTH halves to be true, which is the only form that cannot be
// satisfied by half a change.

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')

/**
 * STRIP COMMENTS BEFORE MATCHING, AND THIS IS NOT TIDINESS.
 *
 * The first run of this script reported five failures against correct code.
 * Both files DOCUMENT the fault they must not contain — globals.css explains
 * that the bar must never get "its own `body { padding-bottom }`", and
 * BottomNav.module.css opens with "NO `body { padding-bottom }` IN THIS FILE".
 * So a check searching for that pattern found it, in the sentence forbidding
 * it, and called the code broken.
 *
 * It also broke the other direction: the `}` inside that prose terminated the
 * `[^}]*` scan of the body rule early, so the reserve looked absent.
 *
 * A check that reads comments is reading the description of the code, not the
 * code — and on this codebase, where the comments are long and name the exact
 * failure, that guarantees a false positive rather than risking one.
 */
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '')

const fails = []
const check = (ok, label, detail = '') => {
  if (!ok) fails.push(label)
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const GLOBALS = 'app/globals.css'
const BAR_TSX = 'components/BottomNav.tsx'
const BAR_CSS = 'components/BottomNav.module.css'

console.log('\nTHE BOTTOM BAR — structural rules\n')
for (const f of [GLOBALS, BAR_TSX, BAR_CSS]) {
  if (!fs.existsSync(path.join(ROOT, f))) {
    console.error(`  FAIL  ${f} does not exist — nothing to prove`)
    process.exit(1)
  }
}
const globals = stripComments(read(GLOBALS))
const barTsx = read(BAR_TSX)
const barCss = stripComments(read(BAR_CSS))

// ── 1. ONE BOTTOM RESERVE, AND THE BAR IS A TERM IN IT ───────────────────
console.log('1. the bar publishes its height into the ONE bottom reserve')

// The body rule, isolated. Matching the whole declaration rather than the
// token name alone: the token appearing ANYWHERE in the file would pass a
// check that only greps for it, including in the comment that explains it.
const bodyPad = globals.match(/body\s*\{[^}]*?padding-bottom:\s*calc\(([^;]*)\);/s)
check(!!bodyPad, 'body has a single calc() bottom reserve')
const sum = bodyPad ? bodyPad[1] : ''
for (const token of ['--chat-clear', '--consent-h', '--nav-bottom-h']) {
  check(sum.includes(token), `the reserve sums ${token}`, sum.trim().replace(/\s+/g, ' '))
}

// The other half: something must actually set it.
check(/setProperty\(\s*['"]--nav-bottom-h['"]/.test(barTsx),
  'BottomNav.tsx publishes --nav-bottom-h')
check(/getBoundingClientRect\(\)\.height/.test(barTsx),
  'it publishes the MEASURED box, not a restated number')
check(/ResizeObserver/.test(barTsx),
  'it republishes when the box changes — a label rewrap fires no window event')
// Teardown: unmounting with the lane reserved leaves a dead gap on every page.
check(/setProperty\(\s*['"]--nav-bottom-h['"]\s*,\s*['"]0px['"]\s*\)/.test(barTsx),
  'it releases the reserve on unmount')

// AND THE FAULT ITSELF: no second bottom padding anywhere near the bar.
const secondPad = /body\s*\{[^}]*padding-bottom/s.test(barCss)
check(!secondPad, 'BottomNav.module.css sets NO padding-bottom on body',
  secondPad ? 'a second bottom reserve — this is the 13 Aug bug' : 'one path sets the reserve')

// ── 2. THE TOKEN, NEVER THE LITERAL ──────────────────────────────────────
console.log('\n2. sticky offsets use var(--nav-height), never a literal 70px')

// 70 in a z-index, a duration or a colour is not a header offset, so this
// looks only at the properties that position something against the header.
const OFFSET_PROPS = /(?:^|[\s;{])(top|padding-top|margin-top|height|max-height|min-height)\s*:\s*([^;}]+)/g
let literals = 0
for (const [file, css] of [[BAR_CSS, barCss]]) {
  for (const m of css.matchAll(OFFSET_PROPS)) {
    const value = m[2]
    if (/\b70px\b/.test(value) && !value.includes('--nav-height')) {
      literals++
      console.log(`        ${file}: ${m[1]}: ${value.trim()}`)
    }
  }
}
check(literals === 0, 'no bare 70px offset in the bar stylesheet', `${literals} found`)

// The token has to exist and carry the inset, or "uses the token" is hollow.
const navHeight = globals.match(/--nav-height:\s*([^;]+);/)
check(!!navHeight, '--nav-height is declared')
check(!!navHeight && navHeight[1].includes('env(safe-area-inset-top'),
  '--nav-height carries the safe-area inset — which is why a literal differs',
  navHeight ? navHeight[1].trim() : '')

// ── 3. THE BAR RESERVES FROM THE SHELL, NOT PER PAGE ─────────────────────
console.log('\n3. the bar is fixed, and its clearance is not worked around per page')
check(/position:\s*fixed/.test(barCss), 'the bar is position: fixed')
check(/env\(safe-area-inset-bottom/.test(barCss),
  'it clears the home indicator with the bottom inset')
// A margin on the last element is the version of this fix that looks
// identical and breaks on the next page somebody adds.
check(!/margin-bottom:\s*(?!0)/.test(barCss),
  'it does not push content with a margin instead')

console.log(`\n${fails.length === 0 ? 'ALL PASSED' : `${fails.length} FAILED`}\n`)
if (fails.length) { fails.forEach(f => console.error(`  FAILED: ${f}`)); process.exit(1) }
