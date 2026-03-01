import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CV Builder - Create Your Professional CV',
  description: 'Build a professional CV with our free CV builder. AI-powered writing assistance, live preview, and PDF export. Perfect for UK job seekers.',
  robots: { index: false },
  alternates: {
    canonical: '/cv-builder',
  },
}

export default function CVBuilderLayout({ children }: { children: React.ReactNode }) {
  return children
}
