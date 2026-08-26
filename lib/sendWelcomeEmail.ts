/**
 * THE WELCOME EMAIL, SENT ONCE AND NEVER SILENTLY.
 *
 * WHY THIS EXISTS. Three call sites sent it, all shaped like this:
 *
 *     fetch(`${siteUrl}/api/email/send`, {...}).catch(() => {})
 *
 * Not awaited, not identified as an internal call, and every error thrown
 * away. Between 11 Aug (when email_log started recording, so the first date we
 * can measure) and 26 Aug, NINE of TWENTY candidates were greeted. Nobody knew,
 * because there was nothing to know from.
 *
 * THREE CAUSES, AND ONLY THE THIRD IS THE ONE EVERYONE GUESSES.
 *
 *   1. THE GATE. In lib/authCallback.ts the send sat inside
 *      `if (!existingRole)`, which reads like "first time" and is not:
 *      CandidateSignupForm passes { role: 'employee' } into signUp(), so an
 *      email/password candidate reaches /auth/confirm with the role already
 *      stamped and the block is skipped entirely. 0 of 4 email signups
 *      greeted, against 9 of 15 OAuth ones. Systematic, not a race.
 *
 *   2. THE RATE LIMIT. /api/email/send allowed five requests per minute per
 *      IP — correct for a browser, and every server-originated send shares
 *      ONE bucket, because a fetch from a serverless function carries the
 *      platform's egress IP or no x-forwarded-for at all (key: 'unknown').
 *      So a signup during an application-email burst got a 429. Proven by
 *      firing ten bodyless requests at the deployed route: five 400s, then
 *      five 429s, with nothing sent.
 *
 *   3. THE UN-AWAITED FETCH. A serverless function can freeze the moment it
 *      returns its response, and on the client SessionGuard navigated away in
 *      the same tick, which cancels the request. Real, and the smallest of
 *      the three.
 *
 * ALL THREE WERE INVISIBLE FOR THE SAME REASON: `.catch(() => {})`. The far
 * end of a promise, where nothing reports back — the delete button, privacy@,
 * the feed, Adrian's links, and now this.
 *
 * IT IS SAFE TO CALL ON EVERY CALLBACK. /api/email/send refuses a second
 * candidate_welcome for an address that already has a successful one, so
 * idempotency lives at the one route rather than in three copies of a
 * condition that would drift.
 */

export interface WelcomeEmailArgs {
  origin: string
  role: 'employer' | 'employee' | undefined
  email: string | undefined
  displayName: string | null
  companyName?: string
}

export type WelcomeResult = 'sent' | 'already' | 'skipped' | 'failed'

export async function sendWelcomeEmail(args: WelcomeEmailArgs): Promise<WelcomeResult> {
  const { origin, role, email, displayName, companyName } = args
  if (!email || !role) return 'skipped'

  const body = role === 'employer'
    ? { to: email, type: 'welcome', data: { contactName: displayName, companyName } }
    : { to: email, type: 'candidate_welcome', data: { candidateName: greeting(displayName) } }

  try {
    const res = await fetch(`${origin}/api/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // IDENTIFIES US AS OURSELVES, which is what lifts the browser rate
        // limit. CRON_SECRET is server-only and never reaches a browser, so
        // this cannot be forged from the outside. If it is unset the header
        // is simply absent and we fall back to the limited path — degraded,
        // not broken.
        ...(process.env.CRON_SECRET ? { 'x-internal-secret': process.env.CRON_SECRET } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      // LOUD. This is the whole point of the change: a welcome that does not
      // send must leave something a human can find.
      const text = await res.text().catch(() => '')
      console.error('[welcome-email] SEND FAILED', { status: res.status, role, to: email, body: text.slice(0, 200) })
      return 'failed'
    }

    const json = await res.json().catch(() => ({} as any))
    if (json?.skipped === 'already_welcomed') {
      console.log('[welcome-email] already sent previously, not resending', { to: email })
      return 'already'
    }
    console.log('[welcome-email] sent', { role, to: email })
    return 'sent'
  } catch (e: any) {
    // A THROW MUST NOT BREAK THE SIGN-IN. The person is already authenticated
    // by the time this runs; failing their login because a welcome email did
    // not send would be far worse than the fault being fixed. But it is
    // recorded rather than swallowed.
    console.error('[welcome-email] SEND THREW', { role, to: email, message: e?.message })
    return 'failed'
  }
}

/**
 * The greeting name, or a neutral fallback.
 *
 * NEVER INVENTS ONE. An Apple candidate can arrive with no name at all — Apple
 * returns it once, on first authorisation only — and six invented names were
 * removed from this codebase on 26 Aug for exactly this reason. "there" is a
 * greeting, not a name: nothing downstream can mistake it for one.
 */
function greeting(name: string | null): string {
  const n = (name || '').trim()
  return n ? n : 'there'
}
