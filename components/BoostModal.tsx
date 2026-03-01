'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BoostTier } from '@/lib/boostTypes'
import styles from './BoostModal.module.css'

interface BoostModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  boostType: 'job' | 'profile'
  targetId: string
  targetLabel: string
  tiers: BoostTier[]
}

export default function BoostModal({
  isOpen,
  onClose,
  onSuccess,
  boostType,
  targetId,
  targetLabel,
  tiers,
}: BoostModalProps) {
  const [selectedTier, setSelectedTier] = useState<BoostTier['id']>('7_days')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setSelectedTier('7_days')
      setError('')
      setSubmitting(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const tier = tiers.find(t => t.id === selectedTier)!

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in to boost.')
        setSubmitting(false)
        return
      }

      const res = await fetch('/api/stripe/create-boost-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boost_type: boostType,
          duration: tier.days,
          item_id: targetId,
          user_id: session.user.id,
          email: session.user.email,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create checkout session.')
        setSubmitting(false)
        return
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            ⚡ Boost {boostType === 'job' ? 'Job' : 'Profile'}
          </h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div className={styles.body}>
          <p className={styles.targetLabel}>
            Boosting: <strong>{targetLabel}</strong>
          </p>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.tierList}>
            {tiers.map(t => (
              <label
                key={t.id}
                className={`${styles.tierCard} ${selectedTier === t.id ? styles.tierCardSelected : ''}`}
                onClick={() => setSelectedTier(t.id)}
              >
                <input
                  type="radio"
                  name="boost-tier"
                  value={t.id}
                  checked={selectedTier === t.id}
                  onChange={() => setSelectedTier(t.id)}
                  className={styles.tierRadio}
                />
                <div className={styles.tierLeft}>
                  <span className={styles.tierDuration}>{t.label}</span>
                  <span className={styles.tierDesc}>
                    {boostType === 'job'
                      ? 'Appear first in search results with Featured badge'
                      : 'Stand out to employers with Featured badge'}
                  </span>
                </div>
                <div className={styles.tierRight}>
                  <span className={styles.tierPrice}>£{t.price.toFixed(2)}</span>
                  {t.id === '30_days' && (
                    <span className={styles.tierBestValue}>Best Value</span>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className={styles.actions}>
            <button
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Redirecting to payment...' : `Pay & Boost — £${tier.price.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
