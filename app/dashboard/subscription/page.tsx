'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { SUBSCRIPTION_TIERS } from '@/lib/subscription-tiers'
import styles from './page.module.css'

interface SubscriptionData {
  subscription_status: string
  subscription_tier: string | null
  trial_ends_at: string | null
  cancel_at: string | null
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
}

export default function SubscriptionPage() {
  const router = useRouter()
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    async function loadSubscription() {
      try {
        let currentUserId: string | null = null
        let currentEmail: string | null = null

        if (DEV_MODE) {
          const mockUser = getMockUser()
          currentUserId = mockUser?.id || null
          currentEmail = mockUser?.email || null
        } else {
          const { data: { session } } = await supabase.auth.getSession()
          currentUserId = session?.user?.id || null
          currentEmail = session?.user?.email || null
        }

        setUserId(currentUserId)
        setUserEmail(currentEmail)

        if (currentUserId) {
          const { data, error } = await supabase
            .from('employer_subscriptions')
            .select('subscription_status, subscription_tier, trial_ends_at, cancel_at, cancel_at_period_end, stripe_customer_id')
            .eq('user_id', currentUserId)
            .single()

          if (!error && data) {
            setSubscription(data)
          }
        }
      } catch (err) {
        console.error('Error loading subscription:', err)
      } finally {
        setLoading(false)
      }
    }

    loadSubscription()
  }, [])

  const handleCheckout = async (tier: 'standard' | 'professional') => {
    if (!userId || !userEmail) {
      router.push('/subscribe')
      return
    }

    setCheckoutLoading(tier)

    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, userId, email: userEmail }),
      })

      const data = await res.json()

      if (data.error) {
        alert(data.error)
        return
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Checkout error:', err)
      alert('Something went wrong. Please try again.')
    } finally {
      setCheckoutLoading(null)
    }
  }

  const handleManageBilling = async () => {
    if (!userId) return

    setPortalLoading(true)

    try {
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      const data = await res.json()

      if (data.error) {
        alert(data.error)
        return
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Portal error:', err)
      alert('Something went wrong. Please try again.')
    } finally {
      setPortalLoading(false)
    }
  }

  const isActive = subscription?.subscription_status === 'active' || subscription?.subscription_status === 'trialing'
  const isTrial = subscription?.subscription_status === 'trialing'
  const isCanceled = subscription?.subscription_status === 'canceled'
  const isPastDue = subscription?.subscription_status === 'past_due'
  const willCancel = subscription?.cancel_at_period_end

  const trialDaysRemaining = subscription?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading subscription details...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />

      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Subscription</h1>
          <p className={styles.subtitle}>Manage your plan and billing</p>
        </div>

        {/* Trial Warning Banner */}
        {isTrial && trialDaysRemaining <= 7 && (
          <div className={styles.warningBanner}>
            <span className={styles.warningIcon}>&#9888;</span>
            <div>
              <strong>Trial ending soon!</strong>
              <p>Your free trial ends in {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} ({formatDate(subscription?.trial_ends_at || null)}). Your card will be charged automatically.</p>
            </div>
          </div>
        )}

        {/* Past Due Banner */}
        {isPastDue && (
          <div className={styles.errorBanner}>
            <span className={styles.warningIcon}>&#9888;</span>
            <div>
              <strong>Payment failed</strong>
              <p>Your last payment failed. Please update your payment method to continue using Hex.</p>
              <button onClick={handleManageBilling} className={styles.bannerBtn}>
                Update Payment Method
              </button>
            </div>
          </div>
        )}

        {/* Cancellation Notice */}
        {willCancel && isActive && (
          <div className={styles.infoBanner}>
            <span className={styles.infoIcon}>&#8505;</span>
            <div>
              <strong>Subscription ending</strong>
              <p>Your subscription will end on {formatDate(subscription?.cancel_at || null)}. You can resubscribe at any time.</p>
            </div>
          </div>
        )}

        {/* Current Plan Card */}
        {isActive && subscription?.subscription_tier ? (
          <div className={styles.currentPlan}>
            <div className={styles.planHeader}>
              <div>
                <h2 className={styles.planName}>
                  {SUBSCRIPTION_TIERS[subscription.subscription_tier as keyof typeof SUBSCRIPTION_TIERS]?.name || subscription.subscription_tier} Plan
                </h2>
                <span className={`${styles.statusBadge} ${isTrial ? styles.trialBadge : styles.activeBadge}`}>
                  {isTrial ? `Trial — ${trialDaysRemaining} days left` : 'Active'}
                </span>
              </div>
              <div className={styles.planPrice}>
                <span className={styles.priceAmount}>
                  £{SUBSCRIPTION_TIERS[subscription.subscription_tier as keyof typeof SUBSCRIPTION_TIERS]?.price.toFixed(2) || '0.00'}
                </span>
                <span className={styles.pricePeriod}>/month</span>
              </div>
            </div>

            <div className={styles.planDetails}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Status</span>
                <span className={styles.detailValue}>{isTrial ? 'Free Trial' : 'Active Subscription'}</span>
              </div>
              {isTrial && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Trial ends</span>
                  <span className={styles.detailValue}>{formatDate(subscription.trial_ends_at)}</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Next billing date</span>
                <span className={styles.detailValue}>
                  {willCancel ? 'N/A — canceling' : formatDate(subscription.cancel_at)}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Plan features</span>
                <span className={styles.detailValue}>
                  {subscription.subscription_tier === 'professional'
                    ? 'Unlimited jobs, analytics, priority access'
                    : 'Up to 3 active jobs'}
                </span>
              </div>
            </div>

            <div className={styles.planActions}>
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className={styles.manageBtn}
              >
                {portalLoading ? 'Loading...' : 'Manage Billing'}
              </button>
              {subscription.subscription_tier === 'standard' && (
                <button
                  onClick={() => handleCheckout('professional')}
                  disabled={!!checkoutLoading}
                  className={styles.upgradeBtn}
                >
                  {checkoutLoading === 'professional' ? 'Loading...' : 'Upgrade to Professional'}
                </button>
              )}
            </div>
          </div>
        ) : (
          /* No Active Subscription — Show Pricing Cards */
          <div className={styles.pricingSection}>
            <h2 className={styles.pricingTitle}>
              {isCanceled ? 'Resubscribe to a Plan' : 'Choose Your Plan'}
            </h2>
            <p className={styles.pricingSubtitle}>
              Both plans include a 14-day free trial. No card required upfront.
            </p>

            <div className={styles.pricingGrid}>
              {/* Standard Card */}
              <div className={styles.pricingCard}>
                <h3 className={styles.cardTitle}>Standard</h3>
                <p className={styles.cardSubtitle}>For Employers</p>
                <div className={styles.cardPrice}>
                  <span className={styles.cardPriceAmount}>£29.99</span>
                  <span className={styles.cardPricePeriod}>/month</span>
                </div>
                <ul className={styles.cardFeatures}>
                  <li><span className={styles.checkMark}>&#10003;</span> 14-day free trial</li>
                  <li><span className={styles.checkMark}>&#10003;</span> Up to 3 active job listings</li>
                  <li><span className={styles.checkMark}>&#10003;</span> Browse and contact candidates</li>
                  <li><span className={styles.checkMark}>&#10003;</span> Application management</li>
                  <li><span className={styles.checkMark}>&#10003;</span> 1 week cancellation notice</li>
                </ul>
                <button
                  onClick={() => handleCheckout('standard')}
                  disabled={!!checkoutLoading}
                  className={styles.selectPlanBtn}
                >
                  {checkoutLoading === 'standard' ? (
                    <><span className={styles.btnSpinner} /> Processing...</>
                  ) : (
                    'Start Free 14-Day Trial'
                  )}
                </button>
              </div>

              {/* Professional Card */}
              <div className={`${styles.pricingCard} ${styles.pricingCardPro}`}>
                <div className={styles.popularBadge}>Most Popular</div>
                <h3 className={styles.cardTitle}>Professional</h3>
                <p className={styles.cardSubtitle}>For Growing Teams</p>
                <div className={styles.cardPrice}>
                  <span className={styles.cardPriceAmount}>£59.99</span>
                  <span className={styles.cardPricePeriod}>/month</span>
                </div>
                <ul className={styles.cardFeatures}>
                  <li><span className={styles.checkMark}>&#10003;</span> 14-day free trial</li>
                  <li><span className={styles.checkMark}>&#10003;</span> Unlimited job listings</li>
                  <li><span className={styles.checkMark}>&#10003;</span> Priority candidate access</li>
                  <li><span className={styles.checkMark}>&#10003;</span> Advanced analytics dashboard</li>
                  <li><span className={styles.checkMark}>&#10003;</span> Dedicated account support</li>
                </ul>
                <button
                  onClick={() => handleCheckout('professional')}
                  disabled={!!checkoutLoading}
                  className={styles.selectPlanBtnPro}
                >
                  {checkoutLoading === 'professional' ? (
                    <><span className={styles.btnSpinner} /> Processing...</>
                  ) : (
                    'Start Free 14-Day Trial'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Back Link */}
        <div className={styles.backLink}>
          <Link href="/dashboard">&#8592; Back to Dashboard</Link>
        </div>
      </div>
    </main>
  )
}
