'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import styles from '../login/page.module.css'

export default function VerifyEmailPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState('')

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setStatus('success')

        // Redirect based on user role after 3 seconds
        const role = session.user.user_metadata?.role
        setTimeout(() => {
          if (role === 'employer') {
            router.push('/employer/dashboard')
          } else {
            router.push('/dashboard')
          }
        }, 3000)
      }
    })

    // Check if there's already a session (verification already happened)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email_confirmed_at) {
        setStatus('success')
        const role = session.user.user_metadata?.role
        setTimeout(() => {
          if (role === 'employer') {
            router.push('/employer/dashboard')
          } else {
            router.push('/dashboard')
          }
        }, 3000)
      }
    })

    // Timeout after 10 seconds if nothing happens
    const timeout = setTimeout(() => {
      setStatus((prev) => {
        if (prev === 'verifying') {
          setError('Verification link may have expired or is invalid.')
          return 'error'
        }
        return prev
      })
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.formCard}>
          <div className={styles.loginHeader}>
            <span className={styles.loginIcon}>
              {status === 'success' ? '✅' : status === 'error' ? '❌' : '📧'}
            </span>
            <h1 className={styles.title}>
              {status === 'success'
                ? 'Email Verified'
                : status === 'error'
                  ? 'Verification Failed'
                  : 'Verifying Email'}
            </h1>
          </div>

          {status === 'verifying' && (
            <>
              <div className={styles.info}>
                Verifying your email address... Please wait.
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className={styles.success}>
                Your email has been verified successfully! Redirecting you now...
              </div>
              <div className={styles.links}>
                <Link href="/login" className={styles.link}>
                  Go to Login
                </Link>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className={styles.error}>
                {error || 'Something went wrong during verification.'}
              </div>
              <div className={styles.links}>
                <Link href="/login" className={styles.link}>
                  Go to Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
