'use client'

import { PAID_SURFACES_ENABLED } from '@/lib/paidSurfaces'
import BillingNotLive from '@/components/BillingNotLive'

import Link from 'next/link'
import Header from '@/components/Header'
import { trialPhraseFormal } from '@/lib/trialUtils'
import styles from './page.module.css'

export default function SubscriptionCancelPage() {
  // Billing is off — see lib/paidSurfaces. Returns before any hook runs, which
  // is safe only because the flag is a compile-time constant.
  if (!PAID_SURFACES_ENABLED) return <BillingNotLive />

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
          <h1 className={styles.title}>Checkout Cancelled</h1>
          <p className={styles.message}>
            No worries — you haven't been charged. You can subscribe whenever you're ready.
          </p>
          <div className={styles.info}>
            <p>Remember, all plans include:</p>
            <ul>
              <li>{trialPhraseFormal()}</li>
              <li>No upfront payment required</li>
              <li>14 days' cancellation notice</li>
            </ul>
          </div>
          <div className={styles.actions}>
            <Link href="/dashboard/subscription" className={styles.primaryBtn}>
              View Plans
            </Link>
            <Link href="/dashboard" className={styles.secondaryBtn}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
