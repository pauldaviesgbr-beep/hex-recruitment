import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Read the Hex privacy policy. Learn how we collect, use and protect your personal data.',
  alternates: {
    canonical: '/privacy-policy',
  },
}

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
  return children
}
