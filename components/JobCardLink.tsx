'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Job } from '@/lib/mockJobs'
import { resolveJobBanner } from '@/lib/jobBanner'
import { selectQuote } from '@/lib/jobQuote'
import BrandedJobFallback from '@/components/BrandedJobFallback'
import CompanyLogo from '@/components/CompanyLogo'
import jobStyles from '@/app/jobs/page.module.css'
import { formatJobLocation } from '@/lib/jobCard'

// Single-source image-led job card. The card visual lives in /jobs
// (page.module.css `jobCard*` classes); this wraps that exact markup so the
// home-page strip (FeaturedJobs) and the dashboard "Recommended" row share ONE
// card instead of duplicating it. Links to the cold-safe /job/<id> page.
// `children` is an optional overlay slot (e.g. a dismiss button) rendered inside
// the card — overlay controls must call preventDefault/stopPropagation so they
// don't trigger the card's navigation.

function formatSalary(job: Job): string {
  const single = !job.salaryMax || job.salaryMin === job.salaryMax
  if (job.salaryPeriod === 'hour') {
    return single ? `£${job.salaryMin}/hr` : `£${job.salaryMin}–£${job.salaryMax}/hr`
  }
  return single
    ? `£${Math.round(job.salaryMin / 1000)}k`
    : `£${Math.round(job.salaryMin / 1000)}k–£${Math.round(job.salaryMax / 1000)}k`
}

export default function JobCardLink({
  job,
  className,
  children,
  href,
}: {
  job: Job
  className?: string
  children?: ReactNode
  // Optional tap target. Defaults to the candidate apply page /job/<id> (so the
  // candidate dashboard + FeaturedJobs are unchanged); the employer dashboard
  // passes /post-job?edit=<id> to manage its own post instead.
  href?: string
}) {
  const banner = resolveJobBanner({
    id: job.id,
    companyBanner: job.companyBanner,
    company: job.company,
    category: job.category,
  })
  const initial = (job.company || '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <Link href={href ?? `/job/${job.id}`} className={className}>
      <div className={`${jobStyles.jobCard} ${banner ? '' : jobStyles.jobCardFallback}`}>
        {banner ? (
          <div className={jobStyles.cardBg} style={{ backgroundImage: `url(${banner})` }} aria-hidden="true" />
        ) : (
          <BrandedJobFallback
            company={job.company}
            brandColour={job.brandColour}
            quote={selectQuote(job)}
            tags={job.tags}
          />
        )}
        <div className={jobStyles.cardScrim} aria-hidden="true" />
        <div className={jobStyles.cardContent}>
          <div className={jobStyles.cardCompanyRow}>
            {/* NO AVATAR WITHOUT A PHOTOGRAPH — the branded panel carries no
                logo anywhere, and three of the five real marks are illegible at
                this size anyway. Same rule as FeedCard; both cards use these
                same styles, so they have to agree. */}
            {banner && (
              <span className={jobStyles.cardChip}>
                {job.companyLogo ? (
                  <CompanyLogo src={job.companyLogo} alt={job.company} className={jobStyles.cardChipImg} />
                ) : (
                  initial
                )}
              </span>
            )}
            <span className={jobStyles.cardCompany}>
              {job.company}
              {job.isRecruiterPosting && <span className={jobStyles.cardViaRecruiter}> · via recruiter</span>}
            </span>
          </div>
          <h3 className={jobStyles.cardRole}>{job.title}</h3>
          <div className={jobStyles.cardMeta}>
            <span>{formatJobLocation(job)}</span>
            <span className={jobStyles.cardDot}>·</span>
            <span className={jobStyles.cardSalary}>{formatSalary(job)}</span>
          </div>
        </div>
        {children}
      </div>
    </Link>
  )
}
