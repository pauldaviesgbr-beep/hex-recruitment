import dynamic from 'next/dynamic'
const FeedbackWidget = dynamic(() => import('@/components/FeedbackWidget'), { ssr: false })
import ScrollToTop from '@/components/ScrollToTop'
import FirstTouchCapture from '@/components/FirstTouchCapture'
import SessionGuard from '@/components/SessionGuard'
import { MessagesProvider } from '@/lib/MessagesContext'
import type { Metadata } from 'next'
import { Inter, Dancing_Script, Fraunces } from 'next/font/google'
import { Providers } from './providers'
import { foundingPhraseShort } from '@/lib/trialUtils'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'
import { BRAND_FULL } from '@/lib/constants/brand'
import './globals.css'

// Body font. Also does double duty as the display face (see
// --font-display below) so that numbers and headings share the same
// family across the whole platform — one clean sans-serif look.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})
// Keep the --font-display CSS variable in place (many components already
// reference it) but point it at a heavier-weight Inter instance so stat
// pills and hero numbers stand out without switching family. Tabular
// numerals are enabled globally below so counts line up in columns.
const interDisplay = Inter({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
  display: 'swap',
})
const dancingScript = Dancing_Script({
  subsets: ['latin'],
  variable: '--font-cursive',
  weight: ['400', '700'],
  display: 'swap',
})
// Serif display face for the candidate job-card role titles (and matching
// "Find your next role" header) — the image-led card design uses a serif over
// the photo scrim. Exposed as --font-serif; only used where opted in.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['500', '600', '700'],
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: BRAND_FULL,
    template: '%s | Thrive',
  },
  // NO PRICE. The tier structure isn't decided, so any figure here is one we
  // would have to walk back — and walking a price back is worse than never
  // naming one, especially to the founding employers signing up this month.
  // The founding offer is different: it is an offer actually being run and can
  // be honoured, so it is the only money claim allowed. Same rule everywhere;
  // see CLAUDE.md.
  //
  // This string is not just the homepage. It is the ROOT description, so it is
  // also served on /waitlist and on every 404 — including /pricing,
  // /for-employers and /employers, which do not exist as routes.
  description: `Hire faster for restaurants, hotels and hospitality groups. Manage applicants across kitchen, front of house, sales and operations. The first ${EMPLOYER_COHORT_CAP} employers get ${foundingPhraseShort()}.`,
  keywords: ['hospitality jobs UK', 'restaurant jobs London', 'hotel jobs UK', 'chef jobs London', 'front of house jobs', 'hospitality hiring platform', 'restaurant hiring software', 'Thrive'],
  authors: [{ name: 'Thrive' }],
  creator: 'Thrive',
  publisher: 'Thrive',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: SITE_URL,
    siteName: 'Thrive',
    title: BRAND_FULL,
    description: 'Hire faster for restaurants, hotels and hospitality groups. Manage applicants across kitchen, front of house, sales and operations.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Thrive — Hire faster. Apply smarter.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_FULL,
    description: 'Hire faster for restaurants, hotels and hospitality groups. Manage applicants across kitchen, front of house, sales and operations.',
    images: ['/opengraph-image'],
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
    apple: '/apple-icon',
  },
  manifest: '/manifest.webmanifest',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-GB">
      <body className={`${inter.className} ${dancingScript.variable} ${interDisplay.variable} ${fraunces.variable}`}>
        <Providers>
          <MessagesProvider>
            <ScrollToTop />
            <FirstTouchCapture />
            <SessionGuard />
            {children}
            <FeedbackWidget />
          </MessagesProvider>
        </Providers>
      </body>
    </html>
  )
}
