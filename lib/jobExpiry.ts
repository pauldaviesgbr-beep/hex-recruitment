/**
 * How long an employer-posted ad stays live.
 *
 * ONE CONSTANT, TWO READERS, and that is the whole reason it exists as a file:
 *
 *   /api/cron/job-expiry   closes the ad and emails the employer at this age
 *   lib/jobPostingLd       publishes it to Google as validThrough
 *
 * If those two ever disagree, we tell Google a listing expires on a date we do
 * not act on — or act on a date we never published. The number was a bare 60
 * in the cron route before this.
 *
 * RECRUITER POSTINGS ARE EXEMPT FROM BOTH. The Goldenkeys scrape reconciles its
 * own listings weekly and is the authority on whether a vacancy is still live,
 * so expiring them on our clock would overrule it — and wouldn't stick, since
 * the scrape rewrites status while posted_at is only ever written on insert.
 * The same reasoning applies to what we publish: see hasHonestExpiry below.
 */
export const JOB_EXPIRY_DAYS = 60

/**
 * Does this job actually expire on our clock?
 *
 * Only employer-posted ads do. For a recruiter posting the answer is no, and
 * publishing a validThrough for one would be a date nothing will honour — and
 * worse than merely untrue: Google stops showing a posting after validThrough,
 * so a 60-day date on a listing the scrape keeps alive would REMOVE OUR OWN
 * LIVE JOBS from the results while they are still on the board.
 *
 * That is not hypothetical. Every one of the 246 live rows today is a recruiter
 * posting, and 23 of them pass 60 days on 18 August 2026.
 */
export function hasHonestExpiry(isRecruiterPosting: boolean | null | undefined): boolean {
  return isRecruiterPosting === false
}

/** ISO 8601, as Google expects. null when the job has no honest expiry. */
export function validThroughIso(
  postedAt: string | null,
  isRecruiterPosting: boolean | null | undefined,
): string | null {
  if (!hasHonestExpiry(isRecruiterPosting) || !postedAt) return null
  const t = Date.parse(postedAt)
  if (Number.isNaN(t)) return null
  return new Date(t + JOB_EXPIRY_DAYS * 86_400_000).toISOString()
}
