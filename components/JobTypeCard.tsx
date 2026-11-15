/**
 * 1a — THE TEXT-LED, TYPE-LED CARD (design_handoff_job_cards_text_led, spec
 * 03; design 25: no images anywhere jobs appear; design 26 round 2). For places
 * that show six or fewer jobs. Same model and order as the 1b row (lib/jobCard
 * jobRowModel), so the two read as one family: NEW → role → pay → place · type
 * → via · age.
 *
 * THE TITLE IS THE PLATFORM'S TYPEFACE, NOT THE SPEC'S: Inter, at the spec's
 * size, weight and tracking (design 26 confirms it: no Bricolage).
 *
 * THE TITLE IS THE LINK, STRETCHED OVER THE CARD (::after), and the corner
 * (Save) and the footer action ("Not interested") sit above it. The whole card
 * used to be one <a>, which left a control nowhere valid to go — a button
 * inside a link is not allowed, and the dashboard's × floated over the title.
 *
 * variant="home" (design 26, A): a fixed 248px, the chip slot always renders
 * (NEW within 48h, otherwise the age as the same grey chip), the title clamps
 * to two lines, and the footer shows "via {recruiter}" plus the age only when
 * the chip says NEW — so every card on the home grid lines up exactly and the
 * section's reserved height is exact.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Job } from '@/lib/mockJobs'
import { jobRowModel } from '@/lib/jobCard'
import styles from './JobTypeCard.module.css'

export default function JobTypeCard({ job, href, corner, footerNote, footerAction, variant }: {
  job: Job
  /** Where the card goes. The title is the link, stretched over the card. */
  href?: string
  /** Top-right 44×44: Save. */
  corner?: ReactNode
  /** Replaces the age under "via {recruiter}" (the employer's applicants · views). */
  footerNote?: ReactNode
  /** At the right of the footer: the dashboard's "Not interested". */
  footerAction?: ReactNode
  variant?: 'home'
}) {
  const m = jobRowModel(job)
  const home = variant === 'home'
  // HOME: ONE TYPE, ONE LINE. The card is a fixed 248px, and "South East
  // London, Greater London" beside "Flexible, Temporary" wraps to two lines
  // and pushed the footer out of the card (seen at 820 and 1280, 15 Nov). The
  // design draws the first type only ("Temporary"); the place truncates if it
  // must — the advert one tap away carries both in full.
  const firstType = Array.isArray(job.employmentType) ? job.employmentType[0] : job.employmentType
  const type = home ? (firstType || m.type) : m.type
  // Home: the chip slot is never empty — NEW, or the age in the same chip.
  const chip = home ? (m.isNew ? 'NEW' : (m.age || '').toUpperCase() || null) : (m.isNew ? 'NEW' : null)
  // Home: the age goes in the footer only when the chip is busy saying NEW.
  const footerLine = footerNote ?? (home ? (m.isNew ? m.age : null) : m.age)

  return (
    <div className={styles.card} data-variant={variant}>
      <div className={styles.top}>
        <div className={styles.topText}>
          {chip && <span className={styles.newChip}>{chip}</span>}
          {href
            ? <Link href={href} className={`${styles.title} ${styles.titleLink}`}>{m.title}</Link>
            : <span className={styles.title}>{m.title}</span>}
        </div>
        {corner && <div className={styles.corner}>{corner}</div>}
      </div>

      {m.pay && (
        <span className={styles.payLine}>
          <span className={styles.pay}>{m.pay.amount}</span>
          {m.pay.period && <span className={styles.period}>{m.pay.period}</span>}
          {m.pay.negotiable && <span className={styles.period}>(negotiable)</span>}
        </span>
      )}

      {(m.place || type) && (
        <span className={styles.placeLine}>
          {m.place && (
            <span className={`${styles.placeItem} ${styles.placeWhere}`}>
              <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
              </svg>
              <span className={styles.placeText}>{m.place}</span>
            </span>
          )}
          {m.place && type && <span className={styles.narrowDot} aria-hidden="true"> · </span>}
          {type && (
            <span className={`${styles.placeItem} ${styles.placeType}`}>
              <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
              <span className={styles.placeText}>{type}</span>
            </span>
          )}
        </span>
      )}

      <span className={styles.footer}>
        <span className={styles.footerText}>
          {m.via && <span className={styles.via}>{m.via}</span>}
          {footerLine && <span className={styles.age}>{footerLine}</span>}
        </span>
        {footerAction && <span className={styles.footerAction}>{footerAction}</span>}
      </span>
    </div>
  )
}
