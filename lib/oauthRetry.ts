/**
 * ONE AUTOMATIC RETRY FOR ONE SPECIFIC IN-APP SIGN-IN FAILURE. A MITIGATION,
 * NOT A CURE.
 *
 * THE FAULT. In the iOS app, when Google (or any provider) shows its own
 * screens — account chooser, consent, two-step — Supabase's token endpoint
 * answers our exchange with 404 `flow_state_not_found`, about a second after
 * issuing the code, for a flow row it still holds. Measured on 6 Oct 2026: the
 * code our callback submitted was the exact code Supabase issued. Interactive
 * attempts 5 of 5 failed; silent attempts 4 of 4 succeeded. Reported to
 * Supabase. This file exists for the weeks before they answer.
 *
 * WHY A RETRY WORKS. After the failed attempt Google holds a session, so a
 * fresh round trip is the silent kind — the kind that has never failed. It is
 * a COMPLETE new flow (new PKCE verifier, new state, new code). Nothing here
 * replays the spent code.
 *
 * THE SIX RULES, AND WHERE EACH LIVES:
 *   1. ONE RETRY, EVER. Two independent guards, either of which stops it:
 *      the attempt number travels IN THE CALLBACK URL (the server never
 *      offers a retry for attempt 2), and a sessionStorage claim in the
 *      webview (the client never starts a second one). If the claim cannot
 *      be read or written, the answer is NO RETRY.
 *   2. ONLY flow_state_not_found. Decided on the server from the error CODE
 *      supabase-js parsed, never from a message string. Every other way into
 *      the callback's failure branches (provider error, no code, a different
 *      exchange error) gets no offer. A CANCEL NEVER REACHES THE CALLBACK AT
 *      ALL — runNativeOAuth resolves 'cancelled' and navigates nowhere — so
 *      it cannot produce an offer by construction.
 *   3. APP ONLY. The offer needs `native=1`, which only the native branch of
 *      a sign-in button puts in the callback URL, AND the client acts on it
 *      only when the Capacitor bridge says it is native. Not the user agent:
 *      build 10 carries no ThriveApp marker.
 *   4. LOUD. Every offer and every retry outcome is one `[oauth-retry]` log
 *      line from the server. Permanent — this is not one of the TEMPORARY
 *      diagnostics in lib/authCallbackDiagnostic.ts.
 *   5. NO FALSE FAILURE ON SCREEN. While the retry is running the login page
 *      says FINISHING_COPY, not the error. The error appears only if the
 *      retry does not happen or does not succeed.
 *   6. THE SAME PROVIDER. Carried as `provider=` in the callback URL from the
 *      button that started the flow. Anything outside RETRYABLE_PROVIDERS —
 *      unknown, missing, misspelt — gets no offer and the error shows.
 */

export const RETRYABLE_PROVIDERS = ['google', 'apple', 'linkedin_oidc'] as const
export type RetryableProvider = (typeof RETRYABLE_PROVIDERS)[number]

export function isRetryableProvider(v: unknown): v is RetryableProvider {
  return typeof v === 'string' && (RETRYABLE_PROVIDERS as readonly string[]).includes(v)
}

/** The one Supabase error code this mitigation is for. */
export const RETRY_ERROR_CODE = 'flow_state_not_found'

/** One short, calm line, shown while the retry runs. */
export const FINISHING_COPY = 'Finishing sign-in…'

// ── THE CALLBACK URL ────────────────────────────────────────────────────

/**
 * What the NATIVE branch of each sign-in button appends to its callback URL.
 * The web branch never calls this, so a web callback carries none of it.
 */
export function nativeFinishSuffix(provider: RetryableProvider, attempt: 1 | 2): string {
  return `&native=1&provider=${provider}&attempt=${attempt}`
}

// ── THE SERVER'S DECISION ───────────────────────────────────────────────

export type RetryContext = {
  native: string | null
  provider: string | null
  attempt: string | null
}

export function retryContextFrom(searchParams: URLSearchParams): RetryContext {
  return {
    native: searchParams.get('native'),
    provider: searchParams.get('provider'),
    attempt: searchParams.get('attempt'),
  }
}

/**
 * Should the callback offer the client one retry? Returns the provider to
 * restart, or null. Pure — the proof calls it directly.
 *
 * ATTEMPT MUST BE EXACTLY '1'. Missing, '2', or anything else is no offer:
 * an unreadable loop guard means do not loop.
 */
export function retryOffer(errorCode: string | null | undefined, ctx: RetryContext): RetryableProvider | null {
  if (errorCode !== RETRY_ERROR_CODE) return null
  if (ctx.native !== '1') return null
  if (ctx.attempt !== '1') return null
  if (!isRetryableProvider(ctx.provider)) return null
  return ctx.provider
}

/**
 * The login URL for the failure branch. With an offer it carries `retry=` and
 * `retry_role=`; without one it is exactly the URL the route always sent.
 */
export function exchangeFailedLoginUrl(
  origin: string,
  role: 'employee' | 'employer',
  offer: RetryableProvider | null,
  safeNext: string | null,
): string {
  const base = `${origin}/login/${role}?error=exchange-failed`
  if (!offer) return base
  return base + `&retry=${offer}&retry_role=${role}` +
    (safeNext ? `&redirect=${encodeURIComponent(safeNext)}` : '')
}

/**
 * THE PERMANENT COUNTER. One line per offer, one per retried outcome.
 * Grep `[oauth-retry]`. Vercel keeps these about a day, so for a six-month
 * question the durable record is auth.flow_state: every first-attempt failure
 * leaves a dead row, and a failed retry leaves a SECOND dead row for the same
 * user within a minute. See the branch report.
 */
export function logRetry(fields: {
  event: 'offered' | 'not-offered' | 'outcome'
  route: 'employee' | 'employer'
  provider: string | null
  attempt: string | null
  result?: 'succeeded' | 'failed'
  errorCode?: string | null
}): void {
  console.log('[oauth-retry] ' + JSON.stringify(fields))
}

// ── THE CLIENT'S DECISION ───────────────────────────────────────────────

export const RETRY_CLAIM_KEY = 'thrive_oauth_retry_claimed'

/** Window in which a claim blocks another retry. Long enough to cover any
 *  real retry; short enough that a sign-in hours later still gets one. */
export const RETRY_CLAIM_WINDOW_MS = 10 * 60 * 1000

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Take the one retry. True only if storage can be read AND written AND holds
 * no live claim. Any exception — private mode, a disabled store, a throwing
 * accessor — is false: if the guard cannot be read, we do not retry.
 */
export function claimRetry(storage: StorageLike | null | undefined, now: number): boolean {
  if (!storage) return false
  try {
    const prior = storage.getItem(RETRY_CLAIM_KEY)
    if (prior !== null) {
      const at = Number(prior)
      // An unparseable claim is treated as live — unknown means stop.
      if (!Number.isFinite(at) || now - at < RETRY_CLAIM_WINDOW_MS) return false
    }
    storage.setItem(RETRY_CLAIM_KEY, String(now))
    // Read it back: a store that silently drops writes is not a guard.
    return storage.getItem(RETRY_CLAIM_KEY) === String(now)
  } catch {
    return false
  }
}

/**
 * Everything the login page checks before it re-presses a provider button,
 * in the order it checks it. The claim is taken LAST so a declined retry
 * never spends it.
 */
export function shouldAutoRetry(input: {
  retryParam: string | null
  native: boolean
  visible: boolean
  claim: () => boolean
}): RetryableProvider | null {
  if (!isRetryableProvider(input.retryParam)) return null
  if (!input.native) return null
  // Backgrounded or not on screen: do not pull them into a sign-in they may
  // have walked away from. They see the ordinary error and can tap again.
  if (!input.visible) return null
  if (!input.claim()) return null
  return input.retryParam
}
