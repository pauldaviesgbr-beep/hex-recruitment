'use client'

import type { Job } from '@/lib/mockJobs'
import JobTypeCard from '@/components/JobTypeCard'
import SaveJobButton from '@/components/SaveJobButton'
import cardStyles from '@/components/JobTypeCard.module.css'

// THE SMALL-LIST JOB CARD: the text-led 1a card (design_handoff_job_cards
// _text_led: "1a goes on the home page and anywhere showing 6 or fewer jobs";
// design 25: no images anywhere jobs appear; design 26 round 2).
//
// It is no longer one big <a>. The card's TITLE is the link, stretched over the
// card, so the controls design 26 puts on it — Save in the corner, "Not
// interested" in the footer — are real buttons beside the link rather than
// buttons inside it (which HTML does not allow, and which is why the
// dashboard's grey × used to float over the title).
//
// Used by the candidate dashboard's Recommended row (Save + Not interested),
// the employer dashboard's Active jobs (footerNote "N applicants · N views"),
// and the home page grid (variant="home", with Save).

export default function JobCardLink({
  job,
  className,
  href,
  footerNote,
  saved,
  onToggleSave,
  onNotInterested,
  variant,
}: {
  job: Job
  className?: string
  href?: string
  footerNote?: string
  saved?: boolean
  onToggleSave?: (job: Job) => void
  onNotInterested?: (job: Job) => void
  variant?: 'home'
}) {
  return (
    <div className={className}>
      <JobTypeCard
        job={job}
        href={href ?? `/job/${job.id}`}
        footerNote={footerNote}
        variant={variant}
        corner={onToggleSave ? <SaveJobButton saved={!!saved} onToggle={() => onToggleSave(job)} title={job.title} /> : undefined}
        footerAction={onNotInterested ? (
          <button type="button" className={cardStyles.textAction} aria-label={`Not interested in ${job.title}`} onClick={() => onNotInterested(job)}>
            Not interested
          </button>
        ) : undefined}
      />
    </div>
  )
}
