import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Thrive — Free UK Job Board',
    short_name: 'Thrive',
    description: 'Find jobs or hire great people across UK hospitality.',
    start_url: '/',
    display: 'standalone',
    // Long-press the home-screen icon to reach these. Android and desktop
    // honour them; iOS currently ignores shortcuts entirely, which is why the
    // push test ALSO has a plain link from Settings → Notifications. A route
    // that only exists behind a feature one platform ignores is a route that
    // does not exist on that platform.
    shortcuts: [
      { name: 'Notification settings', url: '/settings/notifications' },
      { name: 'Push test', url: '/diag-push' },
    ],
    background_color: '#0A1628',
    theme_color: '#0A1628',
    icons: [
      { src: '/logo/thrive-mark-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/logo/thrive-mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/logo/thrive-mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
