import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Applications - Track Your Job Applications',
  description: 'Track the status of all your job applications in one place. See updates, interview invitations and offers from UK employers.',
  robots: { index: false },
  alternates: {
    canonical: '/applications',
  },
}

export default function ApplicationsLayout({ children }: { children: React.ReactNode }) {
  return children
}
