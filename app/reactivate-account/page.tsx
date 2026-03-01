'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE } from '@/lib/mockAuth'
import { JOB_SEEKER_REACTIVATION_PRICE, formatExpiryDate, calculateTrialExpiry } from '@/lib/trialUtils'
import styles from './page.module.css'

export default function ReactivateAccountPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [profileName, setProfileName] = useState('')
  const [expiredDate, setExpiredDate] = useState('')

  useEffect(() => {
    // Load profile info
    if (DEV_MODE) {
      const profile = JSON.parse(localStorage.getItem('currentTestProfile') || '{}')
      if (profile.firstName) {
        setProfileName(`${profile.firstName} ${profile.lastName}`)
      }
      if (profile.trialExpiresAt) {
        setExpiredDate(formatExpiryDate(profile.trialExpiresAt))
      }
      return
    }

    // Production: load user data from Supabase
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      // Get user name from session metadata
      const firstName = session.user.user_metadata?.first_name || ''
      const lastName = session.user.user_metadata?.last_name || ''
      const fullName = session.user.user_metadata?.full_name || ''
      setProfileName(fullName || `${firstName} ${lastName}`.trim())

      // Fetch trial expiry from candidate profile
      try {
        const { data: profile } = await supabase
          .from('candidate_profiles')
          .select('trial_expires_at')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (profile?.trial_expires_at) {
          setExpiredDate(formatExpiryDate(profile.trial_expires_at))
        } else {
          // Calculate from account creation
          const trialEnd = calculateTrialExpiry(session.user.created_at)
          setExpiredDate(formatExpiryDate(trialEnd))
        }
      } catch {
        const trialEnd = calculateTrialExpiry(session.user.created_at)
        setExpiredDate(formatExpiryDate(trialEnd))
      }
    }

    loadData()
  }, [router])

  const handlePayment = async () => {
    setLoading(true)
    setError('')

    try {
      // Simulate payment processing (future: Stripe integration)
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (DEV_MODE) {
        // Update profile status in localStorage
        const profile = JSON.parse(localStorage.getItem('currentTestProfile') || '{}')
        const now = new Date()

        profile.accountStatus = 'active'
        profile.reactivationPaidAt = now.toISOString()
        // Grant another 14 days of access
        profile.trialExpiresAt = calculateTrialExpiry(now).toISOString()

        localStorage.setItem('currentTestProfile', JSON.stringify(profile))

        // Also update in testProfiles array
        const testProfiles = JSON.parse(localStorage.getItem('testProfiles') || '[]')
        const updatedProfiles = testProfiles.map((p: any) =>
          p.id === profile.id ? profile : p
        )
        localStorage.setItem('testProfiles', JSON.stringify(updatedProfiles))
      }

      setSuccess(true)

      // Redirect to jobs page after success
      setTimeout(() => {
        router.push('/jobs')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <main className={styles.main}>
        <Header />
        <div className={styles.container}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.successTitle}>Account Reactivated!</h1>
            <p className={styles.successMessage}>
              Your account is now active. Redirecting to jobs...
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <Header />
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.expiredBadge}>Trial Expired</div>
            <h1 className={styles.title}>Reactivate Your Account</h1>
            {profileName && (
              <p className={styles.greeting}>Welcome back, {profileName}</p>
            )}
            <p className={styles.subtitle}>
              Your 14-day free trial ended{expiredDate && ` on ${expiredDate}`}.
              Make a one-time payment to continue using Hex.
            </p>
          </div>

          <div className={styles.priceBox}>
            <div className={styles.priceAmount}>
              <span className={styles.currency}>£</span>
              <span className={styles.price}>{JOB_SEEKER_REACTIVATION_PRICE.toFixed(0)}</span>
            </div>
            <span className={styles.priceLabel}>One-time payment</span>
            <span className={styles.priceNote}>Lifetime access - no recurring fees</span>
          </div>

          <div className={styles.benefits}>
            <h3 className={styles.benefitsTitle}>What you get:</h3>
            <ul className={styles.benefitsList}>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Browse and apply to unlimited job listings
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Direct messaging with employers
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Profile visible to all recruiters
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Get notified about matching opportunities
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Track all your applications in one place
              </li>
            </ul>
          </div>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <button
            onClick={handlePayment}
            disabled={loading}
            className={styles.payButton}
          >
            {loading ? (
              <>
                <span className={styles.spinner}></span>
                Processing...
              </>
            ) : (
              `Pay £${JOB_SEEKER_REACTIVATION_PRICE.toFixed(0)} & Reactivate`
            )}
          </button>

          <div className={styles.secureNote}>
            <span className={styles.lockIcon}>🔒</span>
            <span>Secure payment via Stripe</span>
          </div>

          <div className={styles.footer}>
            <p className={styles.footerText}>
              Need help? <Link href="/contact" className={styles.link}>Contact Support</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
