import { supabase } from './supabase'
import { DEV_MODE, getMockUser, getSubscriptionStatus } from './mockAuth'

export type SubscriptionTier = 'standard' | 'professional' | null
export type SubscriptionStatus = 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'

export interface UserSubscription {
  status: SubscriptionStatus
  tier: SubscriptionTier
  isActive: boolean
  isTrial: boolean
  trialEndsAt: Date | null
  cancelAt: Date | null
  cancelAtPeriodEnd: boolean
}

/**
 * Feature gating configuration
 * Defines which features require which subscription level
 */
const GATED_FEATURES = {
  // Any active subscription (standard or professional)
  any: [
    'post_job',
    'view_candidate_contact',
    'view_candidate_cv',
    'download_cv',
    'send_message',
  ],
  // Professional tier only
  professional: [
    'analytics_dashboard',
    'demographics_data',
    'benchmarking',
    'priority_candidate_access',
    'unlimited_jobs',
  ],
} as const

type AnyFeature = (typeof GATED_FEATURES.any)[number]
type ProFeature = (typeof GATED_FEATURES.professional)[number]
type GatedFeature = AnyFeature | ProFeature

/**
 * Fetch the current user's subscription from the database
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  // Dev mode fallback
  if (DEV_MODE) {
    const status = getSubscriptionStatus()
    return {
      status: status === 'trial' ? 'trialing' : status === 'active' ? 'active' : 'inactive',
      tier: 'professional', // Dev mode gets full access
      isActive: status === 'trial' || status === 'active',
      isTrial: status === 'trial',
      trialEndsAt: null,
      cancelAt: null,
      cancelAtPeriodEnd: false,
    }
  }

  const { data, error } = await supabase
    .from('employer_subscriptions')
    .select('subscription_status, subscription_tier, trial_ends_at, cancel_at, cancel_at_period_end')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return {
      status: 'inactive',
      tier: null,
      isActive: false,
      isTrial: false,
      trialEndsAt: null,
      cancelAt: null,
      cancelAtPeriodEnd: false,
    }
  }

  const status = data.subscription_status as SubscriptionStatus
  const isActive = status === 'active' || status === 'trialing'

  return {
    status,
    tier: data.subscription_tier as SubscriptionTier,
    isActive,
    isTrial: status === 'trialing',
    trialEndsAt: data.trial_ends_at ? new Date(data.trial_ends_at) : null,
    cancelAt: data.cancel_at ? new Date(data.cancel_at) : null,
    cancelAtPeriodEnd: data.cancel_at_period_end || false,
  }
}

/**
 * Check if the user has access to a specific feature
 */
export function hasFeatureAccess(
  subscription: UserSubscription,
  feature: GatedFeature
): boolean {
  if (!subscription.isActive) return false

  // Check if it's a "professional only" feature
  if ((GATED_FEATURES.professional as readonly string[]).includes(feature)) {
    return subscription.tier === 'professional'
  }

  // Check if it's an "any subscription" feature
  if ((GATED_FEATURES.any as readonly string[]).includes(feature)) {
    return true // Any active subscription
  }

  return false
}

/**
 * Get the maximum number of active jobs allowed for the subscription tier
 */
export function getMaxActiveJobs(tier: SubscriptionTier): number {
  if (tier === 'professional') return Infinity
  if (tier === 'standard') return 3
  return 0
}

/**
 * Features allowed without any subscription (free access)
 * - Browse candidate profiles (limited view — no contact/CV)
 * - See applications list
 * - View own dashboard
 */
export function isFreeFeature(feature: string): boolean {
  const freeFeatures = [
    'browse_candidates',
    'view_applications',
    'view_dashboard',
    'view_job_listings',
  ]
  return freeFeatures.includes(feature)
}
