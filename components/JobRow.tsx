'use client'

/**
 * 1b — THE TEXT-LED BOARD ROW (design_handoff_job_cards_text_led, 16 Oct 2026;
 * design 25, 15 Nov 2026: no images anywhere jobs appear).
 *
 * No image, no logo. Order: role → pay → place · type → "via {recruiter}" ·
 * age. Below 768: line 2 is pay · place, line 3 is type · age. From 768: line
 * 2 is pay · place · type, line 3 is via {recruiter} · age. Both lines are in
 * the markup; CSS shows the right pair, so the two widths read one model.
 *
 * THE WHOLE ROW OPENS THE JOB and Save is a separate 44×44 target: the row's
 * button is stretched over the row (::after) and Save sits above it, so a tap
 * on the bookmark never opens the advert and a tap anywhere else always does.
 *
 * Applied / Shortlisted are the candidate's own facts about this job and stay,
 * as words at the end of the last line (the spec has no slot for them; they
 * were stamps on the photo card).
 */

import type { Job } from '@/lib/mockJobs'
import { jobRowModel } from '@/lib/jobCard'
import styles from './JobRow.module.css'

export interface JobRowProps {
  job: Job
  onSelect?: (job: Job) => void
  saved?: boolean
  onToggleSave?: (job: Job) => void
  applied?: boolean
  shortlisted?: boolean
}

export default function JobRow({ job, onSelect, saved, onToggleSave, applied, shortlisted }: JobRowProps) {
  const m = jobRowModel(job)
  const pay = m.pay && (
    <span className={styles.pay}>
      {m.pay.amount}{m.pay.period ? ` ${m.pay.period}` : ''}
      {m.pay.negotiable && <span className={styles.negotiable}> (negotiable)</span>}
    </span>
  )
  const dot = <span className={styles.dot} aria-hidden="true"> · </span>
  const own = (applied || shortlisted) && (
    <>{dot}<span className={styles.own}>{shortlisted ? 'Shortlisted' : 'Applied'}</span></>
  )

  return (
    <div className={styles.row}>
      <button type="button" className={styles.main} onClick={onSelect ? () => onSelect(job) : undefined} disabled={!onSelect}>
        <span className={styles.titleLine}>
          <span className={styles.title}>{m.title}</span>
          {m.isNew && <span className={styles.newChip}>NEW</span>}
        </span>

        {/* Below 768: pay · place */}
        <span className={`${styles.line2} ${styles.narrowOnly}`}>
          {pay}{pay && m.place && dot}{m.place}
        </span>
        {/* From 768: pay · place · type */}
        <span className={`${styles.line2} ${styles.wideOnly}`}>
          {pay}{pay && m.place && dot}{m.place}{m.type && <>{dot}{m.type}</>}
        </span>

        {/* Below 768: type · age */}
        <span className={`${styles.line3} ${styles.narrowOnly}`}>
          <span className={styles.pair}>{m.type}{m.type && m.age && dot}{m.age}</span>{own}
        </span>
        {/* From 768: via {recruiter} · age */}
        <span className={`${styles.line3} ${styles.wideOnly}`}>
          {m.via}{m.via && m.age && dot}{m.age}{own}
        </span>
      </button>

      {typeof onToggleSave === 'function' && (
        <button
          type="button"
          className={styles.save}
          aria-pressed={!!saved}
          aria-label={saved ? `Unsave ${m.title}` : `Save ${m.title}`}
          onClick={e => { e.stopPropagation(); onToggleSave(job) }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 21l-6-4.5L6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5z" />
          </svg>
        </button>
      )}
    </div>
  )
}
