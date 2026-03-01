import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Browse Candidates - Find Qualified UK Talent',
  description: 'Browse thousands of qualified candidates across all UK sectors. Filter by skills, experience, location and availability. Find your next hire today.',
  openGraph: {
    title: 'Browse Candidates - Find Qualified UK Talent',
    description: 'Browse thousands of qualified candidates across all UK sectors. Find your next hire today.',
  },
  alternates: {
    canonical: '/candidates',
  },
}

export default function CandidatesLayout({ children }: { children: React.ReactNode }) {
  return children
}
