'use client'

// ONE LOGIN. IT NEVER ASKS WHO YOU ARE — THE ACCOUNT KNOWS.
//
// There were two: /login/employee and /login/employer, reached through a
// chooser at /login. Three screens to answer a question we could already
// answer ourselves, and it produced a real fault: sign in on the wrong one and
// you were told "This login is for job seekers only. Please use the employer
// login." — a dead end for somebody who had typed the right password.
//
// THAT BOUNCE IS GONE BY CONSTRUCTION, not by a fix. There is nowhere to be
// wrong. The role is read after the session exists and decides only where the
// person LANDS.
//
// WHAT THIS SCREEN MUST NOT LOSE, all of it earned the hard way:
//   · Remember me is per BROWSER, not per tab — a session cookie, because
//     sessionStorage signed people out of the tab they were working in.
//   · The pending-confirm notice and its resend, expiring after seven days.
//   · The wrong-role notice, which still arrives from the OAuth callbacks as
//     ?error=wrong-role&have=… even though this form cannot produce it.
//   · The in-app-browser hint, for people arriving from the LinkedIn app.
//   · ?redirect threading, through both OAuth and the email path.
//
// AND NOBODY READS A SENTENCE WE DID NOT WRITE. Every error goes through
// lib/loginErrors.ts. "Invalid login credentials" is Supabase's wording and
// "Load failed" is Safari's, and Paul was shown both, verbatim, on his phone.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import PasswordInput from '@/components/PasswordInput'
import { callbackErrorCopy } from '@/lib/loginErrors'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import LinkedInSignInButton from '@/components/LinkedInSignInButton'
import AppleSignInButton from '@/components/AppleSignInButton'
import { safeInternalPath } from '@/lib/safeRedirect'
import { loginErrorCopy } from '@/lib/loginErrors'
import { getPendingConfirm, setPendingConfirm, clearPendingConfirm } from '@/lib/pendingConfirm'
import styles from './LoginPanel.module.css'

export default function LoginPanel({
  returnTo,
  authError,
  have,
  justRegistered,
}: {
  returnTo?: string | null
  authError?: string | null
  have?: string | null
  justRegistered?: boolean
}) {
  const router = useRouter()
  const safeReturn = safeInternalPath(returnTo)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  // The submit control stays disabled until React has hydrated. Before that,
  // onSubmit is not attached and a click fires a NATIVE form submit; the form
  // is method="post" so credentials stay out of the URL if it ever happens.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  // Everyone who taps a link in the LinkedIn or Facebook app lands in an
  // embedded browser where sign-in can fail in ways we do not control. The
  // user agent is the only signal, and unusually it IS the right tool: the app
  // names itself in it. Nothing depends on this being exhaustive.
  const [inAppBrowser, setInAppBrowser] = useState(false)
  useEffect(() => {
    setInAppBrowser(/LinkedInApp|FBAN|FBAV|Instagram|Twitter|; wv\)|WebView/i.test(navigator.userAgent || ''))
  }, [])

  // Already signed in — go where they were going.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        clearPendingConfirm()
        router.push(safeInternalPath(returnTo) || '/dashboard')
      }
    })
  }, [router, returnTo])

  useEffect(() => { setPendingEmail(getPendingConfirm()) }, [])

  // Still arrives from the OAuth callbacks even though this form cannot cause
  // it: a Google or LinkedIn account whose role does not match the button that
  // was pressed. Amber, informational, not an error tone.
  const roleNotice =
    authError === 'wrong-role' || authError === 'wrong_account'
      ? have === 'employer'
        ? 'That email is registered as an employer account — signing in will take you to your recruitment dashboard.'
        : have === 'employee'
        ? 'That email is registered as a job seeker account — signing in will take you to your job search.'
        : null
      : null

  // THE FAILURE THAT RENDERED NOTHING. Only wrong-role was handled here, so
  // every other value the callbacks send — exchange-failed, no-code, and any
  // provider error passed through — arrived and displayed nothing at all. A
  // candidate saw a login page and no reason, which is indistinguishable
  // from a dead button. One place decides the words: lib/loginErrors.ts.
  const callbackNotice = callbackErrorCopy(authError)
  const handleResend = async () => {
    if (!pendingEmail) return
    setResend('sending')
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: pendingEmail,
        options: { emailRedirectTo: `${siteUrl}${safeReturn || '/dashboard'}` },
      })
      // AND IF THE SERVER SAYS IT IS ALREADY CONFIRMED, BELIEVE IT AND STOP
      // NAGGING. This is the ONE moment the browser can learn the thing it
      // otherwise cannot: the person has told us to resend, so we are asking
      // about an address they hold, and Supabase's refusal names the reason.
      // It is not an enumeration oracle — the caller has to have the flag
      // already, and the answer only ever reaches the person who asked.
      // One tap becomes a permanent fix for this browser.
      const alreadyDone = /already\s*(been\s*)?confirmed|already\s*registered|already\s*verified/i
        .test(resendErr?.message || '')
      if (alreadyDone) {
        clearPendingConfirm()
        setPendingEmail(null)
        setResend('idle')
        return
      }
      setResend(resendErr ? 'error' : 'sent')
    } catch { setResend('error') }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Clear any stale session first so a fresh login REPLACES rather than
    // stacks. scope:'local' touches client storage only — no network call, no
    // refresh-token revocation.
    await supabase.auth.signOut({ scope: 'local' })

    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })

    if (loginError) {
      const copy = loginErrorCopy(loginError.message)
      if (copy.kind === 'unconfirmed') {
        setPendingEmail(email)
        setPendingConfirm(email)
      }
      setError(copy.message)
      setLoading(false)
      return
    }

    // THE ROLE DECIDES WHERE THEY LAND, AND NOTHING ELSE. It is not a gate any
    // more — there is no wrong door to be on, so there is nothing to refuse.
    const role = data.user?.user_metadata?.role as string | undefined

    if (!rememberMe) localStorage.setItem('hex_prev_volatile', '1')
    else localStorage.removeItem('hex_prev_volatile')

    clearPendingConfirm()
    router.push(safeReturn || (role === 'employer' ? '/employer/dashboard' : '/dashboard'))
  }

  return (
    <div className={styles.panel}>
      {/* NO SUBTITLE. This page cannot promise anything about an account it has
          not seen yet, and "Find your next opportunity" was a job seeker's
          sentence on a screen that no longer knows who is reading it. */}
      <h1 className={styles.title}>Log in</h1>

      {justRegistered && (
        <p className={styles.success}>Registration complete — log in with your details.</p>
      )}

      {roleNotice && <p className={styles.notice}>{roleNotice}</p>}
      {callbackNotice && <p className={styles.error}>{callbackNotice}</p>}

      {pendingEmail && (
        <div className={styles.pending}>
          {/* THIS BANNER MUST NOT ASSERT WHAT THIS BROWSER CANNOT KNOW.
              It used to read "Confirm your email to finish", stated as fact.
              The flag behind it is written at signup in localStorage and can
              only be cleared by something happening IN THIS BROWSER — a
              session appearing, a password sign-in, or a seven-day expiry.
              Confirmation happens server-side, and in the iOS shell it
              happens in SAFARI, so the app can never learn it. Paul was told
              to confirm an address he had confirmed an hour earlier, and
              every app user who registers by email takes that exact path.

              WE DO NOT ASK THE SERVER, DELIBERATELY. An "is this address
              confirmed?" endpoint would answer for ANY address to ANY
              caller — an account-enumeration oracle, a worse fault than a
              stale notice.

              So the copy carries the ACTION and drops the CLAIM: it is true
              whether or not they have already confirmed. */}
          <p className={styles.pendingTitle}>One more step — or already done?</p>
          {/* overflowWrap:anywhere lives in the stylesheet — an email address
              has no spaces, and a plus-address ran 101px past this box on a
              390px screen because the browser had nowhere legal to break it. */}
          <p className={styles.pendingBody}>
            You signed up as <strong>{pendingEmail}</strong>. If you haven’t confirmed
            it yet, click the link we emailed you — if you already have, just log in below.
          </p>
          <button type="button" onClick={handleResend} disabled={resend === 'sending'} className={styles.resend}>
            {resend === 'sending' ? 'Sending…' : resend === 'sent' ? 'Email sent' : 'Resend email'}
          </button>
        </div>
      )}

      {/* ONE STACK, ONE GAP. These three used to be bare siblings with a
          spacer div wrapped around GOOGLE ONLY (.oauthGap, margin-top 10px).
          That worked while there were two buttons and the spacer sat between
          them. Apple was later inserted ABOVE it and inherited nothing, so
          the measured gaps were 0px between LinkedIn and Apple and 10px
          between Apple and Google — which is what a person sees as "Apple is
          too close to LinkedIn".

          A margin on ONE CHILD is a spacer that only holds while nobody adds
          a sibling. A gap on the PARENT cannot be wrong about a fourth
          provider, which is the point of moving it. */}
      <div className={styles.oauthStack}>
        <LinkedInSignInButton role="employee" className={styles.oauth} label="Continue with LinkedIn" next={safeReturn || undefined} />
        {/* Hidden until the provider is configured — lib/appleSignIn.ts. */}
        <AppleSignInButton role="employee" className={styles.oauth} label="Continue with Apple" next={safeReturn || undefined} />
        <GoogleSignInButton role="employee" className={styles.oauth} label="Continue with Google" next={safeReturn || undefined} />
      </div>

      {inAppBrowser && (
        <p className={styles.hint}>
          If sign-in does not work here, open this page in Safari or Chrome.
        </p>
      )}

      <div className={styles.divider}><span>or with email</span></div>

      <form onSubmit={handleSubmit} method="post" className={styles.form}>
        <label className={styles.label} htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          className={styles.input}
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@email.com"
          autoComplete="email"
          required
        />

        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor="login-password">Password</label>
          <Link href="/forgot-password" className={styles.forgot}>Forgot it?</Link>
        </div>
        <PasswordInput
          id="login-password"
          className={styles.input}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Your password"
          autoComplete="current-password"
          required
        />

        <label className={styles.remember}>
          <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
          <span>Keep me signed in on this browser</span>
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submit} disabled={loading || !hydrated}>
          {loading ? 'Signing you in…' : 'Log in'}
        </button>
      </form>

      <p className={styles.foot}>
        New here?{' '}
        <Link href={safeReturn ? `/register/employee?redirect=${encodeURIComponent(safeReturn)}` : '/signup'} className={styles.footLink}>
          Create an account
        </Link>{' '}
        — it takes a minute.
      </p>
    </div>
  )
}
