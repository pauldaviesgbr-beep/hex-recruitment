import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Settings - Account Settings',
  description: 'Manage your Hex account settings, profile, notifications and subscription.',
  robots: { index: false },
  alternates: {
    canonical: '/settings',
  },
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
