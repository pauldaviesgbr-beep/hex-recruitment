import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Profile - Edit Your Profile',
  description: 'Update your Hex profile, upload your CV and manage your skills and experience.',
  robots: { index: false },
  alternates: {
    canonical: '/profile',
  },
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children
}
