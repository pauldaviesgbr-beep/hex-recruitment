'use client'

import styles from './flow.module.css'

export const STEP_LABELS = ['The role', 'The advert', 'Extras'] as const

/**
 * The navy bar and the stepper, per the design handoff.
 *
 * Split out of page.tsx deliberately: that file is already ~1,900 lines and
 * these are the two pieces every step renders, so inlining them three times is
 * how the phone and desktop variants start disagreeing.
 *
 * The status text on the right is the ONLY place the employer is told her work
 * is safe. The handoff calls for "Saving as you go · draft" becoming
 * "Draft saved · <title>, <town>" and then a live indicator — she will be
 * interrupted mid-form, and this is what tells her that's survivable.
 */
export function FlowAppBar({
  status,
  onBack,
}: {
  /** `extra` (the town) shows from 768 only. On a phone the status is one
   *  line — "Draft saved · {title}", the title cut with "…". */
  status: { kind: 'saving' | 'saved' | 'live'; text: string; extra?: string }
  onBack: () => void
}) {
  return (
    <div className={styles.appBar}>
      <button type="button" onClick={onBack} className={styles.appBarBack} aria-label="Back to dashboard">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <span className={styles.appBarMark} aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 32 32" role="img">
          <rect width="32" height="32" rx="7" fill="#FFE500" />
          <path d="M8 10h16v3.4h-6.1V24h-3.8V13.4H8z" fill="#0F172A" />
        </svg>
      </span>
      <span className={styles.appBarWordmark}>Post a job</span>
      <span className={`${styles.appBarStatus} ${status.kind === 'live' ? styles.appBarStatusLive : ''}`}>
        {status.kind === 'live' && <span className={styles.liveDot} aria-hidden="true">●</span>}
        {status.text}
        {status.extra && <span className={styles.appBarStatusExtra}>{status.extra}</span>}
      </span>
    </div>
  )
}

/**
 * Desktop stepper. A completed step is clickable — going back to change
 * something is the normal case, not an error, and the handoff's "Back never
 * discards" only means anything if there's a way back.
 *
 * An upcoming step is NOT clickable: skipping step 1 lands on a step whose
 * validation lives behind you.
 */
export function Stepper({
  current,
  onGo,
  furthest,
}: {
  current: 1 | 2 | 3
  onGo: (s: 1 | 2 | 3) => void
  furthest: 1 | 2 | 3
}) {
  return (
    <div className={styles.stepper} role="list">
      {STEP_LABELS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const state = n === current ? 'active' : n < current ? 'complete' : 'upcoming'
        const reachable = n < current || n <= furthest
        return (
          <div key={label} className={styles.stepperCell} role="listitem">
            <button
              type="button"
              disabled={!reachable || n === current}
              onClick={() => onGo(n)}
              className={`${styles.stepItem} ${styles[`stepItem_${state}`]}`}
              aria-current={n === current ? 'step' : undefined}
            >
              <span className={`${styles.stepDot} ${styles[`stepDot_${state}`]}`}>
                {state === 'complete' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : n}
              </span>
              <span className={styles.stepLabel}>{label}</span>
            </button>
            {i < STEP_LABELS.length - 1 && (
              <span className={`${styles.stepRule} ${n < current ? styles.stepRuleDone : ''}`} aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Phone variant: a counter and a progress track, no labels — there isn't room. */
export function StepProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className={styles.phoneProgress}>
      <div className={styles.phoneProgressHead}>
        <span className={styles.phoneStepName}>{STEP_LABELS[current - 1]}</span>
        <span className={styles.phoneCount}>{current} / 3</span>
      </div>
      <div className={styles.phoneTrack}>
        <div className={styles.phoneFill} style={{ width: `${(current / 3) * 100}%` }} />
      </div>
    </div>
  )
}
