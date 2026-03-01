'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import styles from './page.module.css'

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          window.location.href = '/dashboard'
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className={styles.card}>
      <div className={styles.iconWrapper}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#38a169" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h1 className={styles.title}>Welcome to Hex!</h1>
      <p className={styles.message}>
        Your subscription is now active. You have a 14-day free trial — no charges until it ends.
      </p>
      <div className={styles.features}>
        <p className={styles.featureLabel}>You can now:</p>
        <ul>
          <li>Post job listings</li>
          <li>Browse and contact candidates</li>
          <li>Manage applications</li>
          <li>Access your employer dashboard</li>
        </ul>
      </div>
      <div className={styles.actions}>
        <Link href="/post-job" className={styles.primaryBtn}>
          Post Your First Job
        </Link>
        <Link href="/dashboard" className={styles.secondaryBtn}>
          Go to Dashboard
        </Link>
      </div>
      <p className={styles.redirect}>
        Redirecting to dashboard in {countdown}s...
      </p>
    </div>
  )
}

export default function SubscriptionSuccessPage() {
  return (
    <main>
      <Header />
      <div className={styles.container}>
        <Suspense fallback={<div className={styles.card}><p>Loading...</p></div>}>
          <SuccessContent />
        </Suspense>
      </div>
    </main>
  )
}
