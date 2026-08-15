'use client'

import { PAID_SURFACES_ENABLED } from '@/lib/paidSurfaces'
import BillingNotLive from '@/components/BillingNotLive'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { SUBSCRIPTION_TIERS } from '@/lib/subscription-tiers'
import { TRIAL_MONTHS, trialPhraseFormal } from '@/lib/trialUtils'
import styles from './page.module.css'

interface SubscriptionData {
  subscription_status: string
  subscription_tier: string | null
  trial_ends_at: string | null
  cancel_at: string | null
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
}

// NO PLAN_PRICE. The tiers file no longer carries one — the model is tiered
// and undecided, so there is no single number to show. The two priced blocks
// below are DELETED rather than blanked: a price row with nothing in it makes
// the same claim, quietly.
const PLAN_NAME = SUBSCRIPTION_TIERS.standard.name
const PLAN_FEATURES = SUBSCRIPTION_TIERS.standard.features

// useSearchParams() requires a Suspense boundary at the page level when
// prerendering — wrap the content and export the wrapper as default.
export default function SubscriptionPage() {
  // Billing is off — see lib/paidSurfaces. Returns before any hook runs, which
  // is safe only because the flag is a compile-time constant.
  if (!PAID_SURFACES_ENABLED) return <BillingNotLive />

  return (
    <Suspense fallback={null}>
      <SubscriptionContent />
    </Suspense>
  )
}

function SubscriptionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Contextual banner: shown when /post-job redirects here for a pre-trial
  // employer (audit U5). Hidden once the user has an active subscription.
  const cameFromPostJob = searchParams?.get('from') === 'post-job'
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
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

  const handleCheckout = async () => {
    if (!userId || !userEmail) {
      router.push('/subscribe')
      return
    }

    setCheckoutLoading(true)

    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email: userEmail }),
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
      console.error('Checkout error:', err)
      alert('Something went wrong. Please try again.')
    } finally {
      setCheckoutLoading(false)
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

        {/* Contextual banner: explains why a pre-trial employer landed here
            from /post-job. Hidden once they're on an active plan. */}
        {cameFromPostJob && !isActive && (
          <div className={styles.contextBanner}>
            <p className={styles.contextBannerTitle}>Activate your account to post your first job</p>
            <p className={styles.contextBannerBody}>Pick a plan below to get started.</p>
          </div>
        )}

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
              <p>Your last payment failed. Please update your payment method to continue using Thrive.</p>
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

        {/* Active Plan Card */}
        {isActive ? (
          <div className={styles.currentPlan}>
            <div className={styles.planHeader}>
              <div>
                <h2 className={styles.planName}>{PLAN_NAME} Plan</h2>
                <span className={`${styles.statusBadge} ${isTrial ? styles.trialBadge : styles.activeBadge}`}>
                  {isTrial ? `Trial — ${trialDaysRemaining} days left` : 'Active'}
                </span>
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
                  <span className={styles.detailValue}>{formatDate(subscription?.trial_ends_at || null)}</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Next billing date</span>
                <span className={styles.detailValue}>
                  {willCancel ? 'N/A — canceling' : formatDate(subscription?.cancel_at || null)}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Plan includes</span>
                <span className={styles.detailValue}>Unlimited jobs, candidate search, pipeline, interviews, analytics</span>
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
            </div>
          </div>
        ) : (
          /* No Active Subscription — Show single pricing card */
          <div className={styles.pricingSection}>
            <h2 className={styles.pricingTitle}>
              {isCanceled ? 'Resubscribe to continue' : 'Get started'}
            </h2>
            <p className={styles.pricingSubtitle}>
              {trialPhraseFormal()}. Cancel anytime.
            </p>

            <div className={styles.pricingGrid}>
              <div className={styles.pricingCard}>
                <h3 className={styles.cardTitle}>{PLAN_NAME}</h3>
                <p className={styles.cardSubtitle}>For Employers</p>
                <ul className={styles.cardFeatures}>
                  <li><span className={styles.checkMark}>&#10003;</span> {trialPhraseFormal()}</li>
                  {PLAN_FEATURES.map((f) => (
                    <li key={f}><span className={styles.checkMark}>&#10003;</span> {f}</li>
                  ))}
                </ul>
                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className={styles.selectPlanBtn}
                >
                  {checkoutLoading ? (
                    <><span className={styles.btnSpinner} /> Processing...</>
                  ) : (
                    `Start Free ${TRIAL_MONTHS}-Month Trial`
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
