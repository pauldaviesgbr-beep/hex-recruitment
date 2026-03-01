'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import styles from './page.module.css'

export default function BoostCancelPage() {
  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e53e3e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className={styles.title}>Payment Cancelled</h1>
          <p className={styles.message}>
            No worries — you haven't been charged. You can boost your listing whenever you're ready.
          </p>
          <div className={styles.actions}>
            <Link href="/dashboard" className={styles.primaryBtn}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
