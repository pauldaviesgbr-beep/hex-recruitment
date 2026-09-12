import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Job ads',
  description: 'Manage your posted job listings, view applications and track candidates on Thrive.',
  robots: { index: false },
  alternates: {
    canonical: '/my-jobs',
  },
}

export default function MyJobsLayout({ children }: { children: React.ReactNode }) {
  return children
}
