// THE "CONFIRM YOUR EMAIL TO APPLY" NOTICE, AND WHEN IT SHOULD STOP.
//
// Paul's phone, 22 Aug 2026, showed the notice naming
// pauldavies.gbr+thrivetest100@gmail.com — an account that had been DELETED the
// day before — offering to resend a confirmation for a user that no longer
// existed. It had been sitting there since whenever that signup was abandoned.
//
// The old behaviour: the email was written to localStorage at sign-up and
// cleared on one thing only, a successful password login. So for anybody who
// started a signup and did not finish it, the notice was PERMANENT. It ate 34%
// of the fold on a phone, above the login form, forever, about an account they
// had walked away from.
//
// TWO CHANGES, both Paul's decision (22 Aug 2026):
//
//   1. SEVEN DAYS. Long enough to be a useful nudge for somebody who got
//      distracted mid-signup; short enough that it stops being a permanent nag.
//   2. CLEARED ON CONFIRMATION, not only on login. Somebody who clicks the link
//      in the email HAS finished — the notice must not survive that. It was
//      surviving because confirmation happens server-side, on a route that
//      never touches this browser key.
//
// THE STAMP IS WHY THIS IS A MODULE AND NOT TWO setItem CALLS. Expiry needs a
// written-at time, the old format has none, and there are three call sites that
// write this key and two that read it. Split across five places it would drift
// within a week — which is exactly how the clear-on-login half ended up being
// the only clear that existed.

const KEY = 'thrive_pending_confirm'

/** Paul's number. Seven days from when the signup was started. */
export const PENDING_CONFIRM_TTL_DAYS = 7
const TTL_MS = PENDING_CONFIRM_TTL_DAYS * 24 * 60 * 60 * 1000

type Stored = { email: string; at: number }

/**
 * Record that this browser has an unconfirmed sign-up waiting.
 *
 * `now` is injectable so the expiry can be tested without waiting a week or
 * mocking the clock globally.
 */
export function setPendingConfirm(email: string, now: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ email, at: now } satisfies Stored))
  } catch { /* private mode, storage disabled — the notice is a nicety */ }
}

/**
 * The pending email, or null if there is none or it has gone stale.
 *
 * READS THE OLD FORMAT TOO. Before this module the value was a bare email
 * string with no timestamp, and those are sitting in real browsers right now —
 * including, until it is cleared, Paul's. An un-stamped value cannot be aged,
 * and treating it as fresh would make it immortal, which is the bug. So it is
 * treated as EXPIRED: the notice disappears once, and if the signup is still
 * genuinely pending the next attempt writes a stamped one.
 */
export function getPendingConfirm(now: number = Date.now()): string | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: Stored | null = null
  try {
    const value = JSON.parse(raw)
    if (value && typeof value.email === 'string' && typeof value.at === 'number') {
      parsed = value as Stored
    }
  } catch {
    parsed = null
  }

  // Legacy bare-string value, or anything malformed: drop it.
  if (!parsed) {
    clearPendingConfirm()
    return null
  }

  if (now - parsed.at >= TTL_MS) {
    clearPendingConfirm()
    return null
  }

  return parsed.email
}

/**
 * Forget the pending sign-up.
 *
 * Call this the moment the account is usable, from wherever that is noticed —
 * a successful login, OR a session appearing after the confirmation link was
 * clicked. The second one is the case that was missing.
 */
export function clearPendingConfirm(): void {
  try {
    localStorage.removeItem(KEY)
  } catch { /* nothing to do */ }
}
