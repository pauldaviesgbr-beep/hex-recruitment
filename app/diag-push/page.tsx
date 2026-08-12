'use client'

/**
 * ONE-TAP PUSH TEST — for Paul's phone, because no automated browser can do it.
 *
 * An ephemeral automation profile cannot register with a push service: real
 * Chrome, notifications granted, permissionState granted, and subscribe() still
 * returns "Registration failed - permission denied". So the last link in the
 * chain — a push actually arriving and being displayed — can only be closed on
 * a real device. This page makes that a one-minute job instead of an evening.
 *
 * NOT under a leading-underscore folder: the App Router treats those as private
 * and the route would 404 no matter what it contained. That cost a deploy cycle
 * once already.
 *
 * Signed-in candidates only, and it pushes ONLY to the person tapping the
 * button — it reads the session server-side and can address nobody else.
 */

import { useEffect, useState } from 'react'
import { pushState, subscribeToPush, unsubscribeFromPush, isIOS, isStandalone } from '@/lib/pushClient'

type Line = { at: string; text: string; ok?: boolean }

export default function PushDiagnosticPage() {
  const [lines, setLines] = useState<Line[]>([])
  const [env, setEnv] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const say = (text: string, ok?: boolean) =>
    setLines(l => [...l, { at: new Date().toLocaleTimeString(), text, ok }])

  useEffect(() => {
    setEnv({
      'push supported': String(typeof window !== 'undefined' && 'PushManager' in window),
      'service worker': String(typeof navigator !== 'undefined' && 'serviceWorker' in navigator),
      'permission': typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
      'state': pushState(),
      'iOS': String(isIOS()),
      'installed (standalone)': String(isStandalone()),
      'VAPID key present': String(!!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    })
  }, [])

  const step1 = async () => {
    setBusy(true)
    say('Asking for permission and subscribing…')
    const r = await subscribeToPush()
    say(r.ok ? 'Subscribed. A row now exists in device_tokens.' : `Failed: ${r.reason}`, r.ok)
    setBusy(false)
  }

  const step2 = async () => {
    setBusy(true)
    say('Asking the server to push to you…')
    try {
      const res = await fetch('/api/diag-push/send', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      say(res.ok
        ? `Server says: ${JSON.stringify(j)} — a notification should appear within a few seconds.`
        : `Server refused: ${res.status} ${JSON.stringify(j)}`, res.ok)
    } catch (e) {
      say(`Request failed: ${String(e)}`, false)
    }
    setBusy(false)
  }

  const step3 = async () => {
    setBusy(true)
    await unsubscribeFromPush()
    say('Unsubscribed and the row removed.', true)
    setBusy(false)
  }

  const btn: React.CSSProperties = {
    font: 'inherit', fontWeight: 600, fontSize: '1rem', minHeight: 48,
    padding: '0.85rem 1.2rem', borderRadius: 10, border: '1px solid #16a34a',
    background: '#16a34a', color: '#fff', cursor: 'pointer', width: '100%',
    marginBottom: '0.7rem',
  }

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1.1rem 4rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.35rem', margin: '0 0 0.4rem' }}>Push test</h1>
      <p style={{ color: '#64748b', fontSize: '0.95rem', margin: '0 0 1.4rem', lineHeight: 1.6 }}>
        Tap the three buttons in order. You must be signed in as a candidate. Nothing here
        reaches anyone but you.
      </p>

      <button style={btn} onClick={step1} disabled={busy}>1 &nbsp;Turn on notifications</button>
      <button style={{ ...btn, background: '#0f766e', borderColor: '#0f766e' }} onClick={step2} disabled={busy}>
        2 &nbsp;Send me a test push
      </button>
      <button style={{ ...btn, background: '#fff', color: '#475569', borderColor: '#e2e8f0' }} onClick={step3} disabled={busy}>
        3 &nbsp;Turn it off again
      </button>

      <h2 style={{ fontSize: '0.8rem', letterSpacing: '.08em', textTransform: 'uppercase', color: '#94a3b8', margin: '1.8rem 0 0.5rem' }}>
        What this browser reports
      </h2>
      <table style={{ width: '100%', fontSize: '0.87rem', borderCollapse: 'collapse' }}>
        <tbody>
          {Object.entries(env).map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '4px 10px 4px 0', color: '#94a3b8', whiteSpace: 'nowrap' }}>{k}</td>
              <td style={{ padding: '4px 0', color: '#334155', fontFamily: 'ui-monospace, monospace' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: '0.8rem', letterSpacing: '.08em', textTransform: 'uppercase', color: '#94a3b8', margin: '1.6rem 0 0.5rem' }}>
        Log
      </h2>
      <div style={{ fontSize: '0.87rem', lineHeight: 1.65 }}>
        {lines.length === 0 ? <p style={{ color: '#94a3b8', margin: 0 }}>Nothing yet.</p> : null}
        {lines.map((l, i) => (
          <p key={i} style={{ margin: '0 0 6px', color: l.ok === false ? '#b91c1c' : l.ok ? '#15803d' : '#475569' }}>
            <span style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>{l.at}</span> &nbsp;{l.text}
          </p>
        ))}
      </div>
    </main>
  )
}
