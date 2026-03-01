import { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://hexrecruitment.co.uk'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/profile',
          '/messages',
          '/applications',
          '/my-jobs',
          '/settings',
          '/notifications',
          '/reactivate-account',
          '/renew-subscription',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
