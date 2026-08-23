// A PERSON NEVER READS A SENTENCE WE DID NOT WRITE.
//
//   npm run loginerrors:prove
//
// Both messages Paul saw on his own phone on 22 Aug 2026 came from somebody
// else's library and were shown to him verbatim by setError(error.message):
//
//   13:24  "Load failed"                — SAFARI's wording for a fetch that
//                                         never completed
//   13:25  "Invalid login credentials"  — SUPABASE's wording
//   13:26  "Invalid login credentials"
//
// He was trying to CREATE an account on a page that invited him to, so the
// second one described a state he was not even in.
//
// THIS CHECKS THE PROPERTY, NOT THE CASES. Every branch must return OUR words,
// and no branch may hand back the raw string — including the fallback, which is
// where a "just show the error" would hide. A check listing the four known
// messages would pass on a fifth that leaked.
//
// Pure functions. No network, no database.

import { loginErrorCopy } from '../lib/loginErrors'

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

// ── THE THREE PAUL ACTUALLY SAW ────────────────────────────────────────────

check('Supabase\'s "Invalid login credentials" is classified', () => loginErrorCopy('Invalid login credentials').kind, 'wrong-password')
check('and answered in our words, offering the way out', () => /don’t match/.test(loginErrorCopy('Invalid login credentials').message) && /reset your password/.test(loginErrorCopy('Invalid login credentials').message), true)
check('Safari\'s "Load failed" is a NETWORK problem, not a credentials one', () => loginErrorCopy('Load failed').kind, 'network')
check('and says what the person can do about it', () => /check your signal/.test(loginErrorCopy('Load failed').message), true)

// The other browsers' wording for the same thing. Safari was the one that bit,
// and a check written only for Safari would let the next browser through.
check('Chrome\'s "Failed to fetch" is the same kind', () => loginErrorCopy('TypeError: Failed to fetch').kind, 'network')
check('Firefox\'s NetworkError too', () => loginErrorCopy('NetworkError when attempting to fetch resource.').kind, 'network')

// ── ORDER MATTERS ──────────────────────────────────────────────────────────
// The unconfirmed message contains "confirm" AND, in some versions, the word
// "credentials". Testing the password case first would swallow it and tell
// somebody their password was wrong when their email simply was not confirmed.
check('an unconfirmed account is NOT reported as a wrong password', () => loginErrorCopy('Email not confirmed').kind, 'unconfirmed')
check('even when the wording also mentions credentials', () => loginErrorCopy('Invalid login credentials: email not confirmed').kind, 'unconfirmed')

check('rate limiting is its own answer', () => loginErrorCopy('Request rate limit reached').kind, 'rate-limited')

// ── THE PROPERTY. This is the case that matters most. ──────────────────────

check(
  'AN UNRECOGNISED ERROR STILL GETS OUR WORDS, NOT THE RAW STRING',
  () => {
    const raw = 'AuthApiError: something nobody has seen before'
    const copy = loginErrorCopy(raw)
    return { kind: copy.kind, leaksRaw: copy.message.includes(raw) }
  },
  { kind: 'unknown', leaksRaw: false }
)

check(
  'NO INPUT EVER COMES BACK OUT — swept across every shape',
  () => {
    const inputs = [
      'Invalid login credentials',
      'Load failed',
      'Failed to fetch',
      'Email not confirmed',
      'Request rate limit reached',
      'AuthApiError: unknown',
      'DATABASE ERROR: relation "users" does not exist',
      '',
      null,
      undefined,
    ]
    return inputs.filter(raw => {
      const msg = loginErrorCopy(raw as string).message
      return !msg || (typeof raw === 'string' && raw.length > 3 && msg.includes(raw))
    })
  },
  []
)

check(
  'and every branch returns a real sentence, not an empty string',
  () => {
    const kinds = ['Invalid login credentials', 'Load failed', 'Email not confirmed', 'rate limit', 'who knows']
    return kinds.filter(k => loginErrorCopy(k).message.trim().length < 15)
  },
  []
)

// A leak of a DATABASE error to a login screen would be worse than unhelpful.
check(
  'a database error does not reach the person',
  () => loginErrorCopy('relation "candidate_profiles" does not exist').message.includes('relation'),
  false
)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}
