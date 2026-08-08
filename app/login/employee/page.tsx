'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import LinkedInSignInButton from '@/components/LinkedInSignInButton'
import LiveJobCount from '@/components/LiveJobCount'
import { safeInternalPath } from '@/lib/safeRedirect'
import styles from '../page.module.css'

function EmployeeLoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
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
      const pending = localStorage.getItem('thrive_pending_confirm')
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
        try { localStorage.setItem('thrive_pending_confirm', email) } catch { /* ignore */ }
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
    try { localStorage.removeItem('thrive_pending_confirm') } catch { /* ignore */ }
    router.push(safeInternalPath(redirectTo) || '/dashboard')
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.formCard}>
          <div className={styles.loginHeader}>
            <span className={styles.loginIcon}>👤</span>
            <h1 className={styles.title}>Job Seeker Login</h1>
          </div>
          <p className={styles.subtitle}>Find your next opportunity</p>
          <LiveJobCount style={{ margin: '0 0 1rem', color: '#374151' }} />

          {pendingEmail && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '0.9rem 1rem', margin: '0 0 1rem', textAlign: 'left' }}>
              <p style={{ margin: '0 0 0.35rem', fontWeight: 700, color: '#1e3a8a' }}>Confirm your email to apply</p>
              <p style={{ margin: '0 0 0.7rem', fontSize: '0.9rem', color: '#334155', lineHeight: 1.5 }}>
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

          <GoogleSignInButton role="employee" className={styles.googleBtn} next={safeRedirect || undefined} />
          <div style={{ marginTop: '0.6rem' }}>
            <LinkedInSignInButton role="employee" className={styles.googleBtn} next={safeRedirect || undefined} />
          </div>
          <div className={styles.divider}><span>or</span></div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {safeRedirect && !successMessage && (
              <div className={styles.info}>Sign in to view job details and apply</div>
            )}
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

            <button type="submit" disabled={loading} className={styles.submitBtn}>
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
