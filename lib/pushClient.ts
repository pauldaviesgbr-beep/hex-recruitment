'use client'

/**
 * Browser end of web push. No Firebase SDK — pushManager.subscribe() is native
 * in every browser that supports push at all.
 *
 * THE ASYMMETRY THIS FILE IS BUILT AROUND: dismissing OUR screen costs nothing
 * and can be asked again another day. Declining the OS prompt is close to
 * permanent — on iOS it cannot be re-requested at all, and on desktop Chrome it
 * sticks until the user digs into site settings. So the OS prompt is only ever
 * reached by someone who has already said yes to us.
 */

export type PushState =
  | 'unsupported'      // no service worker / no PushManager
  | 'ios-needs-install' // iOS Safari: web push only works from an installed PWA
  | 'granted'          // OS permission already given
  | 'denied'           // OS permission refused — never ask again, we cannot
  | 'askable'          // supported, undecided, and we have not worn out our welcome

const ASKED_KEY = 'thrive-push-asked'      // we showed OUR screen
const DECLINED_KEY = 'thrive-push-declined' // they said "not now" to OUR screen

/**
 * iOS grants web push ONLY to a PWA added to the home screen. Detected by
 * display-mode rather than by sniffing the user agent: the UA string is a
 * moving target and every UA check written five years ago is wrong today,
 * whereas display-mode answers the question we actually have — "are we running
 * standalone right now".
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // Safari's own non-standard flag, still the only signal on older iOS.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Have we already shown our own priming screen to this person? */
export function hasBeenAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) !== null
  } catch {
    return false
  }
}

export function recordAsked(outcome: 'accepted' | 'declined'): void {
  try {
    localStorage.setItem(ASKED_KEY, new Date().toISOString())
    if (outcome === 'declined') localStorage.setItem(DECLINED_KEY, new Date().toISOString())
  } catch {
    // Private mode with storage disabled. Losing this means we might ask twice,
    // which is a far smaller harm than failing the flow.
  }
}

/**
 * What should the UI do right now? Returns 'askable' ONLY when asking can
 * actually succeed and we have not asked before.
 */
export function pushState(): PushState {
  if (!pushSupported()) {
    // iOS Safari has no PushManager until installed, so "unsupported" on an
    // iPhone that is not standalone is really "not installed yet".
    if (isIOS() && !isStandalone()) return 'ios-needs-install'
    return 'unsupported'
  }
  if (isIOS() && !isStandalone()) return 'ios-needs-install'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  if (hasBeenAsked()) return 'denied' // asked once already; do not ask again
  return 'askable'
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    return reg
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * Trigger the OS prompt and, if granted, register the subscription server-side.
 * ONLY call this from a user gesture that followed our own priming screen.
 */
export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapid) return { ok: false, reason: 'no_vapid_public_key' }

  const reg = await registerServiceWorker()
  if (!reg) return { ok: false, reason: 'service_worker_failed' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'permission_' + permission }

  let sub: PushSubscription
  try {
    // Reuse an existing subscription rather than minting a second one for the
    // same browser — otherwise every visit adds a row and one person gets N
    // copies of every notification.
    const existing = await reg.pushManager.getSubscription()
    sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      }))
  } catch (err) {
    return { ok: false, reason: 'subscribe_failed: ' + String(err) }
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: 'incomplete_subscription' }
  }

  const res = await fetch('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: 'web',
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }),
  })
  if (!res.ok) return { ok: false, reason: 'register_failed_' + res.status }
  return { ok: true }
}

/** Drop the browser subscription and the server row together. */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await fetch('/api/push/unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {})
      await sub.unsubscribe()
    }
    return true
  } catch {
    return false
  }
}
