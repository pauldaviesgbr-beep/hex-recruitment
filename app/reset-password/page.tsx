'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import styles from '../login/page.module.css'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase automatically picks up the token from the URL hash
    // and establishes a session via onAuthStateChange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // Also check if there's already a session (user clicked the link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true)
      }
    })

    return () => subscription.unsubscribe()
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
          ) : !ready ? (
            <>
              <div className={styles.info}>
                Verifying your reset link... If this takes too long, please request a new reset link.
              </div>
              <div className={styles.links}>
                <Link href="/forgot-password" className={styles.link}>
                  Request New Reset Link
                </Link>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
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
