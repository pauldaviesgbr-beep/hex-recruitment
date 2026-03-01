import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Employer Plans - Post Jobs & Find Candidates from £29.99/month',
  description: 'Choose an employer plan to post jobs and browse candidates. 14-day free trial, no card required. 1 week cancellation notice.',
  openGraph: {
    title: 'Employer Plans - Post Jobs & Find Candidates from £29.99/month',
    description: 'Post jobs and browse candidates. 14-day free trial, no card required.',
  },
  alternates: {
    canonical: '/subscribe',
  },
}

export default function SubscribeLayout({ children }: { children: React.ReactNode }) {
  return children
}
