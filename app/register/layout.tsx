import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Register - Create Your Hex Account',
  description: 'Sign up for Hex. Free for job seekers. Employers get a 14-day free trial with unlimited job posts and candidate access.',
  openGraph: {
    title: 'Register - Create Your Hex Account',
    description: 'Sign up for Hex. Free for job seekers. Employers get a 14-day free trial.',
  },
  alternates: {
    canonical: '/register/employee',
  },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
