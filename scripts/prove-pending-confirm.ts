// THE PENDING-CONFIRM NOTICE EXPIRES, AND THE OLD FORMAT DOES NOT LIVE FOREVER.
//
//   npm run pendingconfirm:prove
//
// Paul's phone showed "You signed up as pauldavies.gbr+thrivetest100@gmail.com"
// with a Resend button, for an account DELETED the day before. The value was
// written at sign-up and cleared on exactly one event — a successful password
// login — so for anybody who abandoned a signup it was permanent, eating 34% of
// the fold above the login form.
//
// THE CASE THAT MATTERS MOST IS THE LEGACY ONE. Every browser that has already
// visited carries a bare email string with no timestamp, including Paul's right
// now. An un-stamped value cannot be aged, so treating it as fresh would make
// exactly the values that caused this bug the ones that never expire. It is
// treated as EXPIRED instead: it disappears once, and a still-pending signup
// writes a stamped one on the next attempt.
//
// `now` is injected rather than mocked globally, so the seven-day boundary is
// tested at the boundary instead of by waiting a week.
//
// No network, no database, milliseconds — but it DOES need a localStorage, so
// one is stubbed below. That stub is also the point of the last two cases:
// storage can throw (private mode, storage disabled) and none of this is
// important enough to break a login page over.

import {
  setPendingConfirm,
  getPendingConfirm,
  clearPendingConfirm,
  PENDING_CONFIRM_TTL_DAYS,
} from '../lib/pendingConfirm'

const KEY = 'thrive_pending_confirm'
const DAY = 24 * 60 * 60 * 1000
const T0 = 1_750_000_000_000   // a fixed instant; nothing here reads the clock

// Minimal localStorage stub. `throwOn` lets the failure path be exercised.
let store: Record<string, string> = {}
let throwOn: 'none' | 'all' = 'none'
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => { if (throwOn === 'all') throw new Error('storage disabled'); return k in store ? store[k] : null },
  setItem: (k: string, v: string) => { if (throwOn === 'all') throw new Error('storage disabled'); store[k] = v },
  removeItem: (k: string) => { if (throwOn === 'all') throw new Error('storage disabled'); delete store[k] },
  clear: () => { store = {} },
  key: () => null,
  length: 0,
} as unknown as Storage

let failed = 0
let ran = 0
const check = (name: string, got: () => unknown, want: unknown) => {
  ran++
  let value: unknown
  try { value = got() } catch (err) {
    console.log(`FAIL  ${name}`)
    console.log(`        threw: ${(err as Error).message}`)
    failed++
    return
  }
  const a = JSON.stringify(value), b = JSON.stringify(want)
  if (a !== b) {
    console.log(`FAIL  ${name}`)
    console.log(`        want ${b}`)
    console.log(`        got  ${a}`)
    failed++
  } else console.log(`ok    ${name}`)
}
const reset = () => { store = {}; throwOn = 'none' }

check('Paul chose seven days', () => PENDING_CONFIRM_TTL_DAYS, 7)

check('a fresh value reads back', () => {
  reset(); setPendingConfirm('chef@example.com', T0)
  return getPendingConfirm(T0)
}, 'chef@example.com')

check('still there after six days — a useful nudge', () => {
  reset(); setPendingConfirm('chef@example.com', T0)
  return getPendingConfirm(T0 + 6 * DAY)
}, 'chef@example.com')

check('GONE at seven days exactly (the boundary, not near it)', () => {
  reset(); setPendingConfirm('chef@example.com', T0)
  return getPendingConfirm(T0 + 7 * DAY)
}, null)

check('gone well after', () => {
  reset(); setPendingConfirm('chef@example.com', T0)
  return getPendingConfirm(T0 + 400 * DAY)
}, null)

check('expiry REMOVES the key rather than just hiding it', () => {
  reset(); setPendingConfirm('chef@example.com', T0)
  getPendingConfirm(T0 + 8 * DAY)
  return store[KEY] === undefined
}, true)

// ── THE LEGACY VALUE SITTING IN REAL BROWSERS ─────────────────────────────
check('A BARE EMAIL STRING (the old format) IS TREATED AS EXPIRED', () => {
  reset(); store[KEY] = 'stale@example.com'
  return getPendingConfirm(T0)
}, null)

check('and the legacy value is cleared, so it cannot come back', () => {
  reset(); store[KEY] = 'stale@example.com'
  getPendingConfirm(T0)
  return store[KEY] === undefined
}, true)

check('malformed JSON is treated as expired, not thrown on', () => {
  reset(); store[KEY] = '{not json'
  return getPendingConfirm(T0)
}, null)

check('a stamped value missing its email is refused', () => {
  reset(); store[KEY] = JSON.stringify({ at: T0 })
  return getPendingConfirm(T0)
}, null)

// ── CLEARING ──────────────────────────────────────────────────────────────
check('clearPendingConfirm forgets it', () => {
  reset(); setPendingConfirm('chef@example.com', T0)
  clearPendingConfirm()
  return getPendingConfirm(T0)
}, null)

check('nothing stored reads as nothing', () => { reset(); return getPendingConfirm(T0) }, null)

// ── STORAGE THAT THROWS ───────────────────────────────────────────────────
// Private mode and locked-down browsers. A nicety must never break the page.
check('reading survives storage throwing', () => {
  reset(); throwOn = 'all'
  return getPendingConfirm(T0)
}, null)

check('writing survives storage throwing', () => {
  reset(); throwOn = 'all'
  setPendingConfirm('chef@example.com', T0)
  return true
}, true)

check('clearing survives storage throwing', () => {
  reset(); throwOn = 'all'
  clearPendingConfirm()
  return true
}, true)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}
