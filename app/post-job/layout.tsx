import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Post a Job - Reach Thousands of UK Candidates',
  description: 'Post your job vacancy and reach thousands of qualified UK candidates across all sectors. Easy job posting with applicant tracking. Start your free trial today.',
  openGraph: {
    title: 'Post a Job - Reach Thousands of UK Candidates',
    description: 'Post your job vacancy and reach thousands of qualified UK candidates. Easy job posting with applicant tracking.',
  },
  alternates: {
    canonical: '/post-job',
  },
}

export default function PostJobLayout({ children }: { children: React.ReactNode }) {
  return children
}
