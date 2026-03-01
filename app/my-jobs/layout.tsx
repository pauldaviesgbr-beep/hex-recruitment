import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Jobs - Manage Your Job Listings',
  description: 'Manage your posted job listings, view applications and track candidates on Hex.',
  robots: { index: false },
  alternates: {
    canonical: '/my-jobs',
  },
}

export default function MyJobsLayout({ children }: { children: React.ReactNode }) {
  return children
}
