// Client-safe subscription tier config (no server secrets)
export const SUBSCRIPTION_TIERS = {
  standard: {
    name: 'Standard',
    price: 29.99,
    trialDays: 14,
    maxActiveJobs: 3,
    features: [
      'Up to 3 active job listings',
      'Browse and contact candidates',
      'Manage applications in dashboard',
      '1 week cancellation notice',
    ],
  },
  professional: {
    name: 'Professional',
    price: 59.99,
    trialDays: 14,
    maxActiveJobs: Infinity,
    features: [
      'Unlimited job listings',
      'Priority candidate access',
      'Advanced analytics dashboard',
      'Dedicated account support',
    ],
  },
} as const

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS
