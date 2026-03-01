import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Log In - Access Your Hex Account',
  description: 'Log in to your Hex account to browse jobs, manage applications or post vacancies.',
  alternates: {
    canonical: '/login',
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
