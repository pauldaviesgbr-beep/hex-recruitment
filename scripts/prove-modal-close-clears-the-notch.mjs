// THE JOB MODAL'S CLOSE BUTTON CLEARS THE NOTCH — AND NOTHING OVERRIDES IT.
//
//   node scripts/prove-modal-close-clears-the-notch.mjs
//
// Filesystem only. No network, no database, milliseconds. In verify.
//
// ── WHAT THIS GUARDS ─────────────────────────────────────────────────────
//
// JobDetailModal is full-screen on a phone: no visible backdrop to tap, no
// keyboard for Escape. Its × was `top: 1rem`, which on a notched phone put
// the whole 40px button inside the ~59px status zone where iOS takes the
// touches — A MODAL A USER CANNOT LEAVE, filmed by Paul on 4 Sept 2026
// mid-recording for Apple. The fix is the account sheet's own arithmetic:
//
//     top: max(1rem, calc(env(safe-area-inset-top, 0px) + 6px))
//
// which computes to EXACTLY the old 16px wherever the inset is 0, and
// rides 6px below the notch everywhere else.
//
// ── ASSERTED: THE VALUE, AND THAT NOTHING LATER OVERRIDES IT ─────────────
//
// The democrop lessons, both of them: a presence check passes on a wrong
// value, so the ARITHMETIC is matched; and a later declaration in a media
// query wins silently, so `top:` inside .closeBtn blocks is counted —
// exactly one. If a second top on .closeBtn ever becomes legitimate this
// must become a cascade comparison, and that is a moment to think, not a
// number to raise.

import { readFileSync } from 'node:fs'

const FILE = 'components/JobDetailModal.module.css'
const css = readFileSync(FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(62) + (detail ?? ''))
}

console.log('the job modal close button and the notch')
console.log('')

// Every `.closeBtn { … }` block, and every `top:` inside one.
const blocks = [...css.matchAll(/\.closeBtn\s*\{([^}]*)\}/g)].map(m => m[1])
const tops = blocks.flatMap(b => [...b.matchAll(/top:\s*([^;]+);/g)].map(m => m[1].trim()))

// ZERO-GUARD: no block at all means the search broke or the button was
// renamed — never a pass.
check('.closeBtn exists in the stylesheet', blocks.length >= 1, `${blocks.length} block(s)`)
// EVERY top:, not "the" top:. The first version of this check demanded
// exactly one declaration — and in doing so found a SECOND .closeBtn block
// in the mobile media query, top: 0.5rem, which was silently overriding
// the base-rule fix at exactly the width the phone renders. The fault the
// democrop entry describes, caught by this check before it was ever
// committed. So the assertion is now: at least one top:, and EVERY one of
// them carries the safe-area arithmetic — a bare offset anywhere in any
// .closeBtn block is a regression, whatever the cascade order.
const ARITH = /^max\(\s*[\d.]+rem\s*,\s*calc\(\s*env\(safe-area-inset-top\s*,\s*0px\)\s*\+\s*6px\s*\)\s*\)$/
check('at least one top: declaration exists', tops.length >= 1, `${tops.length}`)
for (const t of tops) {
  check('top: carries the safe-area arithmetic, not a bare offset', ARITH.test(t), t)
}

console.log('')
if (bad) {
  console.log(`${bad} FAILED`)
  console.log('')
  console.log('  WHAT THIS MEANS: on a notched phone the modal\'s × sits in the')
  console.log('  status zone beside the Dynamic Island, where iOS takes the touches.')
  console.log('  The sheet is full-screen with no backdrop and no Escape — the ways')
  console.log('  out become the edge-swipe abandoning the page, or killing the app.')
  process.exit(1)
}
console.log('the way out of the job modal is below the notch, and nothing overrides it')
process.exit(0)
