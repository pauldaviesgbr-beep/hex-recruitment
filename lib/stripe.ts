import 'server-only'
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Stripe Price IDs - set these after creating products in Stripe Dashboard
export const STRIPE_PRICES = {
  standard: process.env.STRIPE_STANDARD_PRICE_ID || '',
  professional: process.env.STRIPE_PROFESSIONAL_PRICE_ID || '',
}

// Re-export tier config for convenience in server code
export { SUBSCRIPTION_TIERS, type SubscriptionTier } from './subscription-tiers'
