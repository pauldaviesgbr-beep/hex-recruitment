import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Recommended Jobs - Personalised Job Matches',
  description: 'View jobs tailored to your skills, experience and preferences. Our matching algorithm finds the best opportunities for you across all UK sectors.',
  openGraph: {
    title: 'Recommended Jobs - Personalised Job Matches',
    description: 'View jobs tailored to your skills, experience and preferences.',
  },
  robots: { index: false },
  alternates: {
    canonical: '/jobs/recommended',
  },
}

export default function RecommendedLayout({ children }: { children: React.ReactNode }) {
  return children
}
