'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUserType } from '@/lib/mockAuth'
import HoneycombLogo from './HoneycombLogo'
import {
  getTrialStatus,
  calculateTrialExpiry,
  formatTrialCountdown,
  getPaymentRedirectUrl,
  getPriceLabel,
  TrialStatus,
  UserType
} from '@/lib/trialUtils'
import styles from './TrialStatusBanner.module.css'

interface TrialStatusBannerProps {
  userType?: UserType
}

export default function TrialStatusBanner({ userType: propUserType }: TrialStatusBannerProps) {
  const [status, setStatus] = useState<TrialStatus | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    if (DEV_MODE) {
      // Determine user type
      const userType = propUserType || getMockUserType()

      // Get trial expiry based on user type
      let expiresAt: string | null = null
      let accountStatus: string | undefined

      if (userType === 'employee') {
        const profile = JSON.parse(localStorage.getItem('currentTestProfile') || '{}')
        expiresAt = profile.trialExpiresAt
        accountStatus = profile.accountStatus
      } else {
        const subscription = JSON.parse(localStorage.getItem('subscription') || '{}')
        expiresAt = subscription.trialEndDate
        accountStatus = subscription.status
      }

      if (expiresAt) {
        const trialStatus = getTrialStatus(userType, expiresAt, accountStatus as any)
        setStatus(trialStatus)
      }
      return
    }

    // Production: load trial status from Supabase
    const loadTrialStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const role = session.user.user_metadata?.role
        const userType: UserType = role === 'employer' ? 'employer' : 'employee'

        if (userType === 'employer') {
          // Check employer_subscriptions for trial/subscription status
          const { data: sub } = await supabase
            .from('employer_subscriptions')
            .select('subscription_status, trial_ends_at')
            .eq('user_id', session.user.id)
            .maybeSingle()

          if (sub) {
            const accountStatus = sub.subscription_status === 'trialing' ? 'trial'
              : sub.subscription_status === 'active' ? 'active'
              : 'expired'
            const expiresAt = sub.trial_ends_at || null
            if (expiresAt) {
              setStatus(getTrialStatus(userType, expiresAt, accountStatus))
            }
          } else {
            // No subscription row — treat as trial from account creation
            const expiresAt = calculateTrialExpiry(session.user.created_at)
            setStatus(getTrialStatus(userType, expiresAt, 'trial'))
          }
        } else {
          // Employee: check candidate_profiles for trial info
          const { data: profile } = await supabase
            .from('candidate_profiles')
            .select('trial_expires_at, account_status')
            .eq('user_id', session.user.id)
            .maybeSingle()

          if (profile?.trial_expires_at) {
            const accountStatus = profile.account_status === 'active' ? 'active'
              : profile.account_status === 'expired' ? 'expired'
              : 'trial'
            setStatus(getTrialStatus(userType, profile.trial_expires_at, accountStatus))
          } else {
            // No trial info — calculate from account creation
            const expiresAt = calculateTrialExpiry(session.user.created_at)
            setStatus(getTrialStatus(userType, expiresAt, 'trial'))
          }
        }
      } catch (err) {
        console.error('Error loading trial status:', err)
      }
    }

    loadTrialStatus()
  }, [propUserType])

  // Don't render on server or if no trial status
  if (!mounted || !status) return null

  // Don't show banner if account is active (paid)
  if (status.accountStatus === 'active') return null

  const redirectUrl = getPaymentRedirectUrl(status.userType)
  const priceLabel = getPriceLabel(status.userType)

  // Expired state
  if (status.isExpired) {
    return (
      <div className={`${styles.banner} ${styles.expired}`}>
        <div className={styles.content}>
          <span className={styles.icon}>⚠️</span>
          <div className={styles.textContent}>
            <span className={styles.title}>Your trial has expired</span>
            <span className={styles.message}>
              {status.userType === 'employer'
                ? 'Subscribe to continue posting jobs and viewing candidates.'
                : 'Reactivate your account to continue applying for jobs.'}
            </span>
          </div>
        </div>
        <Link href={redirectUrl} className={styles.ctaButton}>
          {status.userType === 'employer' ? 'Subscribe Now' : `Reactivate (${priceLabel})`}
        </Link>
      </div>
    )
  }

  // Warning state (7 days or less)
  if (status.showWarning) {
    return (
      <div className={`${styles.banner} ${styles.warning}`}>
        <div className={styles.content}>
          <span className={styles.icon}>⏰</span>
          <div className={styles.textContent}>
            <span className={styles.title}>
              Trial ending soon: {formatTrialCountdown(status.daysRemaining)}
            </span>
            <span className={styles.message}>
              {status.userType === 'employer'
                ? 'Subscribe now to avoid losing access to candidates.'
                : 'Pay now to keep your account active.'}
            </span>
          </div>
        </div>
        <Link href={redirectUrl} className={styles.ctaButton}>
          {status.userType === 'employer' ? `Subscribe (${priceLabel})` : `Pay ${priceLabel}`}
        </Link>
      </div>
    )
  }

  // Active trial state (more than 7 days remaining)
  return (
    <div className={`${styles.banner} ${styles.active}`}>
      <div className={styles.content}>
        <HoneycombLogo size={18} color="currentColor" />
        <span className={styles.title}>
          Free trial: {formatTrialCountdown(status.daysRemaining)}
        </span>
      </div>
    </div>
  )
}
