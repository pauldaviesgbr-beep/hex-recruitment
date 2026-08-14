'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import LinkedInSignInButton from '@/components/LinkedInSignInButton'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'
import { foundingPhraseShort } from '@/lib/trialUtils'
import { safeInternalPath } from '@/lib/safeRedirect'
import styles from '../page.module.css'
import { Ico } from '@/components/icons'

function EmployerLoginPageContent() {
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

  // Friendly "you used the wrong login for this account" notice — amber info
  // tone, not a scary red error. Fires for OAuth sign-ins (error=wrong-role)
  // AND email confirmation (error=wrong_account), keyed on `have`. Provider-
  // agnostic (Google / LinkedIn / email).
  // Where to return the employer after login (e.g. they were bounced off
  // /post-job). Raw and untrusted — every navigation below resolves it through
  // safeInternalPath at the point of navigation, and falls back to the
  // dashboard. Mirrors /login/employee.
  const redirectTo = searchParams.get('redirect')
  const safeRedirect = safeInternalPath(redirectTo)

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

  // If already authenticated as employer, redirect. Client and server now share
  // one cookie-backed session store, so getSession() sees exactly what the
  // server's layout guard sees — the login<->dashboard bounce loop the old
  // bounce guard contained can no longer occur, and the guard is gone.
  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session && session.user.user_metadata?.role === 'employer') {
        router.push(safeInternalPath(redirectTo) || '/employer/dashboard')
      }
    }
    checkExistingSession()
  }, [router, redirectTo])

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
      setError(loginError.message)
      setLoading(false)
      return
    }

    // Check if user is an employer
    if (data.user?.user_metadata?.role !== 'employer') {
      setError('This login is for employers only. Please use the employee login.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    // Sync subscription status to localStorage if employer has a plan
    const existingStatus = localStorage.getItem('subscriptionStatus')
    if (!existingStatus || (existingStatus !== 'trial' && existingStatus !== 'active')) {
      const plan = data.user.user_metadata?.subscription_plan
      if (plan) {
        localStorage.setItem('subscriptionStatus', 'trial')
        const trialEnd = new Date()
        trialEnd.setDate(trialEnd.getDate() + 14)
        localStorage.setItem('trialEndDate', trialEnd.toISOString())
      }
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
    // cookie store (createBrowserClient), which the server-side employer-layout
    // guard reads directly. The old set-session bridge is no longer needed.
    router.push(safeInternalPath(redirectTo) || '/employer/dashboard')
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.formCard}>
          <div className={styles.loginHeader}>
            <span className={styles.loginIcon}><Ico name="building" size={20} /></span>
            <h1 className={styles.title}>Employer Login</h1>
          </div>
          <p className={styles.subtitle}>Access your recruitment dashboard</p>

          {roleNotice && (
            <div className={styles.roleNotice}>
              {roleNotice.text} <Link href={roleNotice.href}>{roleNotice.cta}</Link>
            </div>
          )}

          <GoogleSignInButton role="employer" className={styles.googleBtn} next={safeRedirect || undefined} />
          <div style={{ marginTop: '0.6rem' }}>
            <LinkedInSignInButton role="employer" className={styles.googleBtn} next={safeRedirect || undefined} />
          </div>
          <div className={styles.divider}><span>or</span></div>

          <form method="post" onSubmit={handleSubmit} className={styles.form}>
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
                placeholder="employer@company.com"
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

            <button type="submit" disabled={loading || !hydrated} className={styles.submitBtn}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className={styles.divider}>
            <span>or</span>
          </div>

          <div className={styles.signupSection}>
            <p className={styles.signupText}>New employer?</p>
            <Link href="/register/employer-free" className={styles.signupBtn}>
              Create free account
            </Link>
          </div>

          <div className={styles.benefits}>
            <h3 className={styles.benefitsTitle}>Employer Benefits</h3>
            <ul className={styles.benefitsList}>
              <li>{foundingPhraseShort()} for first {EMPLOYER_COHORT_CAP} employers</li>
              <li>Post unlimited jobs</li>
              <li>Search &amp; message candidates</li>
              <li>Full hiring pipeline</li>
            </ul>
          </div>

          <div className={styles.switchLogin}>
            <p>Looking for work?</p>
            <Link href="/login/employee" className={styles.switchLink}>
              Employee Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function EmployerLoginPage() {
  return (
    <Suspense fallback={<main><Header /><div style={{ textAlign: 'center', padding: '4rem' }}>Loading…</div></main>}>
      <EmployerLoginPageContent />
    </Suspense>
  )
}
