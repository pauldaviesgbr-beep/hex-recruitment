'use client'

import type { Job } from '@/lib/mockJobs'
import JobRow from '@/components/JobRow'

// The job board card — NOW THE TEXT-LED 1b ROW (design_handoff_job_cards_text_led;
// design 25: no images anywhere jobs appear). It kept its name and its props so
// every caller (/jobs, the post-job preview, the jobs in the /temp-work feed)
// changes in one place. The photo card it replaced was <FeedCard>, which still
// draws shifts and the employer's job ads until their own step on this branch.
//
// `boosted` is accepted and no longer drawn: on the photo card it was a yellow
// ring, and the text-led spec has no boost treatment.

export interface JobCardProps {
  job: Job
  onSelect?: (job: Job) => void
  /** Save control. Omit both and no bookmark button renders — /temp-work does
   *  not carry save state today. */
  saved?: boolean
  onToggleSave?: (job: Job) => void
  applied?: boolean
  shortlisted?: boolean
  boosted?: boolean
}

export default function JobCard({
  job, onSelect, saved, onToggleSave, applied, shortlisted,
}: JobCardProps) {
  return (
    <JobRow
      job={job}
      onSelect={onSelect}
      saved={saved}
      onToggleSave={onToggleSave}
      applied={applied}
      shortlisted={shortlisted}
    />
  )
}
