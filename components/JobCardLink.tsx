'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Job } from '@/lib/mockJobs'
import JobTypeCard from '@/components/JobTypeCard'

// THE SMALL-LIST JOB CARD, NOW THE TEXT-LED 1a CARD (design_handoff_job_cards
// _text_led: "1a goes on the home page and anywhere showing 6 or fewer jobs";
// design 25, 15 Nov 2026: no images anywhere jobs appear). It used to wrap the
// board's image-led markup — a banner or the branded panel, a scrim, a logo
// chip — and carried the SEVENTH local salary formatter, which printed
// "£19.63–£31.38/hr" one way and the board another. Both are gone: the card
// reads lib/jobCard's shared model.
//
// Used by the candidate dashboard's Recommended row and the employer
// dashboard's Active jobs. The whole card is the link; `children` still render
// beside the card inside it (the dashboard's "Not interested" button is
// positioned against its own list item), and `footerNote` replaces the age —
// the employer sees "N apps · N views" there.

export default function JobCardLink({
  job,
  className,
  children,
  href,
  footerNote,
}: {
  job: Job
  className?: string
  children?: ReactNode
  href?: string
  footerNote?: ReactNode
}) {
  return (
    <Link href={href ?? `/job/${job.id}`} className={className}>
      {/* A child (the dashboard's "Not interested") floats in the corner, so
          the card keeps that 44×44 slot free and the title wraps before it. */}
      <JobTypeCard job={job} footerNote={footerNote} reserveCorner={!!children} />
      {children}
    </Link>
  )
}
