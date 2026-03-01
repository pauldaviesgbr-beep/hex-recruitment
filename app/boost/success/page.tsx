'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import styles from './page.module.css'

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [countdown, setCountdown] = useState(3)

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
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#38a169" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h1 className={styles.title}>Boost Activated!</h1>
      <p className={styles.message}>
        Your boost is now live. Your listing will appear with a Featured badge and rank higher in search results.
      </p>
      <div className={styles.actions}>
        <Link href="/dashboard" className={styles.primaryBtn}>
          Go to Dashboard
        </Link>
      </div>
      <p className={styles.redirect}>
        Redirecting in {countdown}s...
      </p>
    </div>
  )
}

export default function BoostSuccessPage() {
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
