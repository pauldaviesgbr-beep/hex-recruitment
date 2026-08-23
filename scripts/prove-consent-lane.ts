// THE CONSENT LANE IS RESERVED, NOT OVERLAID.
//
//   npm run consentlane:prove
//
// THIS BANNER HAS COVERED TWO CONTROLS AND BOTH WERE "FIXED" BY MOVING THE
// CONTROL:
//
//   13 Aug 2026  the Apply button on a job post — it cost Javier Salido his
//                application, which is the only reason anybody found it
//   22 Aug 2026  the password field on the apply gate, plus "Forgot password?"
//                and the top half of the Login button
//
// Moving the control is the wrong fix. It leaves the next new screen to break
// the same way, and it did — nine days apart, on two different pages, by the
// same mechanism. The page shell reserves the lane now: the banner publishes
// its height as --consent-h and body has one padding-bottom reading it.
//
// A NUMBER IN THE CSS IS NOT THE NUMBER ON THE SCREEN — this repo has the scar
// already, where `width: 112px` rendered at 145 because of content-box, and a
// hard-coded --sticky-offset of 40px sat against a cell rendering at 52. So
// where a constant in one file must agree with a value in another, ASSERT THE
// AGREEMENT rather than either number.
//
// Filesystem and pure text. The RENDERED half — nothing primary permanently
// under the lane — is a browser question and lives in the drive, because a
// stylesheet cannot tell you where a button ended up.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const component = read('components/CookieConsent.tsx')
const css = read('components/CookieConsent.module.css')
const globals = read('app/globals.css')

let failed = 0
let ran = 0
const check = (name: string, got: () => unknown, want: unknown) => {
  ran++
  let v: unknown
  try { v = got() } catch (err) {
    console.log(`FAIL  ${name}`)
    console.log(`        threw: ${(err as Error).message}`)
    failed++
    return
  }
  const a = JSON.stringify(v), b = JSON.stringify(want)
  if (a !== b) {
    console.log(`FAIL  ${name}`)
    console.log(`        want ${b}`)
    console.log(`        got  ${a}`)
    failed++
  } else console.log(`ok    ${name}`)
}

// Every `body { ... }` rule in the stylesheet, wherever it sits and whatever
// media query it is nested in. The override that made the first version of this
// fix do nothing was a body rule inside @media (max-width: 768px).
const bodyRules = globals.match(/(^|[\s,{}])body\s*\{[^}]*\}/g) || []

// ── THE TWO NUMBERS CANNOT DISAGREE, BECAUSE THERE IS ONE ──────────────────
// The first version published a constant '88px' and the stylesheet drew a
// height: 88px box, and a check asserted the two matched. They did. THE BOX
// STILL SPILLED ITS CONTENT: at 390 the copy ran out of the top of the navy
// onto the page behind it and both buttons were cut off below the fold, with
// every assertion green. The screenshot found it in one look.
//
// So the component MEASURES its own rendered box and publishes that, and the
// stylesheet sets a MIN-height it may grow past. There is now one number and
// it is the rendered one, which is the only version of 'they agree' that
// cannot be true while the screen is wrong.

check(
  'the component publishes its MEASURED height, not a restated constant',
  () => component.includes('getBoundingClientRect().height') && component.includes("setProperty('--consent-h'"),
  true
)

check(
  'NO HARD-CODED HEIGHT IS PUBLISHED ANY MORE',
  // Every published value, with the deliberate '0px' collapse taken out first —
  // that one is the lane going away, not a height anybody restated.
  () => {
    const published = (component.match(/setProperty\('--consent-h',[^)]+\)/g) || [])
      .map(s => s.replace(/setProperty\('--consent-h',\s*/, '').replace(/\)$/, '').trim())
    return published.filter(v => /^'\d+px'$/.test(v) && v !== "'0px'")
  },
  []
)

check(
  'it watches the BOX, not the window — copy rewrapping fires no resize event',
  () => component.includes('new ResizeObserver') && component.includes('ro.observe('),
  true
)

check(
  'and disconnects it, so an unmounted banner stops publishing',
  () => {
    const cleanup = component.split('return () => {')[1]?.split('}')[0] || ''
    return cleanup.includes('ro.disconnect()')
  },
  true
)

check(
  'THE STYLESHEET SETS A FLOOR IT MAY GROW PAST, NOT A CEILING THAT CLIPS',
  () => {
    const bannerRule = css.split('.banner {')[1]?.split('}')[0] || ''
    const media = css.split('@media (min-width: 900px)')[1] || ''
    // The floor is there AND no bare `height:` remains to clip the content —
    // asking only for the min-height would pass with both present.
    const bare = bannerRule.split(/\r?\n/).filter(l => /^\s*height:\s*\d+px/.test(l))
    return { floor: bannerRule.includes('min-height: 88px'), bare, desktopFloor: media.includes('min-height: 72px') }
  },
  { floor: true, bare: [], desktopFloor: true }
)

check(
  'and it is border-box, so padding cannot push it past its own height',
  () => (css.split('.banner {')[1]?.split('}')[0] || '').includes('box-sizing: border-box'),
  true
)

// ── THE FIXED FURNITURE READS THE LANE TOO ─────────────────────────────────
// A body padding cannot move a fixed element. The Ask Thrive launcher sits at
// z-index 120 against the banner's 1001, so at 1440 elementFromPoint at the
// launcher's own centre returned the BANNER — unclickable, not just overlapped.

check(
  'every fixed bottom offset on the chat widget reads --consent-h',
  () => {
    const chat = read('components/ChatBot.module.css')
    // Any bottom offset that is still a bare pixel value is one the lane
    // cannot move. Listing them names the offender rather than saying "false".
    return (chat.split(/\r?\n/).filter(l => /^\s*bottom:\s*\d+px\s*;/.test(l))).map(l => l.trim())
  },
  []
)

// ── THE SHELL RESERVES IT, AND NOT WITH A MARGIN ───────────────────────────

check(
  'body reserves the lane from the shell',
  () => /padding-bottom:\s*calc\(/.test(bodyRules.join('')),
  true
)

check(
  'NOT a margin on the last element — the version that breaks on the next page',
  () => /margin-bottom:\s*var\(--consent-h/.test(bodyRules.join('')),
  false
)

check(
  'the variable has a declared default, so no page depends on the fallback',
  () => /--consent-h:\s*0px/.test(globals),
  true
)

// ── ONE BOTTOM RESERVE, AND ONLY ONE ───────────────────────────────────────
// THIS IS THE CHECK THAT WOULD HAVE CAUGHT IT, AND THE FIRST VERSION OF THIS
// FILE DID NOT HAVE IT. The fix looked right in the file and did NOTHING on a
// phone: `@media (max-width: 768px) { body { padding-bottom: 80px } }` for the
// chat launcher sat further down globals.css at the same specificity, so it
// won, and --consent-h was published and then ignored at exactly the width
// where both faults happened. Found by driving it, never by reading it.
//
// The old check asked whether the calc EXISTS, which was true the entire time
// it was being overridden — a question with the same answer in both states.
// The question with two different answers is HOW MANY bottom reserves there
// are. The launcher's 80px is a token feeding the one rule now.

check(
  'BODY HAS EXACTLY ONE BOTTOM RESERVE IN THE WHOLE STYLESHEET',
  () => bodyRules.filter(r => /padding-bottom\s*:/.test(r)).length,
  1
)

check(
  'and it is the sum, so neither the launcher nor the lane can erase the other',
  () => {
    const reserve = bodyRules.find(r => /padding-bottom\s*:/.test(r)) || ''
    return /padding-bottom:\s*calc\(\s*var\(--chat-clear[^)]*\)\s*\+\s*var\(--consent-h/.test(reserve)
  },
  true
)

check(
  'the launcher clearance is a token, declared at both widths',
  () => /--chat-clear:\s*0px/.test(globals) && /--chat-clear:\s*80px/.test(globals),
  true
)

// ── IT MUST GO BACK TO ZERO ────────────────────────────────────────────────
// A lane still reserved after the banner is answered is a dead gap at the foot
// of every page — and one still reserved after unmount is worse, because
// nothing on screen explains it.

check(
  'answered → the lane collapses to zero',
  () => component.includes("if (!showBanner) { root.style.setProperty('--consent-h', '0px'); return }"),
  true
)

check(
  'unmounted → the lane collapses to zero',
  () => {
    const cleanup = component.split('return () => {')[1]?.split('}')[0] || ''
    return cleanup.includes('--consent-h') && cleanup.includes("'0px'")
  },
  true
)

check(
  'and it follows a resize, because the two heights differ by breakpoint',
  () => component.includes("addEventListener('resize'"),
  true
)

// ── YELLOW IS ALLOWED HERE, AND THE GROUND IS THE ONE IT NEEDS ─────────────
// Design: yellow as a button is allowed on the consent lane and the home hero
// and nowhere else in this set. It only works on a navy ground.

check(
  'the lane is navy, not the old slate',
  () => /\.banner\s*\{[^}]*background:\s*#0F172A/i.test(css),
  true
)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}
