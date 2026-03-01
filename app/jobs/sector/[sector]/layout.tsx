import type { Metadata } from 'next'
import { SEO_SECTORS } from '@/lib/seo'

interface Props {
  params: { sector: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sectorInfo = SEO_SECTORS[params.sector]
  if (!sectorInfo) {
    return { title: 'Sector Not Found' }
  }

  const title = `${sectorInfo.name} Jobs UK - Find ${sectorInfo.name} Roles`
  const description = `Browse ${sectorInfo.name} jobs across the UK. Find full-time, part-time and contract ${sectorInfo.name.toLowerCase()} roles. New jobs added daily. Free for job seekers.`

  return {
    title,
    description,
    keywords: sectorInfo.keywords.split(', '),
    openGraph: {
      title,
      description,
    },
    alternates: {
      canonical: `/jobs/sector/${params.sector}`,
    },
  }
}

export function generateStaticParams() {
  return Object.keys(SEO_SECTORS).map(sector => ({ sector }))
}

export default function SectorLayout({ children }: { children: React.ReactNode }) {
  return children
}
