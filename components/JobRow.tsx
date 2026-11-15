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

import type { ReactNode } from 'react'
import type { Job } from '@/lib/mockJobs'
import { jobRowModel } from '@/lib/jobCard'
import SaveJobButton from '@/components/SaveJobButton'
import styles from './JobRow.module.css'

export interface JobRowProps {
  job: Job
  onSelect?: (job: Job) => void
  saved?: boolean
  onToggleSave?: (job: Job) => void
  applied?: boolean
  shortlisted?: boolean
  /** The open job in a list-and-detail page (sector, city, recommended, saved). */
  selected?: boolean
  /** A grey chip on line 3 after the age: "99% match" on Recommended
   *  (design 26: not in the right column, and not yellow). */
  tag?: string
  /** A further quiet line under line 3: "Saved 2 days ago" on Saved jobs. */
  extra?: ReactNode
  /** The home page's phone rows (design 26, A): line 3 reads
   *  "via {recruiter} · age" in place of type below 768 too — the home page is
   *  a teaser, and the recruiter is what a candidate recognises. */
  viaLine?: boolean
}

export default function JobRow({ job, onSelect, saved, onToggleSave, applied, shortlisted, selected, tag, extra, viaLine }: JobRowProps) {
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
  const tagChip = tag && <>{' '}<span className={styles.tagChip}>{tag}</span></>
  const hasSave = typeof onToggleSave === 'function'

  return (
    // No Save, no right-hand column: the right padding then equals the left
    // (design 26), instead of the 6px kept for the bookmark's own 44px box.
    <div className={`${styles.row} ${selected ? styles.selected : ''} ${hasSave ? '' : styles.noSave}`}>
      <button type="button" className={styles.main} onClick={onSelect ? () => onSelect(job) : undefined} disabled={!onSelect} aria-current={selected ? 'true' : undefined}>
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

        {/* Below 768: type · age (or via · age on the home page) */}
        <span className={`${styles.line3} ${styles.narrowOnly}`}>
          {viaLine
            ? <>{m.via}{m.via && m.age && dot}{m.age}{own}{tagChip}</>
            : <><span className={styles.pair}>{m.type}{m.type && m.age && dot}{m.age}</span>{own}{tagChip}</>}
        </span>
        {/* From 768: via {recruiter} · age */}
        <span className={`${styles.line3} ${styles.wideOnly}`}>
          {m.via}{m.via && m.age && dot}{m.age}{own}{tagChip}
        </span>
        {extra && <span className={styles.line3}>{extra}</span>}
      </button>

      {hasSave && <SaveJobButton saved={!!saved} onToggle={() => onToggleSave!(job)} title={m.title} />}
    </div>
  )
}
