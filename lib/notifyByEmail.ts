/**
 * A TRANSACTIONAL EMAIL SENT FROM THE BROWSER, AWAITED, AND NEVER SILENT.
 *
 * The client-side counterpart to lib/sendWelcomeEmail.ts. Twenty-six call
 * sites reached /api/email/send as
 *
 *     fetch('/api/email/send', {...}).catch(() => {})
 *
 * — not awaited, every error discarded. On the client that is worse than it
 * looks: several of those sites navigate or close a modal in the same tick,
 * and a page teardown CANCELS a request in flight. So the send was a race the
 * recipient often lost, and nothing anywhere recorded that it had.
 *
 * NO SECRETS HERE, deliberately. This runs in the browser, so it cannot carry
 * CRON_SECRET and must not try: the five-per-minute rate limit is correct for
 * a browser and stays. The server-side helper is the one that identifies
 * itself; this one simply stops lying about the outcome.
 *
 * IT RETURNS A RESULT RATHER THAN THROWING. The caller has usually just done
 * the important thing — created the offer, cancelled the interview — and that
 * must not be undone because an email failed. But the caller now KNOWS, and
 * can say so.
 */

export type EmailOutcome = 'sent' | 'failed' | 'skipped'

export interface NotifyArgs {
  /** Recipient address. When absent the send is skipped rather than attempted. */
  to?: string | null
  /** Template key understood by /api/email/send. */
  type: string
  data: Record<string, unknown>
  /** Names the caller in the log line, so a failure is traceable to a screen. */
  from: string
}

export async function notifyByEmail(args: NotifyArgs): Promise<EmailOutcome> {
  const { to, type, data, from } = args
  if (!to) {
    console.warn(`[email:${from}] no address for ${type} — nothing sent`)
    return 'skipped'
  }

  try {
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, type, data }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      // LOUD, AND IT NAMES THE SCREEN. "An email failed" is not actionable;
      // "the offer email from MakeOfferModal failed with 429" is.
      console.error(`[email:${from}] FAILED`, { status: res.status, type, to, body: body.slice(0, 200) })
      return 'failed'
    }
    return 'sent'
  } catch (e: any) {
    console.error(`[email:${from}] THREW`, { type, to, message: e?.message })
    return 'failed'
  }
}
