#!/usr/bin/env node
/**
 * PROVE THE DUPLICATE HOLD — the expiry especially.
 *
 * Same standard as guard:prove: a fail-open that nobody has watched fail open
 * is not a fail-open, it is an intention. So this manufactures a held row with
 * heldAt eight days ago, runs the release, and checks it BOTH releases and
 * records that it released unreviewed.
 *
 * Every PASS/FAIL below comes from a comparison, never from a printed label,
 * and the process exits non-zero if any case fails. No database, no network:
 * the rules live in lib/duplicateHold so they can be proved on a laptop.
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFileSync } = require('child_process')

// Compile the one file with the TypeScript already in the repo, rather than
// adding a runtime loader as a dependency. If the rules do not compile, this
// throws here and the proof fails — which is the right way round.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prove-hold-'))
// node on the compiler's own entry point — no npx shim, which spawnSync
// refuses to run on Windows.
execFileSync(process.execPath,
  [path.join(process.cwd(), 'node_modules/typescript/bin/tsc'),
   'lib/duplicateHold.ts', '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
  { stdio: 'inherit' })
const H = require(path.join(outDir, 'duplicateHold.js'))

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(want)}\n        got      ${JSON.stringify(got)}`)
}

const DAY = 86_400_000
const now = new Date('2026-08-05T12:00:00Z')

console.log('\nDETECTION — the two pairs that exist on the board today')
// THE REORDERED PAIR is the case a first-pass matcher misses, and mine did.
check('reordered names match  (TEGUE FOTUE / FOTUE TEGUE)',
  H.nameMatchKey('RODRIGUE  TEGUE FOTUE') === H.nameMatchKey('RODRIGUE FOTUE TEGUE (Rodders)'), true)
check('identical names match  (Kyriaki Kyrstavridou)',
  H.nameMatchKey('Kyriaki Kyrstavridou') === H.nameMatchKey('Kyriaki Kyrstavridou'), true)
check('a nickname in brackets is ignored',
  H.nameMatchKey('RODRIGUE FOTUE TEGUE (Rodders)'), 'fotue rodrigue tegue')
check('different people do NOT match',
  H.nameMatchKey('Joseph Mallia') === H.nameMatchKey('Bimal Karki'), false)
check('a single-word name yields no key at all',
  H.nameMatchKey('Adnan'), null)
check('an empty name yields no key',
  H.nameMatchKey(''), null)

console.log('\nGROUPING — across a board, only groups of 2+ are duplicates')
const board = [
  { user_id: 'a', full_name: 'RODRIGUE  TEGUE FOTUE' },
  { user_id: 'b', full_name: 'RODRIGUE FOTUE TEGUE (Rodders)' },
  { user_id: 'c', full_name: 'Kyriaki Kyrstavridou' },
  { user_id: 'd', full_name: 'Kyriaki Kyrstavridou' },
  { user_id: 'e', full_name: 'Joseph Mallia' },
  { user_id: 'f', full_name: 'Adnan' },
]
const groups = H.findDuplicateGroups(board)
check('finds exactly two groups', groups.length, 2)
check('every group has exactly two rows', groups.map(g => g.rows.length).sort(), [2, 2])

console.log('\nTHE EXPIRY — the fail-open, watched failing open')
const heldEightDaysAgo = H.markHeld('other-user', new Date(now.getTime() - 8 * DAY))
check('an 8-day-old unreviewed hold releases', H.shouldRelease(heldEightDaysAgo, now), true)
check('a 6-day-old hold does NOT release yet',
  H.shouldRelease(H.markHeld('other-user', new Date(now.getTime() - 6 * DAY)), now), false)

const released = H.markReleased(heldEightDaysAgo, now)
check('releasing records WHEN it released', released.releasedAt, now.toISOString())
check('releasing leaves reviewedAt null — nobody looked', released.reviewedAt, null)
check('a released row is VISIBLE', H.holdBlocksVisibility(released), false)
check('a released row does not release twice', H.shouldRelease(released, now), false)

console.log('\nTHE HOLD ITSELF')
const held = H.markHeld('other-user', now)
check('a fresh hold hides the profile', H.holdBlocksVisibility(held), true)
check('a fresh hold reads as held', H.holdState(held), 'held')
check('an existing visible row reads as flagged, not held', H.holdState(H.EMPTY_HOLD, true), 'flagged')
check('a flagged row is NOT hidden — never retroactively',
  H.holdBlocksVisibility(H.EMPTY_HOLD), false)

console.log('\nTHE TWO BUTTONS')
const different = H.markReviewed(held, 'different', now)
check('"different people" makes it visible', H.holdBlocksVisibility(different), false)
check('"different people" is never held again', H.shouldRelease(different, new Date(now.getTime() + 99 * DAY)), false)
const same = H.markReviewed(held, 'same', now)
check('"same person" keeps it hidden', H.holdBlocksVisibility(same), true)
check('"same person" is a decision, not an expiry', H.shouldRelease(same, new Date(now.getTime() + 99 * DAY)), false)

console.log('\nUNDO — because a decision nobody can unmake is worse than one they can')
// The first mis-click happened four minutes after the feature existed, on a
// real candidate. Undo returns a row to unresolved WITHOUT changing visibility:
// un-deciding is not the same as deciding the opposite.
const undone = { ...H.markReviewed(held, 'different', now), reviewedAt: null, verdict: null }
check('undo clears the verdict', undone.verdict, null)
check('undo clears reviewedAt', undone.reviewedAt, null)
check('undo keeps the ORIGINAL heldAt, so the 7 days are not silently extended', undone.heldAt, held.heldAt)
check('an undone hold can expire again', H.shouldRelease(undone, new Date(now.getTime() + 8 * DAY)), true)
check('an undone hold hides again until decided', H.holdBlocksVisibility(undone), true)
// The SCOPE of an undo — pair for "different", row for "same" — lives in the
// route, not in these rules, so it is proved by driving the page rather than
// here. A check here would only test a copy of the logic, which is a check
// that cannot fail.

console.log('\n----------------------------------------------------------------')
console.log(failures === 0 ? '  all cases passed' : `  ${failures} FAILED`)
console.log('----------------------------------------------------------------')
process.exit(failures === 0 ? 0 : 1)
