'use client'

/**
 * Browser end of web push. No Firebase SDK — pushManager.subscribe() is native
 * in every browser that supports push at all.
 *
 * ── THE BUG THIS FILE WAS REWRITTEN TO FIX (13 Aug 2026) ────────────────────
 *
 * The old pushState() answered 'granted' whenever Notification.permission was
 * 'granted'. THAT IS A DIFFERENT FACT FROM "there is somewhere to send to".
 *
 * OS permission says the user allowed notifications. A PushSubscription is what
 * actually receives one. On a real iPhone the two came apart: permission was
 * granted, subscribe() had failed, no device_tokens row existed — and the
 * settings control read "Turn off on this device". Tapping it called
 * unsubscribe on nothing, the state did not change because permission was still
 * granted, and the button appeared dead. A user could not tell whether the app
 * was broken or they were.
 *
 * So the state is now read from the SUBSCRIPTION, which is the thing that
 * determines whether a push can arrive. Permission is consulted only to
 * distinguish "can still be asked" from "blocked, and we cannot re-ask".
 *
 * That makes it ASYNCHRONOUS — getSubscription() returns a promise — and that
 * is the whole reason the old code took the synchronous shortcut. The shortcut
 * was the bug.
 *
 * ── THE OTHER ASYMMETRY THIS FILE IS BUILT AROUND ───────────────────────────
 *
 * Dismissing OUR priming screen costs nothing and can be asked again another
 * day. Declining the OS prompt is close to permanent — on iOS it cannot be
 * re-requested at all. So the OS prompt is only ever reached by someone who has
 * already said yes to us.
 */

export type PushStatus =
  /** No service worker or no PushManager — nothing is possible here. */
  | 'unsupported'
  /** iOS Safari: web push works only from a PWA added to the home screen. */
  | 'ios-needs-install'
  /** A live PushSubscription exists on this device. Pushes can arrive. */
  | 'subscribed'
  /** Supported and undecided or dismissed — asking can still succeed. */
  | 'not-subscribed'
  /** OS permission refused. We cannot re-prompt; only site settings can undo it. */
  | 'blocked'

/** Why a subscribe attempt failed, in words a person can act on. */
export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: string; detail?: string }

const ASKED_KEY = 'thrive-push-asked'
const DECLINED_KEY = 'thrive-push-declined'

/**
 * iOS grants web push ONLY to a PWA added to the home screen. Detected by
 * display-mode rather than by sniffing the user agent: the UA string is a
 * moving target, whereas display-mode answers the question we actually have —
 * "are we running standalone right now".
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
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

export function hasBeenAsked(): boolean {
  try { return localStorage.getItem(ASKED_KEY) !== null } catch { return false }
}

export function recordAsked(outcome: 'accepted' | 'declined'): void {
  try {
    localStorage.setItem(ASKED_KEY, new Date().toISOString())
    if (outcome === 'declined') localStorage.setItem(DECLINED_KEY, new Date().toISOString())
    else localStorage.removeItem(DECLINED_KEY)
  } catch {
    // Private mode with storage disabled. Losing this risks asking twice, which
    // is far smaller than failing the flow.
  }
}

/** Clear our own memory of having asked. Used when a subscription is torn down. */
export function clearAskedRecord(): void {
  try {
    localStorage.removeItem(ASKED_KEY)
    localStorage.removeItem(DECLINED_KEY)
  } catch { /* ignore */ }
}

/** Is there an actual PushSubscription on this device right now? */
export async function getSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    return (await reg?.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

/**
 * THE HONEST STATE. Reads the subscription, not the permission flag.
 *
 * Note the order: 'subscribed' is decided by a real subscription existing, and
 * 'blocked' only by the OS having refused. Nothing here infers one from the
 * other, which is precisely where the old version went wrong.
 */
export async function getPushStatus(): Promise<PushStatus> {
  if (isIOS() && !isStandalone()) return 'ios-needs-install'
  if (!pushSupported()) return 'unsupported'
  if (await getSubscription()) return 'subscribed'
  if (Notification.permission === 'denied') return 'blocked'
  return 'not-subscribed'
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
 * Ask, subscribe, and register server-side.
 *
 * EVERY FAILURE RETURNS A DISTINCT REASON. The old version collapsed five
 * different causes into one message — "Your browser didn't allow
 * notifications" — which was shown on a phone where the browser HAD allowed
 * them. A wrong explanation is worse than none: it sent the next hour of
 * debugging in the wrong direction.
 *
 * PERMISSION IS REQUESTED FIRST, BEFORE ANY OTHER await. Safari ties
 * requestPermission() to the user gesture that triggered it, and awaiting
 * service-worker registration first can spend that gesture before the prompt is
 * reached. Registration happens after, where it costs nothing.
 */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!pushSupported()) {
    return { ok: false, reason: 'unsupported', detail: 'This browser has no Push API.' }
  }

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapid) {
    return {
      ok: false,
      reason: 'no_vapid_key_in_build',
      detail: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY was missing when this page was built. It is baked in at build time, so the site needs redeploying after the variable is added.',
    }
  }

  let permission: NotificationPermission
  try {
    permission = await Notification.requestPermission()
  } catch (err) {
    return { ok: false, reason: 'permission_request_threw', detail: String(err) }
  }
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: `permission_${permission}`,
      detail: permission === 'denied'
        ? 'Notifications are blocked for Thrive. Only your device settings can undo that.'
        : 'The prompt was dismissed without choosing.',
    }
  }

  const reg = await registerServiceWorker()
  if (!reg) {
    return { ok: false, reason: 'service_worker_failed', detail: 'The service worker at /sw.js did not register.' }
  }

  let sub: PushSubscription
  try {
    // Reuse an existing subscription rather than minting a second one for the
    // same browser — otherwise every visit adds a row and one person gets N
    // copies of every notification.
    const existing = await reg.pushManager.getSubscription()
    sub = existing ?? (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    }))
  } catch (err) {
    return { ok: false, reason: 'subscribe_failed', detail: String(err) }
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: 'incomplete_subscription', detail: 'The browser returned a subscription with no keys.' }
  }

  let res: Response
  try {
    res = await fetch('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'web',
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      }),
    })
  } catch (err) {
    return { ok: false, reason: 'register_request_failed', detail: String(err) }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // A subscription the server never stored can receive nothing, so the
    // browser-side one is torn down rather than left as a lie.
    await sub.unsubscribe().catch(() => {})
    return {
      ok: false,
      reason: `register_rejected_${res.status}`,
      detail: res.status === 401
        ? 'You are not signed in on this device.'
        : text.slice(0, 200),
    }
  }

  return { ok: true }
}

/** Drop the browser subscription and the server row together. */
export async function unsubscribeFromPush(): Promise<{ ok: boolean; hadSubscription: boolean }> {
  try {
    const sub = await getSubscription()
    if (!sub) return { ok: true, hadSubscription: false }
    await fetch('/api/push/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    await sub.unsubscribe()
    clearAskedRecord()
    return { ok: true, hadSubscription: true }
  } catch {
    return { ok: false, hadSubscription: false }
  }
}
