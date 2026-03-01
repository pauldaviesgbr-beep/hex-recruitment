'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { EMPLOYER_SUBSCRIPTION_PRICE, formatExpiryDate, calculateTrialExpiry } from '@/lib/trialUtils'
import styles from './page.module.css'

export default function RenewSubscriptionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [expiredDate, setExpiredDate] = useState('')

  useEffect(() => {
    if (DEV_MODE) {
      const mockUser = getMockUser()
      if (mockUser?.user_metadata?.company_name) {
        setCompanyName(mockUser.user_metadata.company_name)
      }
      const subscription = JSON.parse(localStorage.getItem('subscription') || '{}')
      if (subscription.trialEndDate) {
        setExpiredDate(formatExpiryDate(subscription.trialEndDate))
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
      if (session.user.user_metadata?.role !== 'employer') {
        router.push('/login')
        return
      }

      setCompanyName(session.user.user_metadata?.company_name || '')

      // Fetch subscription to get trial end date
      try {
        const { data: sub } = await supabase
          .from('employer_subscriptions')
          .select('trial_ends_at')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (sub?.trial_ends_at) {
          setExpiredDate(formatExpiryDate(sub.trial_ends_at))
        } else {
          // Calculate from account creation
          const trialEnd = calculateTrialExpiry(session.user.created_at)
          setExpiredDate(formatExpiryDate(trialEnd))
        }
      } catch {
        // Fallback to calculated trial end
        const trialEnd = calculateTrialExpiry(session.user.created_at)
        setExpiredDate(formatExpiryDate(trialEnd))
      }
    }

    loadData()
  }, [router])

  const handleSubscribe = async () => {
    setLoading(true)
    setError('')

    try {
      // Simulate payment processing (future: Stripe integration)
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (DEV_MODE) {
        const now = new Date()
        const nextBilling = new Date(now)
        nextBilling.setMonth(nextBilling.getMonth() + 1)

        // Update subscription status
        const subscriptionData = {
          status: 'active',
          plan: 'monthly',
          amount: EMPLOYER_SUBSCRIPTION_PRICE,
          currency: 'GBP',
          subscribedAt: now.toISOString(),
          nextBillingDate: nextBilling.toISOString(),
          updatedAt: now.toISOString(),
        }

        localStorage.setItem('subscription', JSON.stringify(subscriptionData))
        localStorage.setItem('subscriptionStatus', 'active')
      }

      setSuccess(true)

      // Redirect to candidates page after success
      setTimeout(() => {
        router.push('/candidates')
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
            <h1 className={styles.successTitle}>Subscription Activated!</h1>
            <p className={styles.successMessage}>
              You now have full access to all candidates. Redirecting...
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
            <h1 className={styles.title}>Continue Hiring Top Talent</h1>
            {companyName && (
              <p className={styles.greeting}>{companyName}</p>
            )}
            <p className={styles.subtitle}>
              Your 14-day free trial ended{expiredDate && ` on ${expiredDate}`}.
              Subscribe to keep accessing qualified candidates.
            </p>
          </div>

          <div className={styles.priceBox}>
            <div className={styles.priceAmount}>
              <span className={styles.currency}>£</span>
              <span className={styles.price}>{EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)}</span>
            </div>
            <span className={styles.priceLabel}>per month</span>
            <span className={styles.priceNote}>1 week cancellation notice</span>
          </div>

          <div className={styles.benefits}>
            <h3 className={styles.benefitsTitle}>Full access includes:</h3>
            <ul className={styles.benefitsList}>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Post unlimited job listings
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Browse all candidate profiles
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Direct messaging with candidates
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Advanced search and filters
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Track applications and shortlists
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                Priority support
              </li>
            </ul>
          </div>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubscribe}
            disabled={loading}
            className={styles.subscribeButton}
          >
            {loading ? (
              <>
                <span className={styles.spinner}></span>
                Processing...
              </>
            ) : (
              `Subscribe for £${EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)}/month`
            )}
          </button>

          <div className={styles.secureNote}>
            <span className={styles.lockIcon}>🔒</span>
            <span>Secure payment via Stripe</span>
          </div>

          <div className={styles.terms}>
            <p>
              By subscribing, you agree to our{' '}
              <Link href="/terms" className={styles.link}>Terms of Service</Link> and{' '}
              <Link href="/privacy-policy" className={styles.link}>Privacy Policy</Link>.
              You'll be charged £{EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)} monthly until you cancel.
            </p>
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
