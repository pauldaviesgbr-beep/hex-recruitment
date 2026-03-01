import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Subscription Management - Hex',
  description: 'Manage your Hex subscription plan, billing, and account settings.',
  robots: { index: false },
}

export default function SubscriptionLayout({ children }: { children: React.ReactNode }) {
  return children
}
