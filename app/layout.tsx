import type { Metadata } from 'next'
import { Inter, Dancing_Script } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })
const dancingScript = Dancing_Script({
  subsets: ['latin'],
  variable: '--font-cursive',
  weight: ['400', '700'],
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://hexrecruitment.co.uk'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Hex | Talent Recruitment — Find Jobs Across All Sectors in the UK',
    template: '%s | Hex | Talent Recruitment',
  },
  description: 'Hex — Talent Recruitment. Find your next career move or hire top talent. The smarter way to recruit. Browse thousands of jobs across every UK sector. Free for job seekers.',
  keywords: ['UK jobs', 'job board', 'recruitment', 'hospitality jobs', 'healthcare jobs', 'find a job UK', 'hire staff UK', 'Hex', 'talent recruitment'],
  authors: [{ name: 'Hex' }],
  creator: 'Hex',
  publisher: 'Hex',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: SITE_URL,
    siteName: 'Hex',
    title: 'Hex | Talent Recruitment — Find Jobs Across All Sectors in the UK',
    description: 'Hex — Talent Recruitment. Find your next career move or hire top talent. The smarter way to recruit.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Hex — Talent Recruitment',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hex | Talent Recruitment — Find Jobs Across All Sectors in the UK',
    description: 'Hex — Talent Recruitment. Find your next career move or hire top talent. The smarter way to recruit.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
    languages: {
      'en-GB': SITE_URL,
    },
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-GB">
      <body className={`${inter.className} ${dancingScript.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
