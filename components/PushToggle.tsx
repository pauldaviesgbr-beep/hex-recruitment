'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getPushStatus,
  subscribeToPush,
  unsubscribeFromPush,
  recordAsked,
  type PushStatus,
} from '@/lib/pushClient'

/**
 * The master push control in settings — turns the BROWSER SUBSCRIPTION on and
 * off, which is a different thing from the per-type preference toggles beside
 * it.
 *
 *   this control      is there a device to send to at all?  (device_tokens row)
 *   the type toggles  which events are allowed through      (notification_preferences)
 *
 * ── WHY THIS WAS REWRITTEN (13 Aug 2026) ────────────────────────────────────
 *
 * On a real iPhone this button read "Turn off on this device" while the line
 * underneath read "Your browser didn't allow notifications", and tapping it did
 * nothing at all. Three separate faults, all of them mine:
 *
 *   1. The LABEL came from Notification.permission === 'granted'. That is
 *      whether the OS allows notifications, not whether a subscription exists.
 *      Permission was granted and subscribe() had failed, so it claimed to be
 *      on with nowhere to send.
 *   2. Tapping ran unsubscribe on nothing, then re-read the same permission
 *      flag, which had not changed — so the button could never flip. A silent
 *      no-op is the worst possible outcome: you cannot tell a broken app from a
 *      broken user.
 *   3. The failure message named ONE cause out of five possible ones, and named
 *      the wrong one. A confident wrong explanation costs more than silence.
 *
 * The label now comes from a real PushSubscription, every failure reports its
 * own reason, and the button always says what just happened.
 */
export default function PushToggle() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null)

  const refresh = useCallback(async () => setStatus(await getPushStatus()), [])
  useEffect(() => { void refresh() }, [refresh])

  const muted: React.CSSProperties = { margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.55 }

  if (status === null) return <p style={muted}>Checking…</p>

  if (status === 'unsupported') {
    return <p style={muted}>This browser doesn&rsquo;t support notifications.</p>
  }

  if (status === 'ios-needs-install') {
    return <p style={muted}>
      To get notifications on iPhone, add Thrive to your home screen first
      (Share &rarr; Add to Home Screen), then open it from there.
    </p>
  }

  if (status === 'blocked') {
    // We cannot re-prompt. Saying so beats a button that cannot work.
    return <p style={muted}>
      Notifications are blocked for Thrive on this device. To turn them on,
      allow notifications for Thrive in your device or browser settings, then
      come back to this page.
    </p>
  }

  const on = status === 'subscribed'

  const flip = async () => {
    setBusy(true)
    setNote(null)
    if (on) {
      const r = await unsubscribeFromPush()
      setNote(r.ok
        ? { text: 'Push notifications are off for this device.' }
        : { text: 'Could not turn them off. Try again.', bad: true })
    } else {
      const r = await subscribeToPush()
      recordAsked(r.ok ? 'accepted' : 'declined')
      // THE FAILURE REASON IS SHOWN, not a guess at it. This is the line that
      // would have saved an evening on the iPhone.
      setNote(r.ok
        ? { text: 'Push notifications are on for this device.' }
        : { text: `Couldn’t turn them on — ${r.reason}${r.detail ? `. ${r.detail}` : ''}`, bad: true })
    }
    // Re-read from the subscription, so the label can only ever reflect reality.
    await refresh()
    setBusy(false)
  }

  return (
    <div>
      <button
        type="button"
        onClick={flip}
        disabled={busy}
        aria-pressed={on}
        style={{
          font: 'inherit', fontWeight: 600, fontSize: '0.9rem', minHeight: 44,
          padding: '0.6rem 1.05rem', borderRadius: 9, cursor: busy ? 'default' : 'pointer',
          background: on ? '#fff' : '#16a34a',
          color: on ? '#475569' : '#fff',
          border: `1px solid ${on ? '#e2e8f0' : '#16a34a'}`,
          opacity: busy ? 0.65 : 1,
        }}
      >
        {busy ? 'Just a moment…' : on ? 'Turn off on this device' : 'Turn on for this device'}
      </button>

      {note && (
        <p
          role="status"
          style={{ margin: '0.6rem 0 0', fontSize: '0.85rem', lineHeight: 1.55, color: note.bad ? '#b91c1c' : '#15803d' }}
        >
          {note.text}
        </p>
      )}

      <p style={{ ...muted, margin: '0.6rem 0 0', fontSize: '0.8rem' }}>
        {on
          ? 'This device is subscribed. Applies to this device only.'
          : 'Nothing can arrive on this device until you turn it on.'}
      </p>
    </div>
  )
}
