'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUserType, getSubscriptionStatus, getTrialExpiryDate } from '@/lib/mockAuth'
import {
  EMPLOYER_SUBSCRIPTION_PRICE,
  TRIAL_DURATION_DAYS,
  calculateDaysRemaining,
  calculateTrialExpiry,
  formatExpiryDate,
  formatTrialCountdown,
} from '@/lib/trialUtils'
import styles from './page.module.css'

interface SubscriptionData {
  status: 'trial' | 'active' | 'expired' | 'cancelling'
  plan: string
  trialStartDate: string | null
  trialEndDate: string | null
  nextBillingDate: string | null
  cancelledAt: string | null
  accessEndsAt: string | null
  cardLast4: string | null
  cardBrand: string | null
  cardExpiry: string | null
}

interface Invoice {
  id: string
  date: string
  amount: string
  status: 'paid' | 'pending' | 'failed'
  downloadUrl: string
}

const NOTICE_PERIOD_DAYS = 7

function getAccessEndDate(): Date {
  const date = new Date()
  date.setDate(date.getDate() + NOTICE_PERIOD_DAYS)
  return date
}

export default function SubscriptionSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type || type !== 'employer') {
          router.push('/login')
          return
        }

        // Load subscription data from localStorage
        const subStatus = getSubscriptionStatus()
        const trialEnd = getTrialExpiryDate()
        const storedSub = JSON.parse(localStorage.getItem('subscription') || '{}')

        const subData: SubscriptionData = {
          status: storedSub.cancelledAt ? 'cancelling' : (subStatus as SubscriptionData['status']),
          plan: storedSub.plan || 'monthly',
          trialStartDate: storedSub.trialStartDate || new Date().toISOString(),
          trialEndDate: trialEnd?.toISOString() || storedSub.trialEndDate || null,
          nextBillingDate: storedSub.nextBillingDate || trialEnd?.toISOString() || null,
          cancelledAt: storedSub.cancelledAt || null,
          accessEndsAt: storedSub.accessEndsAt || null,
          cardLast4: storedSub.cardLast4 || '4242',
          cardBrand: storedSub.cardBrand || 'visa',
          cardExpiry: storedSub.cardExpiry || '12/27',
        }

        setSubscription(subData)

        // Mock invoices for active subscriptions
        if (subStatus === 'active') {
          const now = new Date()
          const mockInvoices: Invoice[] = []
          for (let i = 0; i < 3; i++) {
            const invoiceDate = new Date(now)
            invoiceDate.setMonth(invoiceDate.getMonth() - i)
            mockInvoices.push({
              id: `INV-${String(now.getFullYear()).slice(2)}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${1000 + i}`,
              date: invoiceDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
              amount: `£${EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)}`,
              status: 'paid',
              downloadUrl: '#',
            })
          }
          setInvoices(mockInvoices)
        }

        setLoading(false)
        return
      }

      // Production: Supabase session check
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const role = session.user.user_metadata?.role
      if (role !== 'employer') {
        router.push('/login')
        return
      }

      // Fetch subscription from database
      try {
        const { data: sub } = await supabase
          .from('employer_subscriptions')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (sub) {
          const dbStatus = sub.subscription_status
          let status: SubscriptionData['status'] = 'trial'
          if (sub.cancel_at) status = 'cancelling'
          else if (dbStatus === 'active') status = 'active'
          else if (dbStatus === 'trialing') status = 'trial'
          else if (dbStatus === 'canceled' || dbStatus === 'unpaid' || dbStatus === 'past_due') status = 'expired'

          setSubscription({
            status,
            plan: sub.plan_interval || 'monthly',
            trialStartDate: sub.created_at || session.user.created_at,
            trialEndDate: sub.trial_ends_at || null,
            nextBillingDate: sub.current_period_end || sub.trial_ends_at || null,
            cancelledAt: sub.cancelled_at || null,
            accessEndsAt: sub.cancel_at || null,
            cardLast4: sub.card_last4 || null,
            cardBrand: sub.card_brand || null,
            cardExpiry: sub.card_expiry || null,
          })

          // Fetch invoices
          if (dbStatus === 'active') {
            try {
              const { data: invoiceData } = await supabase
                .from('invoices')
                .select('id, created_at, amount, status, invoice_url')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false })
                .limit(10)

              if (invoiceData && invoiceData.length > 0) {
                setInvoices(invoiceData.map((inv: any) => ({
                  id: inv.id,
                  date: new Date(inv.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                  amount: `£${(inv.amount / 100).toFixed(2)}`,
                  status: inv.status || 'paid',
                  downloadUrl: inv.invoice_url || '#',
                })))
              }
            } catch {
              // Invoices table may not exist yet
            }
          }
        } else {
          // No subscription row — default to trial from account creation
          const trialEnd = calculateTrialExpiry(session.user.created_at)
          setSubscription({
            status: 'trial',
            plan: 'monthly',
            trialStartDate: session.user.created_at || new Date().toISOString(),
            trialEndDate: trialEnd.toISOString(),
            nextBillingDate: trialEnd.toISOString(),
            cancelledAt: null,
            accessEndsAt: null,
            cardLast4: null,
            cardBrand: null,
            cardExpiry: null,
          })
        }
      } catch (err) {
        console.error('Error loading subscription:', err)
        // Fallback to trial
        const trialEnd = calculateTrialExpiry(session.user.created_at)
        setSubscription({
          status: 'trial',
          plan: 'monthly',
          trialStartDate: session.user.created_at || new Date().toISOString(),
          trialEndDate: trialEnd.toISOString(),
          nextBillingDate: trialEnd.toISOString(),
          cancelledAt: null,
          accessEndsAt: null,
          cardLast4: null,
          cardBrand: null,
          cardExpiry: null,
        })
      }

      setLoading(false)
    }

    checkAuth()
  }, [router])

  const handleCancelSubscription = async () => {
    const accessEnd = getAccessEndDate()

    if (DEV_MODE && subscription) {
      const storedSub = JSON.parse(localStorage.getItem('subscription') || '{}')
      storedSub.cancelledAt = new Date().toISOString()
      storedSub.accessEndsAt = accessEnd.toISOString()
      localStorage.setItem('subscription', JSON.stringify(storedSub))

      setSubscription({
        ...subscription,
        status: 'cancelling',
        cancelledAt: new Date().toISOString(),
        accessEndsAt: accessEnd.toISOString(),
      })
    } else if (subscription) {
      // Production: update Supabase
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const { error } = await supabase
            .from('employer_subscriptions')
            .update({
              cancel_at: accessEnd.toISOString(),
              cancelled_at: new Date().toISOString(),
              cancel_at_period_end: true,
            })
            .eq('user_id', session.user.id)

          if (error) throw error

          setSubscription({
            ...subscription,
            status: 'cancelling',
            cancelledAt: new Date().toISOString(),
            accessEndsAt: accessEnd.toISOString(),
          })
        }
      } catch (err: any) {
        setShowCancelModal(false)
        setMessage({ type: 'error', text: err.message || 'Failed to cancel subscription' })
        return
      }
    }

    setShowCancelModal(false)
    setMessage({
      type: 'success',
      text: `Your subscription has been cancelled. You will retain full access until ${formatExpiryDate(accessEnd)}.`,
    })
  }

  const handleResubscribe = async () => {
    if (!subscription) return

    if (DEV_MODE) {
      const storedSub = JSON.parse(localStorage.getItem('subscription') || '{}')
      delete storedSub.cancelledAt
      delete storedSub.accessEndsAt
      localStorage.setItem('subscription', JSON.stringify(storedSub))

      setSubscription({
        ...subscription,
        status: subscription.trialEndDate && new Date() < new Date(subscription.trialEndDate) ? 'trial' : 'active',
        cancelledAt: null,
        accessEndsAt: null,
      })

      setMessage({ type: 'success', text: 'Your subscription has been reactivated.' })
    } else {
      // Production: remove cancellation from Supabase
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const { error } = await supabase
            .from('employer_subscriptions')
            .update({
              cancel_at: null,
              cancelled_at: null,
              cancel_at_period_end: false,
            })
            .eq('user_id', session.user.id)

          if (error) throw error

          setSubscription({
            ...subscription,
            status: subscription.trialEndDate && new Date() < new Date(subscription.trialEndDate) ? 'trial' : 'active',
            cancelledAt: null,
            accessEndsAt: null,
          })

          setMessage({ type: 'success', text: 'Your subscription has been reactivated.' })
        }
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message || 'Failed to reactivate subscription' })
      }
    }
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p className={styles.loading}>Loading subscription details...</p>
        </div>
      </main>
    )
  }

  const isTrial = subscription?.status === 'trial'
  const isActive = subscription?.status === 'active'
  const isExpired = subscription?.status === 'expired'
  const isCancelling = subscription?.status === 'cancelling'

  // Trial progress calculations
  const totalTrialDays = TRIAL_DURATION_DAYS
  const daysRemaining = subscription?.trialEndDate ? calculateDaysRemaining(subscription.trialEndDate) : totalTrialDays
  const daysUsed = totalTrialDays - daysRemaining
  const progressPercent = Math.min(100, Math.max(0, (daysUsed / totalTrialDays) * 100))

  // Access end date for cancellation notice
  const accessEndDate = getAccessEndDate()
  const formattedAccessEnd = accessEndDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <Link href="/settings" className={styles.backLink}>
          <span className={styles.backArrow}>←</span>
          Back to Settings
        </Link>

        <div className={styles.header}>
          <div className={styles.headerIcon}>💳</div>
          <div>
            <h1 className={styles.title}>Subscription & Billing</h1>
            <p className={styles.subtitle}>Manage your plan, payment method, and billing history</p>
          </div>
        </div>

        {message && (
          <div className={`${styles.message} ${message.type === 'success' ? styles.messageSuccess : styles.messageError}`}>
            {message.text}
          </div>
        )}

        {/* Notice Period Banner */}
        {isCancelling && subscription.accessEndsAt && (
          <div className={styles.noticeBanner}>
            <span className={styles.noticeBannerIcon}>⚠️</span>
            <p className={styles.noticeBannerText}>
              Your subscription has been cancelled. You have <strong>full access until {formatExpiryDate(subscription.accessEndsAt)}</strong> (14-day notice period).
              After this date, you will lose access to posting jobs, browsing candidates, and messaging.
              <br />
              Changed your mind? Click &quot;Resubscribe&quot; below to keep your subscription active.
            </p>
          </div>
        )}

        {/* Plan Status Card — always shown */}
        {subscription && (
          <div className={styles.planCard}>
            <div className={styles.planHeader}>
              <div className={styles.planInfo}>
                <h2 className={styles.planName}>
                  {isExpired ? 'Expired' : isTrial ? 'Free Trial' : 'Monthly Plan'}
                </h2>
                <p className={styles.planPrice}>
                  {isExpired
                    ? 'Your trial has ended'
                    : isTrial
                    ? `£${EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)}/month after trial`
                    : `£${EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)}/month`
                  }
                </p>
              </div>
              <span className={`${styles.planBadge} ${
                isExpired ? styles.badgeExpired :
                isCancelling ? styles.badgeCancelling :
                isTrial ? styles.badgeTrial :
                styles.badgeActive
              }`}>
                {isExpired ? 'Expired' : isCancelling ? 'Cancelling' : isTrial ? 'Free Trial' : 'Active'}
              </span>
            </div>

            <div className={styles.planBody}>
              <div className={styles.planDetails}>
                {isTrial && subscription.trialEndDate && (
                  <div className={styles.planDetail}>
                    <span className={styles.detailLabel}>Trial Ends</span>
                    <span className={styles.detailValue}>{formatExpiryDate(subscription.trialEndDate)}</span>
                  </div>
                )}
                {isTrial && (
                  <div className={styles.planDetail}>
                    <span className={styles.detailLabel}>Days Remaining</span>
                    <span className={styles.detailValue}>{formatTrialCountdown(daysRemaining)}</span>
                  </div>
                )}
                {isTrial && (
                  <div className={styles.planDetail}>
                    <span className={styles.detailLabel}>First Billing Date</span>
                    <span className={styles.detailValue}>{subscription.trialEndDate ? formatExpiryDate(subscription.trialEndDate) : 'N/A'}</span>
                  </div>
                )}
                {isTrial && (
                  <div className={styles.planDetail}>
                    <span className={styles.detailLabel}>Amount After Trial</span>
                    <span className={styles.detailValue}>£{EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)}/month</span>
                  </div>
                )}
                {(isActive || isCancelling) && subscription.nextBillingDate && (
                  <div className={styles.planDetail}>
                    <span className={styles.detailLabel}>{isCancelling ? 'Final Billing Date' : 'Next Billing Date'}</span>
                    <span className={styles.detailValue}>{formatExpiryDate(subscription.nextBillingDate)}</span>
                  </div>
                )}
                {isActive && (
                  <div className={styles.planDetail}>
                    <span className={styles.detailLabel}>Monthly Amount</span>
                    <span className={styles.detailValue}>£{EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)} inc. VAT</span>
                  </div>
                )}
                {isCancelling && subscription.accessEndsAt && (
                  <div className={styles.planDetail}>
                    <span className={styles.detailLabel}>Access Ends</span>
                    <span className={styles.detailValue}>{formatExpiryDate(subscription.accessEndsAt)}</span>
                  </div>
                )}
                {isExpired && subscription.trialEndDate && (
                  <div className={styles.planDetail}>
                    <span className={styles.detailLabel}>Trial Ended</span>
                    <span className={styles.detailValue}>{formatExpiryDate(subscription.trialEndDate)}</span>
                  </div>
                )}
                {isExpired && (
                  <div className={styles.planDetail}>
                    <span className={styles.detailLabel}>Subscription Price</span>
                    <span className={styles.detailValue}>£{EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)}/month</span>
                  </div>
                )}
              </div>

              {/* Trial Progress Bar */}
              {isTrial && (
                <div className={styles.trialProgress}>
                  <div className={styles.trialProgressLabel}>
                    <span className={styles.trialProgressText}>Trial progress</span>
                    <span className={`${styles.trialProgressDays} ${
                      daysRemaining <= 7 ? styles.trialProgressDaysWarning :
                      daysRemaining <= 0 ? styles.trialProgressDaysExpired : ''
                    }`}>
                      {daysRemaining} of {totalTrialDays} days remaining
                    </span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={`${styles.progressFill} ${
                        daysRemaining <= 0 ? styles.progressFillRed :
                        daysRemaining <= 7 ? styles.progressFillYellow :
                        styles.progressFillGreen
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className={styles.planActions}>
                {(isTrial || isActive) && (
                  <>
                    <Link href="/settings/subscription/payment" className={styles.updatePaymentBtn}>
                      Update Payment Method
                    </Link>
                    <button className={styles.cancelSubBtn} onClick={() => setShowCancelModal(true)}>
                      Cancel Subscription
                    </button>
                  </>
                )}
                {isCancelling && (
                  <button className={styles.resubscribeBtn} onClick={handleResubscribe}>
                    Resubscribe
                  </button>
                )}
                {isExpired && (
                  <Link href="/renew-subscription" className={styles.resubscribeBtn}>
                    Resubscribe — £{EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)}/month
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Payment Method */}
        {subscription && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Payment Method</h2>
            {subscription.cardLast4 ? (
              <div className={styles.paymentMethod}>
                <div className={styles.cardBrand}>
                  {subscription.cardBrand === 'visa' && (
                    <svg viewBox="0 0 48 32" width="48" height="32">
                      <rect fill="#1A1F71" width="48" height="32" rx="4"/>
                      <text x="24" y="20" textAnchor="middle" fill="#FFF" fontSize="12" fontWeight="bold" fontFamily="Arial">VISA</text>
                    </svg>
                  )}
                  {subscription.cardBrand === 'mastercard' && (
                    <svg viewBox="0 0 48 32" width="48" height="32">
                      <rect fill="#000" width="48" height="32" rx="4"/>
                      <circle cx="18" cy="16" r="9" fill="#EB001B"/>
                      <circle cx="30" cy="16" r="9" fill="#F79E1B"/>
                    </svg>
                  )}
                  {subscription.cardBrand === 'amex' && (
                    <svg viewBox="0 0 48 32" width="48" height="32">
                      <rect fill="#006FCF" width="48" height="32" rx="4"/>
                      <text x="24" y="20" textAnchor="middle" fill="#FFF" fontSize="8" fontWeight="bold" fontFamily="Arial">AMEX</text>
                    </svg>
                  )}
                </div>
                <div className={styles.cardDetails}>
                  <span className={styles.cardNumber}>•••• •••• •••• {subscription.cardLast4}</span>
                  <span className={styles.cardExpiry}>Expires {subscription.cardExpiry}</span>
                </div>
              </div>
            ) : (
              <p className={styles.noPayment}>No payment method on file</p>
            )}
          </div>
        )}

        {/* Billing History */}
        {subscription && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Billing History</h2>
            {invoices.length > 0 ? (
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(invoice => (
                    <tr key={invoice.id}>
                      <td>{invoice.date}</td>
                      <td>{invoice.amount}</td>
                      <td>
                        <span className={`${styles.invoiceStatus} ${
                          invoice.status === 'paid' ? styles.statusPaid :
                          invoice.status === 'pending' ? styles.statusPending :
                          styles.statusFailed
                        }`}>
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </span>
                      </td>
                      <td>
                        <button
                          className={styles.downloadLink}
                          onClick={() => setMessage({ type: 'success', text: `Invoice ${invoice.id} download is not available in the demo.` })}
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={styles.emptyHistory}>
                {isTrial
                  ? `No billing history yet. Your first invoice will appear after your trial ends${subscription.trialEndDate ? ` on ${formatExpiryDate(subscription.trialEndDate)}` : ''}.`
                  : 'No billing history available.'
                }
              </p>
            )}
          </div>
        )}
      </div>

      {/* Cancellation Confirmation Modal */}
      {showCancelModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCancelModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalIcon}>⚠️</div>
              <h3 className={styles.modalTitle}>Cancel Subscription</h3>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.modalText}>
                Are you sure you want to cancel your Hex subscription?
              </p>

              <div className={styles.modalWarning}>
                <p className={styles.modalWarningTitle}>7-Day Notice Period</p>
                <p className={styles.modalWarningText}>
                  Cancellation requires 7 days&apos; (1 week&apos;s) notice. If you cancel today, your access will continue until the end of the notice period. During this time, you will retain full access to all employer features.
                </p>
              </div>

              <div className={styles.modalAccessEnd}>
                <p className={styles.modalAccessEndLabel}>Your access will end on</p>
                <p className={styles.modalAccessEndDate}>{formattedAccessEnd}</p>
              </div>

              <p className={styles.modalText}>After the notice period ends, you will lose access to:</p>
              <ul className={styles.modalLoseAccess}>
                <li><span className={styles.loseIcon}>✕</span> Posting job vacancies</li>
                <li><span className={styles.loseIcon}>✕</span> Browsing candidate profiles</li>
                <li><span className={styles.loseIcon}>✕</span> Messaging candidates</li>
                <li><span className={styles.loseIcon}>✕</span> Featured job listings</li>
              </ul>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.modalKeepBtn} onClick={() => setShowCancelModal(false)}>
                Keep Subscription
              </button>
              <button className={styles.modalCancelBtn} onClick={handleCancelSubscription}>
                Cancel Subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
