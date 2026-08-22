'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import LinkedInSignInButton from '@/components/LinkedInSignInButton'
import { safeInternalPath } from '@/lib/safeRedirect'
import { getPendingConfirm, setPendingConfirm, clearPendingConfirm } from '@/lib/pendingConfirm'
import styles from '../page.module.css'

function EmployeeLoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // The submit control stays disabled until React has hydrated. Before
  // that, onSubmit is not attached, and a click would fire a NATIVE form
  // submit; method="post" on the form keeps credentials out of the URL if
  // that ever happens anyway, but a disabled button stops it happening.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])
  const [successMessage, setSuccessMessage] = useState('')
  // If the visitor just signed up (unconfirmed) and hit the apply-gate, their
  // email was stashed in localStorage at sign-up — show a "confirm your email to
  // apply" prompt here instead of a bare login they can't complete yet.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  // Check if user just registered or is redirecting from a job
  const justRegistered = searchParams.get('registered') === 'true'
  // Raw, untrusted. Used directly ONLY for UI hints. Every navigation and every
  // URL we thread it into resolves it through safeInternalPath first — an
  // unvalidated `?redirect=//evil.com` was a live open redirect here.
  const redirectTo = searchParams.get('redirect')
  // Same-origin path or null. Recomputed at each point of navigation below.
  const safeRedirect = safeInternalPath(redirectTo)

  /**
   * Did they get here by tapping Apply on a job, rather than choosing to log in?
   *
   * Read from the redirect target, which /job/[id] sets to
   * `/job/<id>?apply=1`. That is the difference between somebody returning to
   * an account and somebody who has never had one, and it decides whether this
   * page leads with "create an account" or with a password box.
   */
  const arrivingToApply = !!safeRedirect && safeRedirect.startsWith('/job/')

  /**
   * Are we inside another app's embedded browser?
   *
   * Everyone who taps a link in the LinkedIn or Facebook app lands in one, and
   * sign-in there can fail in ways we do not control and cannot see. Detected
   * from the user agent — which is the only signal available, and unusually IS
   * the right tool here, because the app names itself in it. Nothing depends on
   * this being exhaustive: a missed webview just means no extra notice, and a
   * false positive shows a hint that is harmless.
   */
  const [inAppBrowser, setInAppBrowser] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent || ''
    setInAppBrowser(/LinkedInApp|FBAN|FBAV|Instagram|Twitter|; wv\)|WebView/i.test(ua))
  }, [])

  // Friendly "you used the wrong login for this account" notice — amber info
  // tone, not a scary red error. Fires for OAuth sign-ins (error=wrong-role)
  // AND email confirmation (error=wrong_account), keyed on `have` (the role the
  // account actually is). Provider-agnostic (Google / LinkedIn / email).
  const authErr = searchParams.get('error')
  const have = searchParams.get('have')
  const roleNotice =
    authErr === 'wrong-role' || authErr === 'wrong_account'
      ? have === 'employer'
        ? { text: 'This email is registered as an employer account. Head to the employer login to access your recruitment dashboard.', href: '/login/employer', cta: 'Go to employer login →' }
        : have === 'employee'
        ? { text: 'This email is registered as a job seeker account. Head to the job seeker login to find your next role.', href: '/login/employee', cta: 'Go to job seeker login →' }
        : null
      : null

  // If already authenticated, redirect immediately. Client and server now share
  // one cookie-backed session store, so getSession() sees exactly what the
  // server sees — the login<->dashboard bounce loop the old bounce guard
  // contained can no longer occur, and the guard is gone.
  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        // A SESSION MEANS THE SIGN-UP FINISHED, however it finished.
        // Clearing only on a successful PASSWORD login was the whole reason
        // the notice outlived the account: confirmation happens server-side on
        // /auth/confirm, which never touches this browser key, so somebody who
        // clicked the link in the email kept being told to confirm their email.
        clearPendingConfirm()
        router.push(safeInternalPath(redirectTo) || '/dashboard')
        return
      }
      // Show success message if just registered
      if (justRegistered) {
        setSuccessMessage('Registration complete! Please log in with your credentials.')
      }
    }
    checkExistingSession()
  }, [router, justRegistered, redirectTo])

  // Surface a pending unconfirmed sign-up (stashed at sign-up time).
  useEffect(() => {
    try {
      const pending = getPendingConfirm()
      if (pending) setPendingEmail(pending)
    } catch { /* ignore */ }
  }, [])

  const handleResend = async () => {
    if (!pendingEmail) return
    setResend('sending')
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      const nextQS = safeRedirect ? `&next=${encodeURIComponent(safeRedirect)}` : ''
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: pendingEmail,
        options: { emailRedirectTo: `${siteUrl}/auth/confirm?role=employee${nextQS}` },
      })
      setResend(resendErr ? 'error' : 'sent')
    } catch { setResend('error') }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Clear any existing (possibly stale) session before signing in, so a
    // fresh login cleanly REPLACES rather than stacking on top of a prior
    // session. scope:'local' only clears client storage — no network call /
    // refresh-token revocation — so the clean-login path is unaffected.
    await supabase.auth.signOut({ scope: 'local' })

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (loginError) {
      // Unconfirmed accounts can't sign in yet — steer them to confirm-email
      // (with the resend prompt) rather than showing a bare error.
      if (/not confirmed|confirm/i.test(loginError.message)) {
        setPendingEmail(email)
        setPendingConfirm(email)
        setError('Please confirm your email first — check your inbox for the link (or resend below).')
      } else {
        setError(loginError.message)
      }
      setLoading(false)
      return
    }

    // Check if user is an employee
    if (data.user?.user_metadata?.role !== 'employee') {
      setError('This login is for job seekers only. Please use the employer login.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    // hex_session_volatile is gone: it was written on every unticked login and
    // read nowhere. hex_prev_volatile is the one that does the work — see the
    // volatile-cleanup effect in SessionGuard.
    if (!rememberMe) {
      localStorage.setItem('hex_prev_volatile', '1')
    } else {
      localStorage.removeItem('hex_prev_volatile')
    }

    // signInWithPassword has already written the session to the shared
    // cookie store (createBrowserClient), which the server reads directly.
    // No cookie bridge is needed any more.
    clearPendingConfirm()
    router.push(safeInternalPath(redirectTo) || '/dashboard')
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.formCard}>
          {/*
            ARRIVING FROM "APPLY NOW" IS A DIFFERENT VISIT FROM COMING TO LOG IN.
            A chef who tapped Apply on a LinkedIn post has no account, and this
            page used to greet him with "Job Seeker Login" over a password form,
            with "Create an account" as a small link at the very bottom. It read
            as a locked door. Most people arriving this way are NEW, so the
            primary action is now creating an account and signing in is secondary.
            Cost us a real candidate on 13 Aug 2026.
          */}
          {/*
            NO ICON. There was an emoji here — 👤, and 📝 in the apply state.
            Emoji used as iconography is the single thing that most makes a page
            read as unfinished, and this one also pushed the heading off-centre
            because the row is a flex with a gap. Nothing replaces it: no
            substitute emoji, no invented SVG. Nothing is better than something
            here.
          */}
          <div className={styles.loginHeader}>
            <h1 className={`${styles.title} ${styles.titleCompact}`}>
              {arrivingToApply ? 'Create a free account to apply' : 'Job Seeker Login'}
            </h1>
          </div>
          <p className={styles.subtitle}>
            {arrivingToApply
              ? 'It takes a minute, and we’ll bring you straight back to the role.'
              : 'Find your next opportunity'}
          </p>
          {/* "247 roles live now" AND THE GREEN BUTTON BOTH LEFT THIS SCREEN.
              The live count is a good line on the wrong screen — it argues for
              a product the visitor has already chosen, and it pushed the
              primary action further down. It stays on the job page and the
              board. The green "Create a free account" button is gone with it:
              green is retired from the product, and three competing actions on
              one card is what made this read as a menu rather than a door.
              Creating an account with email is now a level-2 action below the
              divider, where it belongs. */}

          {pendingEmail && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '0.9rem 1rem', margin: '0 0 1rem', textAlign: 'left' }}>
              <p style={{ margin: '0 0 0.35rem', fontWeight: 700, color: '#1e3a8a' }}>Confirm your email to apply</p>
              {/* overflowWrap ANYWHERE, BECAUSE AN EMAIL ADDRESS HAS NO SPACES.
                  A plus-address ran 101px past this box on a 390px screen —
                  off the card and off the viewport — because the browser had
                  nowhere legal to break "pauldavies.gbr+thrivetest100@gmail.com".
                  `break-word` is not enough: it only breaks where a word could
                  already wrap. `anywhere` is what breaks mid-token.
                  Measured on a phone 22 Aug 2026: element right edge 394px,
                  container right edge 293px. */}
              <p style={{ margin: '0 0 0.7rem', fontSize: '0.9rem', color: '#334155', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                You signed up as <strong>{pendingEmail}</strong>. Click the link we emailed you to start applying for roles.
              </p>
              <button type="button" onClick={handleResend} disabled={resend === 'sending'} style={{ border: '1px solid #93c5fd', background: '#fff', color: '#1e3a8a', padding: '0.5rem 1rem', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                {resend === 'sending' ? 'Sending…' : resend === 'sent' ? 'Email sent ✓' : 'Resend email'}
              </button>
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>Already confirmed? Log in below.</p>
            </div>
          )}

          {roleNotice && (
            <div className={styles.roleNotice}>
              {roleNotice.text} <Link href={roleNotice.href}>{roleNotice.cta}</Link>
            </div>
          )}

          {/* LINKEDIN IS THE ONE PRIMARY, AND THE ORDER IS THE POINT.
              Arrivals come from LinkedIn on a phone; they are already
              authenticated there, so for most of them it IS one tap — but
              "most" is why the eyebrow no longer says so. Google follows as
              level 2. DOM order is LinkedIn -> Google ->
              email so the keyboard order matches the visual hierarchy. */}
          {/* "ONE TAP, NO PASSWORD" WAS A CLAIM WE CANNOT KEEP — Paul, 15 Aug
              2026, reading it on his own phone. OAuth removes the password you
              would CREATE for Thrive; it does not remove LinkedIn's. Signed out
              on that device, LinkedIn asks for one — so the line was false for
              precisely the person it would annoy most, and "one tap" was true
              only for someone already authenticated. Same family as the
              employmentType default: a sentence that asserts something only
              sometimes true, in our voice. What IS true in every case is that
              Thrive never asks you to invent and remember another password. */}
          <p className={styles.authEyebrow}>Fastest — no new password to create</p>
          <LinkedInSignInButton role="employee" className={styles.authPrimary} next={safeRedirect || undefined} />
          <div style={{ marginTop: '0.6rem' }}>
            <GoogleSignInButton role="employee" className={styles.googleBtn} next={safeRedirect || undefined} />
          </div>

          {/*
            THE WEBVIEW HINT, DEMOTED TO A HINT.
            It used to be a yellow bordered box sitting ABOVE these buttons — it
            announced a problem before one had happened, in a warning colour,
            somewhere it could not be ignored. To someone deciding whether to
            trust us with an email address that reads as "this site is broken",
            which costs more than the information saves.
            It is not deleted, because if sign-in DOES fail in a webview then a
            candidate with no explanation is exactly the person we lost. It now
            sits BELOW the buttons — where you look only once something has not
            worked — as ordinary muted helper text, and stays conditional
            because we still cannot show that OAuth fails in a webview.
          */}
          {inAppBrowser && (
            <p className={styles.escapeHatch}>
              Opened this from an app and the buttons won&rsquo;t work?{' '}
              <u>Open in your browser</u>
            </p>
          )}

          <div className={styles.divider}><span>or</span></div>

          <form method="post" onSubmit={handleSubmit} className={styles.form}>
            {/*
              THE OLD LINE HERE WAS FALSE: "Sign in to view job details and
              apply". He had ALREADY read the job details — the job page is
              fully public, salary and description included. Being told he must
              sign in to see what he has just read is the kind of sentence that
              makes someone assume the site is broken, or that they have hit a
              paywall. It now says what is actually true: an account is needed
              to APPLY, not to look.
            */}
            {/* THE BLUE INFO PANEL IS GONE. It was a coloured box explaining
                something that fits in one quiet line, sitting between the
                primary action and the form. The promise it carried — that we
                bring you back to the role — is the one sentence on this screen
                that answers the question actually in the user's head, so it is
                NOT deleted: it stays in the sub-head above, and returns as
                plain text beside the log-in sentence at the bottom. */}
            {successMessage && <div className={styles.success}>{successMessage}</div>}
            {successMessage && <div className={styles.success}>{successMessage}</div>}
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.formGroup}>
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={styles.input}
                placeholder="you@email.com"
                autoComplete="email"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={styles.input}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <div className={styles.rememberRow}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className={styles.checkbox}
                />
                Remember me
              </label>
              <Link href="/forgot-password" className={styles.forgotLink}>
                Forgot password?
              </Link>
            </div>

            {/* LEVEL 2, NOT YELLOW. Yellow is the primary on Apply Now, where
                the user has already committed — "the action you came here to
                take". Signing in is not that. A yellow button here competed
                with the navy LinkedIn primary above it and put two primaries
                on one card, which is the problem this screen exists to fix. */}
            <button type="submit" disabled={loading || !hydrated} className={styles.authSecondary}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className={styles.divider}>
            <span>or</span>
          </div>

          <div className={styles.signupSection}>
            <p className={styles.signupText}>
              New here?{' '}
              <Link
                href={safeRedirect ? `/register/employee?redirect=${encodeURIComponent(safeRedirect)}` : '/register/employee'}
                className={styles.switchLink}
              >
                Create an account
              </Link>
            </p>
          </div>

          <div className={styles.switchLogin}>
            <p>Hiring staff?</p>
            <Link href="/login/employer" className={styles.switchLink}>
              Employer Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

// Wrap in Suspense for useSearchParams
export default function EmployeeLoginPage() {
  return (
    <Suspense fallback={
      <main>
        <Header />
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          Loading...
        </div>
      </main>
    }>
      <EmployeeLoginPageContent />
    </Suspense>
  )
}
