/**
 * "IS THIS ADVERT STILL OPEN?" — REMINDERS FOR ADVERTS THAT HAVE BEEN RUNNING
 * A WHILE.
 *
 * WHY THIS EXISTS RATHER THAN EXPIRY — AND THE PREMISE HAS CHANGED.
 *
 * This used to read "employer-posted adverts expire at 60 days via
 * /api/cron/job-expiry". That was true of the code and false of the product.
 * Measured 24 Aug 2026: NO ROW HAS EVER CARRIED status 'expired'. The cron is
 * scheduled daily and reaches 2 of 247 live adverts, because it filters
 * `is_recruiter_posting = false` and 249 of them are recruiter postings.
 *
 * Paul has since ruled that Thrive HAS NO EXPIRY MECHANISM at all: an advert
 * leaves the board by 'filled' (a genuine Thrive hire) or 'archived'
 * (everything else). Removing the cron and the dead post-form field is its own
 * branch and has not landed yet, so the route still exists as this is written.
 *
 * NONE OF THAT WEAKENS THE CASE FOR REMINDERS — it strengthens it. Nothing
 * ages a listing out, so adverts accumulate for roles that closed weeks ago,
 * which is the complaint candidates have about every other job board. Goldenkeys
 * is reconciled weekly by its own scrape; Host is reconciled by hand; Collins
 * King, posting through the form, is reconciled by nobody.
 *
 * A reminder is the honest answer where expiry is not: we do not know the role
 * is filled, so we ask rather than assert. Closing stays the employer's
 * decision, which is also why nothing here ever changes a job's status.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHO THIS REACHES IS THE WHOLE RISK, so it is decided here, in a pure
 * function, where it can be read and asserted rather than discovered from a
 * mailbox.
 *
 * SCRAPED LISTINGS ARE EXCLUDED BY `source_url`, NOT BY `is_recruiter_posting`.
 * That flag is true for Goldenkeys, Host AND Collins King, so it cannot tell
 * "reconciled elsewhere" from "posted by a person" — it would have silenced
 * exactly the employers we want to ask. Every imported row carries a
 * source_url and no form-posted row does, which is a fact about what WROTE the
 * row rather than an inference about who owns it.
 *
 * ONE EMAIL PER EMPLOYER, NOT ONE PER ADVERT. Measured before building: a
 * 30-day rule today is due on 12 adverts belonging to a single employer. Twelve
 * separate emails would be the feature's first impression and its last.
 */

/** How long an advert runs before we ask about it. */
export const REMIND_AFTER_DAYS = 30

/** And how long before we ask the same employer about the same advert again. */
export const REMIND_AGAIN_AFTER_DAYS = 30

/** Nobody gets more than this many adverts listed in one email. */
export const MAX_ADS_LISTED = 10

export interface ReminderJobRow {
  id: string
  title: string
  status: string
  posted_at: string | null
  source_url: string | null
  last_reminder_sent_at: string | null
  employer_id: string
  views?: number | null
  application_count?: number | null
}

export interface EmployerReminder {
  employerId: string
  jobs: ReminderJobRow[]
  /** True when more adverts were due than the email will list. */
  truncated: boolean
}

/**
 * Is this one advert due a reminder? PURE, and every clause is a reason
 * somebody could disagree with — which is why it is here and not inline in a
 * cron handler.
 */
export function isDueForReminder(job: ReminderJobRow, now: Date): boolean {
  // Only live adverts. A closed or filled one needs nothing from anybody.
  if (job.status !== 'active') return false

  // Reconciled elsewhere — see the note above. Never ours to ask about.
  if (job.source_url && job.source_url.trim()) return false

  // No posting date means we cannot say how long it has run, and guessing
  // "long enough" is how someone gets asked about an advert from yesterday.
  if (!job.posted_at) return false
  const postedMs = Date.parse(job.posted_at)
  if (Number.isNaN(postedMs)) return false
  const ageDays = (now.getTime() - postedMs) / 86_400_000
  if (ageDays < REMIND_AFTER_DAYS) return false

  // Asked recently enough already.
  if (job.last_reminder_sent_at) {
    const lastMs = Date.parse(job.last_reminder_sent_at)
    if (!Number.isNaN(lastMs)) {
      const sinceDays = (now.getTime() - lastMs) / 86_400_000
      if (sinceDays < REMIND_AGAIN_AFTER_DAYS) return false
    }
  }

  return true
}

/**
 * Group the due adverts into one reminder per employer, newest advert first so
 * the list reads sensibly when it is capped.
 */
export function groupReminders(jobs: ReminderJobRow[], now: Date): EmployerReminder[] {
  const due = jobs.filter(j => isDueForReminder(j, now))
  const byEmployer = new Map<string, ReminderJobRow[]>()
  for (const j of due) {
    const list = byEmployer.get(j.employer_id) || []
    list.push(j)
    byEmployer.set(j.employer_id, list)
  }
  // Array.from rather than spreading the iterator: the tsconfig target here
  // does not allow downlevel iteration, and this file must compile as it is
  // rather than move the goalposts for the whole project.
  return Array.from(byEmployer.entries())
    .map(([employerId, list]) => {
      const sorted = [...list].sort(
        (a, b) => Date.parse(b.posted_at || '0') - Date.parse(a.posted_at || '0'))
      return {
        employerId,
        jobs: sorted.slice(0, MAX_ADS_LISTED),
        // NO SILENT CAPS. If more were due than are listed, the email says so —
        // an employer with fifteen stale adverts being shown ten and told
        // nothing would reasonably think the other five are fine.
        truncated: sorted.length > MAX_ADS_LISTED,
      }
    })
    .sort((a, b) => b.jobs.length - a.jobs.length)
}

/** Whole days an advert has been live, for the copy. */
export function daysLive(job: ReminderJobRow, now: Date): number {
  if (!job.posted_at) return 0
  return Math.floor((now.getTime() - Date.parse(job.posted_at)) / 86_400_000)
}

/**
 * The subject line. Names the count because an employer with one stale advert
 * and one with nine are having different conversations.
 */
export function reminderSubject(reminder: EmployerReminder): string {
  return reminder.jobs.length === 1
    ? 'Is this role still open?'
    : `Are these ${reminder.jobs.length} roles still open?`
}

/**
 * The body, as plain text.
 *
 * IT ASSERTS NOTHING IT CANNOT SEE. It says how long the advert has been live
 * and what it has had — views and applications, both numbers we hold — and then
 * asks. It does not suggest the role is filled, does not imply the advert is
 * underperforming, and never mentions money: the founding-cohort offer is the
 * only money claim allowed anywhere and it has no business in a housekeeping
 * email.
 */
export function reminderBody(reminder: EmployerReminder, now: Date, baseUrl: string): string {
  const lines: string[] = []
  lines.push(
    reminder.jobs.length === 1
      ? 'One of your adverts has been running for a while:'
      : 'Some of your adverts have been running for a while:')
  lines.push('')

  for (const j of reminder.jobs) {
    const days = daysLive(j, now)
    const views = typeof j.views === 'number' ? j.views : 0
    const apps = typeof j.application_count === 'number' ? j.application_count : 0
    lines.push(`  ${j.title}`)
    lines.push(
      `    ${days} days live · ${views} ${views === 1 ? 'view' : 'views'} · ` +
      `${apps} ${apps === 1 ? 'application' : 'applications'}`)
    lines.push('')
  }

  if (reminder.truncated) {
    lines.push(`(Only the ${MAX_ADS_LISTED} most recent are listed — there are more.)`)
    lines.push('')
  }

  lines.push('If they are still open, there is nothing to do — they stay live.')
  lines.push('If any are filled, closing them keeps your applications tidy and')
  lines.push('stops candidates applying for roles that have gone.')
  lines.push('')
  lines.push(`Manage your adverts: ${baseUrl}/my-jobs`)
  return lines.join('\n')
}
