'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import styles from '../login/page.module.css'

// Password reset — the "set a new password" step.
//
// THE BUG THIS FIXES: the page used to wait for a PASSWORD_RECOVERY event or an
// existing session and show "Verifying your reset link…" until one arrived. If
// neither ever did — expired link, already-consumed link, a link opened in a
// different browser from the one that requested it, a failed code exchange — it
// spun forever with no explanation. Every distinct failure looked identical, and
// the user's only cue was to request another link, which failed the same way.
// A real employer sat on that spinner today.
//
// Now: every failure path ends in a message that says what happened and offers
// the way out, and the wait is bounded so "something we didn't anticipate" still
// resolves to an honest error rather than an infinite spinner.

const VERIFY_TIMEOUT_MS = 10_000

type Phase = 'verifying' | 'ready' | 'failed'

/** Supabase reports link problems in the query string OR the hash, depending on flow. */
function readAuthError(): string | null {
  if (typeof window === 'undefined') return null
  const q = new URLSearchParams(window.location.search)
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = q.get('error_code') || h.get('error_code')
  const desc = q.get('error_description') || h.get('error_description')
  const err = q.get('error') || h.get('error')
  if (!code && !desc && !err) return null

  // otp_expired covers both "expired" and "already used" — Supabase does not
  // distinguish, and neither should we, because the fix is the same.
  if (code === 'otp_expired' || /expired|invalid/i.test(desc || '')) {
    return 'This reset link has expired or has already been used. Reset links last one hour and only work once — please request a new one.'
  }
  return desc ? desc.replace(/\+/g, ' ') : 'That reset link could not be verified. Please request a new one.'
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [phase, setPhase] = useState<Phase>('verifying')
  const [verifyError, setVerifyError] = useState('')

  useEffect(() => {
    let done = false
    const finish = (next: Phase, message = '') => {
      if (done) return
      done = true
      setPhase(next)
      setVerifyError(message)
    }

    // 1. An explicit error on the URL is the clearest signal — take it first.
    const urlError = readAuthError()
    if (urlError) {
      finish('failed', urlError)
      return
    }

    // 2. The recovery event, for the implicit flow.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') finish('ready')
    })

    ;(async () => {
      // 3. Already signed in — includes arriving via /auth/confirm, which does the
      //    verify server-side and hands us a live session cookie.
      const { data: { session } } = await supabase.auth.getSession()
      if (session) return finish('ready')

      // 4. PKCE: exchange the code explicitly rather than trusting implicit
      //    detection, so a failure is something we can SEE and report.
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (!exchangeError) return finish('ready')

        // The client's own detectSessionInUrl may have consumed the code first,
        // in which case our exchange "fails" but a session now exists. Check
        // before calling it a failure.
        const { data: { session: after } } = await supabase.auth.getSession()
        if (after) return finish('ready')

        console.error('[reset-password] code exchange failed', exchangeError.message)
        return finish(
          'failed',
          /verifier|invalid request/i.test(exchangeError.message)
            ? 'This link was opened in a different browser or device from the one that requested it, so it can’t be verified. Please request a new link and open it on this device.'
            : 'This reset link has expired or has already been used. Please request a new one.',
        )
      }

      // 5. No error, no session, no code — nothing to verify against.
      finish('failed', 'This page needs a valid reset link. Please request one and follow the link in the email.')
    })()

    // 6. Backstop. Whatever we failed to anticipate, stop spinning and say so.
    const timer = setTimeout(() => {
      finish('failed', 'We couldn’t verify that reset link in time. It may have expired or already been used — please request a new one.')
    }, VERIFY_TIMEOUT_MS)

    return () => {
      done = true
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)

    // Redirect to login after 3 seconds
    setTimeout(() => {
      router.push('/login')
    }, 3000)
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.formCard}>
          <div className={styles.loginHeader}>
            <span className={styles.loginIcon}>🔒</span>
            <h1 className={styles.title}>Reset Password</h1>
          </div>
          <p className={styles.subtitle}>Enter your new password below.</p>

          {success ? (
            <>
              <div className={styles.success}>
                Your password has been reset successfully! Redirecting to login...
              </div>
              <div className={styles.links}>
                <Link href="/login" className={styles.link}>
                  Go to Login
                </Link>
              </div>
            </>
          ) : phase === 'failed' ? (
            <>
              <div className={styles.error}>{verifyError}</div>
              <div className={styles.links}>
                <Link href="/forgot-password" className={styles.link}>
                  Request New Reset Link
                </Link>
              </div>
              <div className={styles.links}>
                <Link href="/login" className={styles.link}>
                  Back to Login
                </Link>
              </div>
            </>
          ) : phase === 'verifying' ? (
            <>
              <div className={styles.info}>Verifying your reset link…</div>
            </>
          ) : (
            <form method="post" onSubmit={handleSubmit} className={styles.form}>
              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.formGroup}>
                <label htmlFor="password">New Password</label>
                <PasswordInput
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={styles.input}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="confirmPassword">Confirm Password</label>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={styles.input}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              <button type="submit" disabled={loading} className={styles.submitBtn}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>

              <div className={styles.links}>
                <Link href="/login" className={styles.link}>
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
