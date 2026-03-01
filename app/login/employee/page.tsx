'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
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

  // Check if user just registered or is redirecting from a job
  const justRegistered = searchParams.get('registered') === 'true'
  const redirectTo = searchParams.get('redirect')
  const postLoginRedirect = redirectTo || '/dashboard'

  // If already authenticated, redirect immediately
  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push(postLoginRedirect)
        return
      }
      // Show success message if just registered
      if (justRegistered) {
        setSuccessMessage('Registration complete! Please log in with your credentials.')
      }
    }
    checkExistingSession()
  }, [router, justRegistered, postLoginRedirect])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (loginError) {
      setError(loginError.message)
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

    router.push(postLoginRedirect)
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

          <form onSubmit={handleSubmit} className={styles.form}>
            {redirectTo && !successMessage && (
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
            <p className={styles.signupText}>New here?</p>
            <Link href="/register/employee" className={styles.signupBtn}>
              Create your profile
            </Link>
          </div>

          <div className={styles.benefits}>
            <h3 className={styles.benefitsTitle}>Why Join?</h3>
            <ul className={styles.benefitsList}>
              <li>Browse thousands of jobs</li>
              <li>Apply instantly</li>
              <li>Get noticed by employers</li>
              <li>100% free</li>
            </ul>
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
