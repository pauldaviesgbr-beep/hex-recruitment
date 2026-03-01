import type { Metadata } from 'next'
import { SEO_CITIES } from '@/lib/seo'

interface Props {
  params: { city: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cityInfo = SEO_CITIES[params.city]
  if (!cityInfo) {
    return { title: 'City Not Found' }
  }

  const title = `Jobs in ${cityInfo.name} - Find Your Next Role in ${cityInfo.region}`
  const description = `Browse jobs in ${cityInfo.name}, ${cityInfo.region}. Find full-time, part-time and temporary roles across all sectors. New ${cityInfo.name} jobs added daily. Free for job seekers.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
    alternates: {
      canonical: `/jobs/${params.city}`,
    },
  }
}

export function generateStaticParams() {
  return Object.keys(SEO_CITIES).map(city => ({ city }))
}

export default function CityLayout({ children }: { children: React.ReactNode }) {
  return children
}
