import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Thrive — Free UK Job Board',
    short_name: 'Thrive',
    description: 'Find jobs or hire great people across UK hospitality.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A1628',
    theme_color: '#0A1628',
    icons: [
      { src: '/logo/thrive-mark-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/logo/thrive-mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/logo/thrive-mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
