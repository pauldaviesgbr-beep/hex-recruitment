import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'

const UK_CITIES = [
  'london', 'manchester', 'birmingham', 'leeds', 'glasgow',
  'edinburgh', 'bristol', 'liverpool', 'sheffield', 'cardiff',
  'nottingham', 'newcastle', 'brighton', 'leicester', 'oxford',
  'cambridge', 'york', 'bath', 'reading', 'southampton',
  'belfast', 'coventry', 'aberdeen', 'dundee', 'swansea',
]

const SECTORS = [
  'accountancy-finance', 'business-management', 'charity',
  'creative-design', 'digital-it', 'energy-utilities',
  'engineering', 'environment-agriculture', 'healthcare',
  'hospitality-tourism', 'law-legal', 'marketing-pr',
  'media', 'property-construction', 'public-services',
  'recruitment-hr', 'retail-sales', 'science',
  'teaching-education', 'transport-logistics',
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString()

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/jobs`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    // /login/employee and /login/employer came OUT of the sitemap on
    // 23 Aug 2026, in the same change that made them redirects. A sitemap
    // that advertises a redirect asks Google to index a bounce — and the
    // employee one was publishing the bare "Job Seeker Login" face, which
    // is one of the doors strangers arrived at instead of a sign-up form.
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/register/employee`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    // /register/employer IS NOT LISTED. It now only exists as a redirect to
    // /register/employer-free, which is listed below — advertising a URL whose
    // sole behaviour is to send you somewhere else is how /pricing,
    // /for-employers and /employers came to serve 404s under index,follow.
    // The destination is the page worth indexing.
    { url: `${SITE_URL}/waitlist`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/register/employer-free`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.8 },
    { url: `${SITE_URL}/candidates`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/post-job`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/privacy-policy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ]

  // City landing pages
  const cityPages: MetadataRoute.Sitemap = UK_CITIES.map(city => ({
    url: `${SITE_URL}/jobs/${city}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  // Sector landing pages
  const sectorPages: MetadataRoute.Sitemap = SECTORS.map(sector => ({
    url: `${SITE_URL}/jobs/sector/${sector}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  // Dynamic job pages from Supabase
  let jobPages: MetadataRoute.Sitemap = []
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey)
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, updated_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5000)

      if (jobs) {
        jobPages = jobs.map(job => ({
          url: `${SITE_URL}/job/${job.id}`,
          lastModified: job.updated_at || now,
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        }))
      }
    }
  } catch {
    // Silently fail — static pages are still returned
  }

  return [...staticPages, ...cityPages, ...sectorPages, ...jobPages]
}
