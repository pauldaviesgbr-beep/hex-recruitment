/*
 * Thrive service worker — push only.
 *
 * DELIBERATELY NOT A CACHING WORKER. It installs no fetch handler and caches
 * nothing. A caching service worker on a job board is how people end up looking
 * at a role that was filled last week, and it is the single most common way a
 * PWA starts serving stale pages that are impossible to debug. If offline
 * support is ever wanted it should be a separate, deliberate decision — adding
 * it by accident here would be the worst way to get it.
 *
 * The only jobs are: show a notification when one is pushed, and focus the
 * right page when it is tapped.
 */

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every tab to close, so a
  // freshly-granted subscription is served by this version and not a previous one.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  // Everything is defensive. A push that throws in here is a notification the
  // user never sees, with no error anywhere we can read.
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    try {
      data = { title: 'Thrive', body: event.data ? event.data.text() : '' }
    } catch {
      data = {}
    }
  }

  const title = data.title || 'Thrive'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Same tag replaces rather than stacks, so five messages from one employer
    // do not become five separate notifications on a lock screen.
    tag: data.tag || 'thrive',
    renotify: true,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Prefer focusing a tab we already have over opening a second one.
      for (const client of list) {
        if ('focus' in client) {
          if (client.url.includes(target)) return client.focus()
        }
      }
      for (const client of list) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(target).then((c) => (c ? c.focus() : null))
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : null
    }),
  )
})
