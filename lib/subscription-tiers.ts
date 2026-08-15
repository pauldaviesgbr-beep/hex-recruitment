// Client-safe subscription tier config (no server secrets)
//
// Single-plan pricing. A row with `subscription_tier: 'standard'` in
// employer_subscriptions means the employer is on the paid plan (either in
// trial or active). Historical rows with 'free' or 'professional' are
// treated as 'standard' by hasFeatureAccess in lib/subscription.ts.
//
// THERE IS NO `price` HERE ANY MORE, and that is the point. This file used to
// carry price: EMPLOYER_SUBSCRIPTION_PRICE so it "could never drift from the
// canonical value" — but the canonical value was 99, a single flat number, and
// Paul confirmed on 15 Aug 2026 that the real model is TIERED and six to
// twelve months out. A one-tier structure priced from one constant is not a
// tier model waiting for more entries; it is a shape that will be replaced.
//
// The name, trial length and feature list are still true and still read. Only
// the number has gone. When there is a real model, price belongs in whatever
// structure it brings — not bolted back on here.
//
// Direction still matters: subscription-tiers ← trialUtils only; if trialUtils
// ever needs tier info, route it through a separate module to avoid a cycle.
import { TRIAL_DURATION_DAYS } from './trialUtils'

export const SUBSCRIPTION_TIERS = {
  standard: {
    name: 'Standard',
    trialDays: TRIAL_DURATION_DAYS,
    maxActiveJobs: Infinity,
    features: [
      'Unlimited job listings',
      'Browse and contact candidates',
      'Manage applications in dashboard',
      'Analytics dashboard',
      'Dedicated account support',
      'Cancel anytime',
    ],
  },
} as const

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS
