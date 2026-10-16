'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { safeInternalPath } from '@/lib/safeRedirect'
import { appleSignInEnabled } from '@/lib/appleSignIn'
import { isNativeApp, runNativeOAuth, NATIVE_CALLBACK_URL } from '@/lib/nativeOAuth'
import { nativeFinishSuffix } from '@/lib/oauthRetry'

interface AppleSignInButtonProps {
  role: 'employer' | 'employee'
  className?: string
  label?: string
  /**
   * Same-origin path to return to after OAuth completes. Threaded exactly as
   * the Google and LinkedIn buttons do it, so a candidate who signed in from
   * an Apply button lands back on that job rather than the dashboard.
   */
  next?: string
}

/**
 * "Sign in with Apple" — the visible half of Guideline 4.8.
 *
 * IT RENDERS NOTHING UNTIL THE PROVIDER IS ACTUALLY CONFIGURED, and that is
 * the most important line in this file. Supabase cannot start an Apple flow
 * without a Services ID and a signing key in its dashboard; without them
 * signInWithOAuth returns "Unsupported provider" and the person is left on a
 * dead button with an error. A sign-in button that does not sign anybody in is
 * worse than no button — it looks like our product is broken, on the screen
 * where trust matters most.
 *
 * So it is gated on NEXT_PUBLIC_APPLE_SIGNIN_ENABLED, which is OFF unless set.
 * Paul flips it after the portal work, and nothing about any existing
 * sign-in changes until he does. See lib/appleSignIn.ts.
 *
 * DELIBERATELY MIRRORS THE OTHER TWO: same /auth/callback/<role> route, same
 * ?next= threading, same oauth_intended_role cookie SessionGuard reads. Three
 * providers behaving differently is three things to debug.
 *
 * WHAT APPLE GIVES US IS LESS THAN THE OTHERS, and the codebase already
 * expects that:
 *   · the NAME arrives ONCE, on first authorisation only, and never again.
 *     nameFromAuth returns null rather than inventing one, and the
 *     discoverability gate refuses to flip a profile with no name — both
 *     already merged.
 *   · the EMAIL may be a private relay address. FREE_MAIL_DOMAINS knows all
 *     three relay domains, so no employer gets a company called
 *     "Privaterelay", and the team-invite code exists because a relay address
 *     can never string-match an invited one.
 *
 * Apple's Human Interface Guidelines govern how this looks: their mark, their
 * wording, and a button that is not visually subordinate to the other
 * providers. Black on light, and it sits alongside rather than below.
 */
export default function AppleSignInButton({ role, className, label, next, autoRetry }: AppleSignInButtonProps & {
  /** Set only by LoginPanel, only in the app, only once — lib/oauthRetry.ts. */
  autoRetry?: { role: 'employer' | 'employee'; onEnded: (how?: 'cancelled' | 'failed') => void; attempt?: 1 | 2 }
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // THE ONE AUTOMATIC RETRY — lib/oauthRetry.ts. The login page passes
  // autoRetry only after it has checked the app bridge, visibility and the
  // one-retry claim; this presses the button once, as attempt 2. Anything
  // other than a navigation hands control back so the page can show the
  // honest error instead of "Finishing sign-in…" for ever.
  const retriedRef = useRef(false)
  const navigatingRef = useRef(false)
  const cancelledRef = useRef(false)
  useEffect(() => {
    if (!autoRetry || retriedRef.current) return
    retriedRef.current = true
    if (!appleSignInEnabled()) { autoRetry.onEnded(); return }
    void start(autoRetry.role, autoRetry.attempt ?? 2).finally(() => {
      if (!navigatingRef.current) autoRetry.onEnded(cancelledRef.current ? 'cancelled' : 'failed')
    })
    // Keyed on presence: the page decides one tick after this mounts, so
    // autoRetry arrives on a re-render. retriedRef keeps it to one press.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(autoRetry)])

  // Not a conditional hook: the hooks above always run, and only the output is
  // withheld. Putting the gate before useState would break the rules of hooks
  // the moment the flag changed between renders.
  if (!appleSignInEnabled()) return null

  // attempt 1 is a tap; attempt 2 is the one automatic retry. The role is a
  // parameter because the retry restarts the role the failed callback named.
  const start = async (role: 'employer' | 'employee', attempt: 1 | 2) => {
    setError('')
    setLoading(true)
    try {
      const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      const safeNext = safeInternalPath(next) || ''
      const redirectTo = `${siteUrl}/auth/callback/${role}${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`
      document.cookie = `oauth_intended_role=${role}; path=/; max-age=600; SameSite=Lax`

      // ── THE NATIVE BRANCH. ON THE WEB THIS IS FALSE AND NOTHING BELOW IT
      //    RUNS; the else-path below is byte-identical to what shipped before.
      //
      //    COPIED FROM GoogleSignInButton, NOT INVENTED. Google has been
      //    tapped in the shell and works; this is the same call, the same
      //    hand-back and the same outcome handling with a different provider.
      //
      //    WHY IT IS NEEDED HERE AT ALL: in the iOS shell the webview is a
      //    WKWebView loading our live site, and an OAuth page opened inside
      //    it is an embedded-browser sign-in. Google refuses those outright.
      //    Apple has no such published refusal, so this is NOT a fix for a
      //    diagnosed provider refusal — it is making all three providers take
      //    the one path that is known to work in the shell instead of leaving
      //    two of them on a path nothing has ever verified there.
      //
      //    isNativeApp() is a window property read and the plugins are
      //    imported dynamically inside runNativeOAuth, so the web bundle
      //    never gains a line of Capacitor. Asserted by weboauth:prove.
      if (isNativeApp()) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            // The custom scheme iOS routes back to the app. It must also be
            // in Supabase's redirect allow-list or the provider refuses it.
            redirectTo: NATIVE_CALLBACK_URL,
            scopes: 'name email',
            // Do not navigate this webview to the provider. Give us the URL
            // and we will open it where a system browser handles it.
            skipBrowserRedirect: true,
          },
        })
        if (error || !data?.url) {
          setError(error?.message || 'Could not start Apple sign-in.')
          setLoading(false)
          return
        }

        const outcome = await runNativeOAuth(data.url, (code) =>
          `${siteUrl}/auth/callback/${role}?code=${encodeURIComponent(code)}` +
          (safeNext ? `&next=${encodeURIComponent(safeNext)}` : '') +
          nativeFinishSuffix('apple', attempt),
        )

        // EVERY OUTCOME IS VISIBLE. The worst failure this design has is
        // silence — the sheet closes and nothing happens — so no path here
        // leaves the button spinning or the screen unchanged.
        if (outcome.kind === 'signed-in') { navigatingRef.current = true; return } // navigation under way
        if (outcome.kind === 'cancelled') { cancelledRef.current = true; setLoading(false); return }
        setError(outcome.reason)
        setLoading(false)
        return
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo,
          // Apple returns the name ONLY when 'name' is requested and ONLY on
          // the very first authorisation. Asking for it every time costs
          // nothing and is the only chance we ever get.
          scopes: 'name email',
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
      }
      // On success the browser is navigated to Apple — nothing to do.
    } catch (err: any) {
      setError(err?.message || 'Failed to start Apple sign-in')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { void start(role, 1) }}
        disabled={loading}
        className={className}
        aria-label="Continue with Apple"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#000000"
            d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.05-2.75-4.12zM14.5 4.76c.71-.87 1.19-2.07 1.06-3.26-1.02.04-2.26.68-3 1.54-.66.77-1.24 2-1.08 3.17 1.14.09 2.31-.58 3.02-1.45z"
          />
        </svg>
        {loading ? 'Taking you to Apple…' : (label || 'Continue with Apple')}
      </button>
      {error && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</div>}
    </>
  )
}
