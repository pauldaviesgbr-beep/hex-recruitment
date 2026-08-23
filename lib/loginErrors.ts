// WHAT A PERSON READS WHEN A SIGN-IN FAILS.
//
// STOP PRINTING THE LIBRARY'S STRING. Both sentences Paul saw on his own phone
// on 22 Aug 2026 were written by somebody else and shown to him verbatim:
//
//   "Invalid login credentials"  — Supabase's wording, surfaced by
//                                  setError(loginError.message)
//   "Load failed"                — SAFARI's wording for a fetch that never
//                                  completed, surfaced the same way
//
// Neither was written for a chef on a break, and the first one was actively
// misleading: he was trying to CREATE an account on a page that invited him
// to, so "invalid credentials" described a state he was not in.
//
// THE NETWORK ONE MATTERS MORE THAN IT LOOKS. "Load failed" reads as though
// the product is broken. It usually means the phone lost signal for a second —
// which is a thing the person can act on, and only if we say so.
//
// EVERY BRANCH RETURNS OUR OWN WORDS. The raw message is never returned, only
// consulted. If a case is not recognised the fallback is still ours: a
// sentence that admits we do not know rather than one that guesses.

export type LoginErrorKind =
  | 'wrong-password'
  | 'unconfirmed'
  | 'network'
  | 'rate-limited'
  | 'unknown'

export type LoginErrorCopy = { kind: LoginErrorKind; message: string }

/**
 * Classify by the raw message, then answer in our words.
 *
 * Matching on message text is not lovely, and it is what the library gives us —
 * supabase-js does not expose a stable code for these. So the matching is
 * DELIBERATELY LOOSE (case-insensitive, substring) and every unmatched case
 * lands on a safe sentence rather than falling through to the raw string.
 */
export function loginErrorCopy(raw: string | null | undefined): LoginErrorCopy {
  const m = (raw || '').toLowerCase()

  // Unconfirmed first: its message also contains "credentials" in some
  // versions, so testing for the password case first would swallow it.
  if (m.includes('not confirmed') || m.includes('confirm')) {
    return {
      kind: 'unconfirmed',
      message: 'Please confirm your email first — check your inbox for the link, or resend it below.',
    }
  }

  // Safari says "Load failed"; Chrome and Firefox say "Failed to fetch" or
  // "NetworkError". All three mean the same thing to the person holding the
  // phone.
  if (
    m.includes('load failed') ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed')
  ) {
    return {
      kind: 'network',
      message: 'That didn’t reach us — check your signal and try again.',
    }
  }

  if (m.includes('rate limit') || m.includes('too many requests')) {
    return {
      kind: 'rate-limited',
      message: 'Too many attempts just now. Wait a minute and try again.',
    }
  }

  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return {
      kind: 'wrong-password',
      message: 'That email and password don’t match. Try again, or reset your password.',
    }
  }

  return {
    kind: 'unknown',
    message: 'Something went wrong signing you in. Try again in a moment.',
  }
}
