import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Browse Jobs in the UK - Hospitality, Admin, Tech & More',
  description: 'Search and apply for thousands of UK jobs across all sectors. Filter by location, salary, job type and more. New jobs added daily. Free for job seekers.',
  openGraph: {
    title: 'Browse Jobs in the UK - Hospitality, Admin, Tech & More',
    description: 'Search and apply for thousands of UK jobs across all sectors. Filter by location, salary, job type and more.',
  },
  alternates: {
    canonical: '/jobs',
  },
}

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children
}
