// Trial pricing configuration
export const TRIAL_DURATION_DAYS = 14
export const EMPLOYER_SUBSCRIPTION_PRICE = 29.99
export const JOB_SEEKER_REACTIVATION_PRICE = 1.00
export const WARNING_PERIOD_DAYS = 7

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

/**
 * Get payment redirect URL based on user type
 */
export function getPaymentRedirectUrl(userType: UserType): string {
  return userType === 'employer' ? '/renew-subscription' : '/reactivate-account'
}

/**
 * Get price label for user type
 */
export function getPriceLabel(userType: UserType): string {
  if (userType === 'employer') {
    return `£${EMPLOYER_SUBSCRIPTION_PRICE.toFixed(2)}/month`
  }
  return `£${JOB_SEEKER_REACTIVATION_PRICE.toFixed(2)} one-time`
}
