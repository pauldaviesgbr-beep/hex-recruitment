import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Messages - Your Conversations',
  description: 'View and manage your messages with employers and candidates on Hex.',
  robots: { index: false },
  alternates: {
    canonical: '/messages',
  },
}

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return children
}
