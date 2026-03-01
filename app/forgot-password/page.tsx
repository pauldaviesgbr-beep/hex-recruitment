'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import styles from '../login/page.module.css'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.formCard}>
          <div className={styles.loginHeader}>
            <span className={styles.loginIcon}>🔑</span>
            <h1 className={styles.title}>Forgot Password</h1>
          </div>
          <p className={styles.subtitle}>
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>

          {sent ? (
            <>
              <div className={styles.success}>
                If an account exists with that email, you&apos;ll receive a reset link shortly. Please check your inbox and spam folder.
              </div>
              <div className={styles.links}>
                <Link href="/login" className={styles.link}>
                  Back to Login
                </Link>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.formGroup}>
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={styles.input}
                  placeholder="Enter your email"
                  autoComplete="email"
                />
              </div>

              <button type="submit" disabled={loading} className={styles.submitBtn}>
                {loading ? 'Sending...' : 'Send Reset Link'}
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
