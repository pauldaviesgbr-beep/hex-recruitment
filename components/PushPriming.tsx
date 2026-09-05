'use client'

import { useEffect, useState } from 'react'
import {
  getPushStatus,
  hasBeenAsked,
  recordAsked,
  subscribeToPush,
  isIOS,
  type PushStatus,
} from '@/lib/pushClient'
import styles from './PushPriming.module.css'

/**
 * Our own screen, shown BEFORE the browser's permission prompt.
 *
 * WHY IT EXISTS AT ALL — the asymmetry is the entire argument. Dismissing this
 * costs nothing and can be asked again another day. Declining the OS prompt is
 * close to permanent: on iOS it cannot be re-requested, and on desktop Chrome
 * it sticks until the user goes digging in site settings. So the OS prompt is
 * only ever reached by someone who has already said yes to us.
 *
 * ── WHAT THIS COPY DELIBERATELY DOES NOT SAY ────────────────────────────────
 *
 * An earlier draft read "Employers on Thrive usually come back within a few
 * days, and the people who reply first tend to get the interview." Both halves
 * were checked against the table and both were false:
 *
 *   39 applications, 36 still 'pending'  — 92% of employers have NOT come back
 *   0 hires, ever                        — so nothing is known about what gets
 *                                          someone an interview
 *
 * The second clause was worse than wrong, it was invented: a claim about
 * candidate behaviour we have never measured, phrased to sound like a
 * statistic. This is the one screen whose whole job is to earn a permission
 * that can only be granted once, so it promises ONLY what we control —
 * that WE will tell them when something happens.
 */
export default function PushPriming({ trigger }: { trigger: boolean }) {
  const [state, setState] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null)

  useEffect(() => {
    if (!trigger) return
    // Read the state only once the trigger fires, so nothing is evaluated —
    // and certainly nothing is asked — on a page the candidate has just landed on.
    // Async because the honest answer comes from the SUBSCRIPTION, not from
    // Notification.permission. See the note in lib/pushClient.ts.
    let alive = true
    void getPushStatus().then(s => { if (alive) setState(s) })
    return () => { alive = false }
  }, [trigger])

  if (!trigger || !state || done) return null
  // 'subscribed' means they already have it; 'blocked'/'unsupported' means
  // asking cannot succeed. In all three the honest thing is to render nothing.
  if (state === 'subscribed' || state === 'blocked' || state === 'unsupported') return null
  // Asked once already and they said no. Our screen is cheap to dismiss but not
  // free to repeat, and nagging is how a "not now" becomes a "never".
  if (hasBeenAsked()) return null

  // iOS Safari cannot grant web push at all until Thrive is on the home screen.
  // Showing an iPhone user a permission button that physically cannot work
  // would spend the one ask we get on a guaranteed failure.
  if (state === 'ios-needs-install') {
    return (
      <div className={styles.card} role="region" aria-label="Get notified">
        <h2 className={styles.title}>Want to know when an employer replies?</h2>
        <p className={styles.body}>
          Add Thrive to your home screen and we can send you a notification the moment
          something happens on your application.
        </p>
        <ol className={styles.steps}>
          <li>Tap the Share button at the bottom of Safari</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
          <li>Open Thrive from your home screen</li>
        </ol>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => { recordAsked('declined'); setDone('declined') }}
        >
          Not now
        </button>
      </div>
    )
  }

  const accept = async () => {
    setBusy(true)
    const result = await subscribeToPush()
    // Recorded as asked either way. If they reached the OS prompt and refused,
    // we must never ask again — we could not succeed if we did.
    recordAsked(result.ok ? 'accepted' : 'declined')
    setBusy(false)
    setDone(result.ok ? 'accepted' : 'declined')
    // A failure here is deliberately quiet FOR THE CANDIDATE — they are mid-way
    // through applying and a technical reason is no use to them. It is not
    // quiet for us: the reason goes to the console, and Settings shows the same
    // failure in full for anyone who goes looking.
    if (!result.ok) console.warn('[push] priming subscribe failed:', result.reason, result.detail)
  }

  const decline = () => {
    // Never reaches the OS prompt. That is the whole point of this button.
    recordAsked('declined')
    setDone('declined')
  }

  return (
    <div className={styles.card} role="region" aria-label="Get notified">
      <h2 className={styles.title}>Want to know the moment an employer replies?</h2>
      <p className={styles.body}>
        We&rsquo;ll send you a notification when an employer messages you, invites you to an
        interview, or makes you an offer.
      </p>
      <p className={styles.small}>
        Nothing else &mdash; no job alerts, no marketing. You can turn it off any time in settings.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={accept} disabled={busy}>
          {busy ? 'Just a moment…' : 'Yes, tell me'}
        </button>
        <button type="button" className={styles.secondary} onClick={decline} disabled={busy}>
          Not now
        </button>
      </div>
      {isIOS() ? null : (
        // "your device", not "your browser" — read inside the iOS shell as
        // often as on the web, and there the word browser gives the wrapper
        // away.
        <p className={styles.tiny}>Your device will ask you to confirm.</p>
      )}
    </div>
  )
}
