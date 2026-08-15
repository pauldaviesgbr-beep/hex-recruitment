// Trial pricing configuration
//
// These constants describe the dormant 3-month Stripe-backed trial. The
// active launch model is free-founding-mode (12 months for first 100
// employers); see lib/constants/cohort.ts and foundingPhraseShort()
// below. Keep these untouched so the Stripe trial path still reads
// correctly if FREE_FOUNDING_MODE is ever flipped off.
export const TRIAL_DURATION_DAYS = 91 // 3-month free trial
// EMPLOYER_SUBSCRIPTION_PRICE IS DELETED, DELIBERATELY, SO THE COMPILER IS THE
// GUARD. It was 99. Paul, 15 Aug 2026: subscriptions are six to twelve months
// away and TIER-BASED, structure undecided — so a single flat price is not an
// unset value, it is the wrong shape. A comment saying "do not publish this"
// stops nobody; a missing symbol stops the build.
//
// DO NOT REINSTATE IT TO MAKE tsc HAPPY, and do not substitute 0, null, TBD or
// "£—" — a placeholder recreates the fault in a quieter form and removes the
// compile error that was the entire point. When there is a real model, add
// whatever it needs and write the copy fresh against it.
export const JOB_SEEKER_REACTIVATION_PRICE = 1.00
export const WARNING_PERIOD_DAYS = 7

// Derived month-count for marketing copy. Previously duplicated as a literal
// "3" / "3 months" / "3-month" across ~20 surfaces (homepage, waitlist,
// subscribe, terms, privacy, register, chatbot, emails) — any of which could
// have drifted if TRIAL_DURATION_DAYS ever changed. Single source of truth.
export const TRIAL_MONTHS = Math.round(TRIAL_DURATION_DAYS / 30)

// Canonical trial phrasings picked in audit Section 2. Hero/banner contexts
// use the short form ("3 months free"); body/SEO/CTA contexts use the formal
// form ("3-month free trial"). Surfaces using a variant (Title Case CTAs,
// reordered sentence structures, etc.) interpolate ${TRIAL_MONTHS} inline so
// the duration still centralises even where the phrasing doesn't.
export function trialPhraseShort(): string {
  return `${TRIAL_MONTHS} months free`
}
export function trialPhraseFormal(): string {
  return `${TRIAL_MONTHS}-month free trial`
}

// Founding-cohort phrasings. Used by the free-founding-mode surfaces
// (homepage hero, employer-free signup, waitlist) so they aren't tied to
// the Stripe-trial constants above. Single source of truth for the 12-month
// period lives in lib/constants/cohort.ts.
import { FOUNDING_PERIOD_MONTHS } from '@/lib/constants/cohort'
export function foundingPhraseShort(): string {
  return `${FOUNDING_PERIOD_MONTHS} months free`
}
export function foundingPhraseFormal(): string {
  return `${FOUNDING_PERIOD_MONTHS} months free, no card needed`
}

export type UserType = 'employer' | 'employee'
export type AccountStatus = 'trial' | 'active' | 'expired' | 'locked'

export interface TrialStatus {
  isActive: boolean
  isExpired: boolean
  expiresAt: Date | null
  daysRemaining: number
  showWarning: boolean
  userType: UserType
  accountStatus: AccountStatus
}

/**
 * Calculate trial expiry date from registration date
 */
export function calculateTrialExpiry(registrationDate: Date | string): Date {
  const date = typeof registrationDate === 'string' ? new Date(registrationDate) : registrationDate
  const expiry = new Date(date)
  expiry.setDate(expiry.getDate() + TRIAL_DURATION_DAYS)
  return expiry
}

/**
 * Calculate days remaining until expiry
 */
export function calculateDaysRemaining(expiresAt: Date | string | null): number {
  if (!expiresAt) return 0
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  const now = new Date()
  const diffTime = expiry.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

/**
 * Check if within warning period (7 days or less)
 */
export function isWithinWarningPeriod(expiresAt: Date | string | null): boolean {
  const daysRemaining = calculateDaysRemaining(expiresAt)
  return daysRemaining > 0 && daysRemaining <= WARNING_PERIOD_DAYS
}

/**
 * Check if trial has expired
 */
export function isTrialExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return false
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  return new Date() > expiry
}

/**
 * Get complete trial status for a user
 */
export function getTrialStatus(
  userType: UserType,
  expiresAt: Date | string | null,
  accountStatus?: AccountStatus
): TrialStatus {
  const daysRemaining = calculateDaysRemaining(expiresAt)
  const expired = isTrialExpired(expiresAt)
  const showWarning = isWithinWarningPeriod(expiresAt)

  // Determine account status
  let status: AccountStatus = accountStatus || 'trial'
  if (expired && status === 'trial') {
    status = 'expired'
  }

  return {
    isActive: !expired && (status === 'trial' || status === 'active'),
    isExpired: expired || status === 'expired',
    expiresAt: expiresAt ? (typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt) : null,
    daysRemaining,
    showWarning,
    userType,
    accountStatus: status,
  }
}

/**
 * Format trial countdown for display
 */
export function formatTrialCountdown(daysRemaining: number): string {
  if (daysRemaining <= 0) {
    return 'Trial expired'
  }
  if (daysRemaining === 1) {
    return '1 day remaining'
  }
  if (daysRemaining <= 7) {
    return `${daysRemaining} days remaining`
  }
  if (daysRemaining <= 14) {
    const weeks = Math.floor(daysRemaining / 7)
    return `${weeks} week${weeks > 1 ? 's' : ''} remaining`
  }
  const months = Math.floor(daysRemaining / 30)
  return `${months} month${months > 1 ? 's' : ''} remaining`
}

/**
 * Format expiry date for display
 */
export function formatExpiryDate(expiresAt: Date | string | null): string {
  if (!expiresAt) return 'N/A'
  const date = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// getPaymentRedirectUrl AND getPriceLabel ARE BOTH DELETED. Their only caller
// was components/TrialStatusBanner, which was itself imported and rendered
// NOWHERE — ungated code that was safe purely by accident of never being
// mounted. getPriceLabel produced "£99/month"; getPaymentRedirectUrl pointed
// employers at /renew-subscription, a route deleted in the same change.
//
// If a trial banner is ever wanted again it needs writing against the real
// tier model, not restoring from here.
