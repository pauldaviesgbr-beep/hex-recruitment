import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Thrive — Free UK Job Board',
    short_name: 'Thrive',
    description: 'Find jobs or hire great people across UK hospitality.',
    start_url: '/',
    display: 'standalone',
    // Long-press the home-screen icon to reach these. Android and desktop
    // honour them; iOS ignores shortcuts entirely.
    //
    // The "Push test" shortcut was removed 14 Oct 2026: the manifest is the
    // same for everyone, so it put a debugging page in front of every user.
    // The admin reaches /diag-push from Settings → Notifications instead.
    shortcuts: [
      { name: 'Notification settings', url: '/settings/notifications' },
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
