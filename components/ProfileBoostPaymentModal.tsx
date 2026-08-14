'use client'

import { useState, useEffect } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { PROFILE_BOOST_TIERS, type BoostTier } from '@/lib/boostTypes'
import { Ico } from '@/components/icons'

// Lazy: don't fetch Stripe.js until the modal actually opens. Module-level
// `loadStripe()` would inject the script tag at import time, which is what
// the AUDIT_2026-05-03 U3 finding flagged for the candidate dashboard.
let stripePromise: Promise<Stripe | null> | null = null
function getStripePromise(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')
  }
  return stripePromise
}

// ── Payment form (has Stripe context) ──────────────────────
function BoostPaymentForm({
  tier,
  userId,
  targetId,
  onSuccess,
  onBack,
}: {
  tier: BoostTier
  userId: string
  targetId: string
  onSuccess: () => void
  onBack: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)
    setError(null)

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })

      if (stripeError) {
        setError(stripeError.message || 'Payment failed')
        setProcessing(false)
        return
      }

      if (!paymentIntent || paymentIntent.status !== 'succeeded') {
        setError('Payment did not complete. Please try again.')
        setProcessing(false)
        return
      }

      // Activate the boost
      const res = await fetch('/api/stripe/activate-boost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          boost_type: 'profile',
          duration: tier.id,
          item_id: targetId,
          user_id: userId,
        }),
      })

      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setProcessing(false)
        return
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handlePay}>
      <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
        <div style={{ fontWeight: 600, color: '#15803d' }}>Profile Boost — {tier.label}</div>
        <div style={{ fontSize: '0.875rem', color: '#166534' }}>One-time payment of £{tier.price.toFixed(2)}</div>
      </div>

      <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }} />

      {error && (
        <div style={{ color: '#dc2626', background: '#fef2f2', padding: '0.75rem 1rem', borderRadius: 8, marginTop: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button
          type="button"
          onClick={onBack}
          disabled={processing}
          style={{ flex: 1, padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500 }}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          style={{
            flex: 2, padding: '0.75rem', border: 'none', borderRadius: 8,
            background: processing ? '#94a3b8' : '#16a34a', color: '#fff',
            cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem',
          }}
        >
          {processing ? 'Processing...' : `Pay £${tier.price.toFixed(2)}`}
        </button>
      </div>
    </form>
  )
}

// ── Main modal ─────────────────────────────────────────────
interface ProfileBoostPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  userId: string
  userEmail: string
  targetId: string // candidate's user_id (they're boosting themselves)
}

export default function ProfileBoostPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  userEmail,
  targetId,
}: ProfileBoostPaymentModalProps) {
  const [selectedTier, setSelectedTier] = useState<BoostTier>(PROFILE_BOOST_TIERS[0])
  const [step, setStep] = useState<'choose' | 'pay' | 'success'>('choose')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loadingIntent, setLoadingIntent] = useState(false)
  const [intentError, setIntentError] = useState<string | null>(null)

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('choose')
      setClientSecret(null)
      setSelectedTier(PROFILE_BOOST_TIERS[0])
      setIntentError(null)
    }
  }, [isOpen])

  const handleProceedToPayment = async () => {
    setLoadingIntent(true)
    setIntentError(null)

    try {
      const res = await fetch('/api/stripe/create-boost-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boost_type: 'profile',
          duration: selectedTier.id,
          item_id: targetId,
          user_id: userId,
          email: userEmail,
        }),
      })

      const data = await res.json()
      if (data.error) {
        setIntentError(data.error)
        setLoadingIntent(false)
        return
      }

      setClientSecret(data.clientSecret)
      setStep('pay')
    } catch (err: any) {
      setIntentError(err.message || 'Failed to start payment')
    } finally {
      setLoadingIntent(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
      onClick={(e) => e.target === e.currentTarget && step !== 'pay' && onClose()}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%',
          maxHeight: '90vh', overflow: 'auto', padding: '1.5rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            {step === 'success' ? 'Boost Activated!' : 'Boost Your Profile'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>
            &times;
          </button>
        </div>

        {step === 'choose' && (
          <>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Boosted profiles appear at the top of employer searches with a Featured badge.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {PROFILE_BOOST_TIERS.map(tier => (
                <label
                  key={tier.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.875rem 1rem', borderRadius: 8, cursor: 'pointer',
                    border: selectedTier.id === tier.id ? '2px solid #16a34a' : '1px solid #e2e8f0',
                    background: selectedTier.id === tier.id ? '#f0fdf4' : '#fff',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="boostTier"
                    checked={selectedTier.id === tier.id}
                    onChange={() => setSelectedTier(tier)}
                    style={{ accentColor: '#16a34a' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{tier.label}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Featured in search results</div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>£{tier.price.toFixed(2)}</div>
                </label>
              ))}
            </div>

            {intentError && (
              <div style={{ color: '#dc2626', background: '#fef2f2', padding: '0.75rem', borderRadius: 8, fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                {intentError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={onClose}
                style={{ flex: 1, padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                onClick={handleProceedToPayment}
                disabled={loadingIntent}
                style={{
                  flex: 2, padding: '0.75rem', border: 'none', borderRadius: 8,
                  background: loadingIntent ? '#94a3b8' : '#16a34a', color: '#fff',
                  cursor: loadingIntent ? 'not-allowed' : 'pointer', fontWeight: 600,
                }}
              >
                {loadingIntent ? 'Loading...' : `Continue — £${selectedTier.price.toFixed(2)}`}
              </button>
            </div>
          </>
        )}

        {step === 'pay' && clientSecret && (
          <Elements
            stripe={getStripePromise()}
            options={{
              clientSecret,
              appearance: { theme: 'stripe', variables: { colorPrimary: '#16a34a' } },
            }}
          >
            <BoostPaymentForm
              tier={selectedTier}
              userId={userId}
              targetId={targetId}
              onSuccess={() => setStep('success')}
              onBack={() => { setStep('choose'); setClientSecret(null) }}
            />
          </Elements>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}><Ico name="rocket" size={20} /></div>
            <p style={{ fontWeight: 600, fontSize: '1.1rem', color: '#15803d', marginBottom: '0.5rem' }}>
              Your profile is now boosted!
            </p>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              You&apos;ll appear at the top of employer searches for the next {selectedTier.days} days.
            </p>
            <button
              onClick={() => { onSuccess(); onClose() }}
              style={{
                width: '100%', padding: '0.75rem', border: 'none', borderRadius: 8,
                background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
