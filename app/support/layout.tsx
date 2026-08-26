import type { Metadata } from 'next'

// The App Store listing points at this URL, so it must be indexable and must
// describe itself honestly. No price, no response-time promise, nothing the
// page does not actually say.
export const metadata: Metadata = {
  title: 'Support | Thrive',
  description: 'How to get help with Thrive — email us, ask in-app, or find the answer to a common question.',
  alternates: { canonical: '/support' },
}

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children
}
