// Shared bits of the job card, so /jobs and /temp-work agree on them.
//
// formatJobSalary in particular: there are currently SEVEN local copies of a
// salary formatter across the job pages, all subtly different, and that habit is
// exactly how the roundup email ended up showing "£20–£31" for a rate that is
// actually £19.63–£31.38. Every page that renders the shared JobCard now gets
// the same one. The remaining local copies on the other job pages are a
// separate tidy-up — see the report; consolidating them all is its own job and
// touches six files that each need looking at.

import type { Job } from './mockJobs'
import type { FeedCardModel } from '@/components/FeedCard'
import { resolveJobBanner } from './jobBanner'
import { formatMoney } from './money'

/**
 * "3 days ago" and friends, as a number of days. Job.postedAt is already a
 * humanised string by the time it reaches a card, so this reads it back.
 */
export function getPostedDaysAgo(postedAt: string): number {
  const lower = (postedAt || '').toLowerCase()
  if (lower.includes('today') || lower.includes('just')) return 0
  if (lower.includes('yesterday')) return 1
  const match = lower.match(/(\d+)/)
  if (!match) return 999
  const num = parseInt(match[1], 10)
  if (lower.includes('hour')) return 0
  if (lower.includes('day')) return num
  if (lower.includes('week')) return num * 7
  if (lower.includes('month')) return num * 30
  return 999
}

/**
 * The card's pay line.
 *
 * Annual figures are shown in thousands because a card is scanned, not read —
 * "£82k/year" beats "£81,800 per annum" at a glance. Hourly rates are shown
 * exactly, because the pence are the difference between two agency shifts and a
 * chef comparing £19.63 with £20.00 is comparing real money.
 *
 * Job.salaryPeriod is already normalised to 'year' | 'hour' by
 * supabaseJobToJob, so this does NOT have to know that the database column says
 * 'annual' | 'hourly'. That mismatch between the two vocabularies is what broke
 * the email formatter; here it is handled at the mapper and must stay there.
 */
export function formatJobSalary(job: Job): string {
  if (!job.salaryMin && !job.salaryMax) return 'Competitive salary'
  const negotiable = (job.tags || []).includes('Salary negotiable') ? ' (negotiable)' : ''
  const single = !job.salaryMax || job.salaryMin === job.salaryMax

  // A DRAFT CAN CARRY A FIGURE BEFORE IT CARRIES A PERIOD, and this formatter's
  // else-branch is "year". Every STORED job has a period — the mapper normalises
  // it — so this is only ever reachable from the post-job preview, which renders
  // while the employer is still filling the form. Defaulting there showed them
  // "£32k/year" against a pay period they had not chosen, next to placeholders
  // that were obviously placeholders, so it read as a decision rather than a
  // gap. Show the figure and claim nothing until they pick.
  if (!job.salaryPeriod) {
    return single
      ? `${formatMoney(job.salaryMin)}${negotiable}`
      : `${formatMoney(job.salaryMin)}-${formatMoney(job.salaryMax)}${negotiable}`
  }

  if (job.salaryPeriod === 'hour') {
    return single
      ? `${formatMoney(job.salaryMin)}/hr${negotiable}`
      : `${formatMoney(job.salaryMin)}-${formatMoney(job.salaryMax)}/hr${negotiable}`
  }

  const k = (n: number) => `£${(n / 1000).toFixed(0)}k`
  return single
    ? `${k(job.salaryMin)}/year${negotiable}`
    : `${k(job.salaryMin)}-${k(job.salaryMax)}/year${negotiable}`
}

/**
 * A job as the shared card sees it.
 *
 * The card itself does no formatting and knows nothing about jobs — this is the
 * only place that decides what a job's badges, pay line and location read like.
 */
/**
 * THE SAME CARD, SEEN BY THE EMPLOYER WHO POSTED IT.
 *
 * /my-jobs used a dense one-line-per-job row. An employer had no idea what
 * their advert actually looked like to a candidate without opening the public
 * page — so the page where you manage adverts showed a different object from
 * the one you were managing.
 *
 * THIS REUSES cardModelFromJob's OUTPUT SHAPE ON PURPOSE, and both go through
 * the same FeedCard. If a badge, a pay line or a banner ever changes on the
 * board, it changes here in the same commit or the promise breaks silently.
 * The salary in particular: formatJobSalary exists because there were SEVEN
 * local copies disagreeing with each other, and a management page with an
 * eighth would be the worst place for the difference to live.
 *
 * WHAT THE EMPLOYER'S VERSION CANNOT KNOW. PostedJob is loaded straight off
 * `jobs` for one employer and carries no tags, no companyBanner, no
 * workLocationType and no isRecruiterPosting. Rather than invent them:
 *   · the banner falls back to the category art, exactly as a job with no
 *     banner does on the board — so this is the same fallback, not a
 *     different one;
 *   · "Easy apply" is OMITTED rather than assumed. It is computed from tags,
 *     and claiming it on a card whose advert requires a CV would be a promise
 *     to the employer about their own advert that the board would then break.
 */
export function cardModelFromPostedJob(job: {
  id: string
  title: string
  company: string
  companyLogo?: string
  location: string
  salaryMin: number
  salaryMax: number
  salaryPeriod: 'hour' | 'year'
  employmentType?: string[]
  category?: string
  postedDate: string
}): FeedCardModel {
  const employmentBadges = Array.isArray(job.employmentType) ? job.employmentType.slice(0, 2) : []

  // postedDate is an ISO date here, not the humanised string the board uses,
  // so getPostedDaysAgo cannot read it — it parses "3 days ago". Computed
  // directly instead of reformatting into a sentence just to parse it back.
  const days = (() => {
    const t = Date.parse(job.postedDate)
    if (Number.isNaN(t)) return 999
    return Math.floor((Date.now() - t) / 86_400_000)
  })()

  return {
    id: job.id,
    banner: resolveJobBanner({
      id: job.id, companyBanner: null, company: job.company, category: job.category,
    }),
    logo: job.companyLogo || null,
    company: job.company,
    companyNote: null,
    title: job.title,
    where: job.location,
    pay: formatJobSalary({
      salaryMin: job.salaryMin, salaryMax: job.salaryMax,
      salaryPeriod: job.salaryPeriod, tags: [],
    } as unknown as Job),
    isNew: days <= 2,
    badges: employmentBadges.map(label => ({ label })),
  }
}

export function cardModelFromJob(job: Job): FeedCardModel {
  const employmentBadges = Array.isArray(job.employmentType)
    ? job.employmentType.slice(0, 2)
    : (job.employmentType ? [job.employmentType] : [])
  const easyApply = !job.tags?.includes('CV required') && !job.tags?.includes('Cover letter required')

  return {
    id: job.id,
    banner: resolveJobBanner({
      id: job.id, companyBanner: job.companyBanner, company: job.company, category: job.category,
    }),
    logo: job.companyLogo || null,
    company: job.company,
    companyNote: job.isRecruiterPosting ? '· via recruiter' : null,
    title: job.title,
    where: `${job.location}${job.area ? `, ${job.area}` : ''}`,
    pay: formatJobSalary(job),
    isNew: getPostedDaysAgo(job.postedAt) <= 2,
    badges: [
      ...employmentBadges.map(label => ({ label })),
      ...(job.workLocationType ? [{ label: job.workLocationType }] : []),
      ...(job.urgent ? [{ label: 'Urgent' }] : []),
      ...(easyApply ? [{ label: 'Easy apply', accent: true }] : []),
    ],
  }
}
