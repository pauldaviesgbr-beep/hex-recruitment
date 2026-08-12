'use client'

import { useEffect, useState } from 'react'
import {
  pushState,
  subscribeToPush,
  unsubscribeFromPush,
  recordAsked,
  type PushState,
} from '@/lib/pushClient'

/**
 * The master push control in settings — turns the BROWSER SUBSCRIPTION on and
 * off, which is a different thing from the per-type preference toggles beside
 * it.
 *
 *   this control      is there a device to send to at all?  (device_tokens row)
 *   the type toggles  which events are allowed through      (notification_preferences)
 *
 * Both are honoured by the dispatcher, and they fail closed independently: no
 * row means no_tokens, a type switched off means opted_out. Keeping them
 * separate is what lets someone stay subscribed but silence one kind of
 * message, instead of having to revoke the permission to stop one email.
 *
 * TURNING IT ON FROM HERE STILL GOES THROUGH THE OS PROMPT — but unlike the
 * priming screen, this is a deliberate visit to a settings page, so the person
 * has already decided. There is no priming step in front of it.
 */
export default function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const refresh = () => setState(pushState())
  useEffect(() => { refresh() }, [])

  if (state === null) return null

  if (state === 'unsupported') {
    return <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
      This browser doesn&rsquo;t support notifications.
    </p>
  }

  if (state === 'ios-needs-install') {
    return <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
      To get notifications on iPhone, add Thrive to your home screen first
      (Share &rarr; Add to Home Screen), then open it from there.
    </p>
  }

  if (state === 'denied') {
    // We cannot re-prompt. Saying so is more use than a button that does nothing.
    return <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
      Notifications are blocked for this site. To turn them on, allow
      notifications for Thrive in your browser&rsquo;s site settings.
    </p>
  }

  const on = state === 'granted'

  const flip = async () => {
    setBusy(true)
    setNote(null)
    if (on) {
      await unsubscribeFromPush()
      setNote('Push notifications turned off for this device.')
    } else {
      const r = await subscribeToPush()
      recordAsked(r.ok ? 'accepted' : 'declined')
      setNote(r.ok
        ? 'Push notifications are on for this device.'
        : 'Your browser didn’t allow notifications.')
    }
    refresh()
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
      {note && <p style={{ margin: '0.6rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>{note}</p>}
      <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
        Applies to this device only. Turning it on elsewhere is a separate step.
      </p>
    </div>
  )
}
