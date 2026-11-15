/**
 * 1a — THE TEXT-LED, TYPE-LED CARD (design_handoff_job_cards_text_led, spec
 * 03; design 25: no images anywhere jobs appear). For places that show six or
 * fewer jobs. Same model and order as the 1b row (lib/jobCard jobRowModel), so
 * the two read as one family: NEW → role → pay → place · type → via · age.
 *
 * THE TITLE IS THE PLATFORM'S TYPEFACE, NOT THE SPEC'S. The handoff names
 * Bricolage; the site runs Inter as its display face (app/layout.tsx, and the
 * same decision recorded in app/page.module.css), and loading a second display
 * family is Paul's call. Size, weight and tracking are the spec's.
 *
 * No 'use client': it renders nothing interactive of its own. The corner slot
 * takes whatever the caller puts there (the dashboard's "Not interested", the
 * employer's apps · views), and the caller decides what wraps the card.
 */

import type { ReactNode } from 'react'
import type { Job } from '@/lib/mockJobs'
import { jobRowModel } from '@/lib/jobCard'
import styles from './JobTypeCard.module.css'

export default function JobTypeCard({ job, corner, reserveCorner, footerNote }: {
  job: Job
  /** Top-right, where Save sits in the spec. */
  corner?: ReactNode
  /** Keep the 44×44 corner free for a control the caller floats over it. */
  reserveCorner?: boolean
  /** Replaces the age under "via {recruiter}" (the employer's apps · views). */
  footerNote?: ReactNode
}) {
  const m = jobRowModel(job)
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.topText}>
          {m.isNew && <span className={styles.newChip}>NEW</span>}
          <span className={styles.title}>{m.title}</span>
        </div>
        {corner
          ? <div className={styles.corner}>{corner}</div>
          : reserveCorner && <div className={styles.cornerSpace} aria-hidden="true" />}
      </div>

      {m.pay && (
        <span className={styles.payLine}>
          <span className={styles.pay}>{m.pay.amount}</span>
          {m.pay.period && <span className={styles.period}>{m.pay.period}</span>}
          {m.pay.negotiable && <span className={styles.period}>(negotiable)</span>}
        </span>
      )}

      {(m.place || m.type) && (
        <span className={styles.placeLine}>
          {m.place && (
            <span className={styles.placeItem}>
              <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
              </svg>
              {m.place}
            </span>
          )}
          {m.place && m.type && <span className={styles.narrowDot} aria-hidden="true"> · </span>}
          {m.type && (
            <span className={styles.placeItem}>
              <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
              {m.type}
            </span>
          )}
        </span>
      )}

      <span className={styles.footer}>
        {m.via && <span className={styles.via}>{m.via}</span>}
        <span className={styles.age}>{footerNote ?? m.age}</span>
      </span>
    </div>
  )
}
