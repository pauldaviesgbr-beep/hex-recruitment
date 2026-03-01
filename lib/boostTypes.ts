export interface Boost {
  id: string
  user_id: string
  boost_type: 'job' | 'profile'
  target_id: string
  tier: '7_days' | '14_days' | '30_days'
  price_paid: number
  starts_at: string
  expires_at: string
  is_active: boolean
  created_at: string
}

export interface BoostTier {
  id: '7_days' | '14_days' | '30_days'
  label: string
  days: number
  price: number
}

export const JOB_BOOST_TIERS: BoostTier[] = [
  { id: '7_days', label: '7 Days', days: 7, price: 4.99 },
  { id: '14_days', label: '14 Days', days: 14, price: 7.99 },
  { id: '30_days', label: '30 Days', days: 30, price: 12.99 },
]

export const PROFILE_BOOST_TIERS: BoostTier[] = [
  { id: '7_days', label: '7 Days', days: 7, price: 2.99 },
  { id: '14_days', label: '14 Days', days: 14, price: 4.99 },
  { id: '30_days', label: '30 Days', days: 30, price: 8.99 },
]

export function getDaysRemaining(expiresAt: string): number {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diff = expires.getTime() - now.getTime()
  if (diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function isBoostActive(boost: Boost): boolean {
  return boost.is_active && new Date(boost.expires_at) > new Date()
}
