// THE APPLICANTS LIST'S STAGES — ONE DEFINITION (design 24 section 4, design
// 25 decisions 2–6, Claude Design's answers of 15 Nov 2026).
//
// DISPLAY ONLY. The stored job_applications.status keeps its eleven historical
// spellings; nothing here rewrites a row. Decision 3: the five applications
// real employers moved to 'reviewing' show under New, and their stored status
// does not change.
//
// Read by: the Applicants list and applicant page (/applied), the Home
// Applicants group, the Not a fit route, and scripts/prove-applicants.ts.

export type ApplicantStage = 'new' | 'shortlisted' | 'interview' | 'offer' | 'hired' | 'not_a_fit' | 'withdrawn'

/** The stages the list shows, in order — the chips after "All". */
export const LISTED_STAGES = ['new', 'shortlisted', 'interview', 'offer'] as const
export type ListedStage = typeof LISTED_STAGES[number]

/** Employer-side labels. Candidates keep their own words (lib/applicationStatus). */
export const STAGE_LABEL: Record<ApplicantStage, string> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  not_a_fit: 'Not a fit',
  withdrawn: 'Withdrawn',
}

/** The five steps of the applicant page's progress line. */
export const PROGRESS_STAGES = ['new', 'shortlisted', 'interview', 'offer', 'hired'] as const

/** Stored status → stage. Unknown or empty reads as New, never as a later stage. */
export function stageOf(status: string | null | undefined): ApplicantStage {
  switch ((status || '').toLowerCase()) {
    case 'shortlisted': return 'shortlisted'
    case 'interview':
    case 'interviewing': return 'interview'
    case 'offered':
    case 'offer': return 'offer'
    case 'hired': return 'hired'
    case 'rejected': return 'not_a_fit'
    case 'withdrawn': return 'withdrawn'
    // pending, applied, viewed, reviewing, '' and anything unknown
    default: return 'new'
  }
}

export const isListed = (stage: ApplicantStage): stage is ListedStage =>
  (LISTED_STAGES as readonly string[]).includes(stage)

/** Every value job_applications_status_check allows — READ FROM pg_constraint
 *  on 15 Nov 2026 (the constraint predates the migration ledger, so no .sql in
 *  the repo holds it). If the constraint gains a value, add it here. */
export const DB_STATUSES = ['pending', 'applied', 'reviewing', 'viewed', 'interviewing', 'interview', 'shortlisted', 'hired', 'rejected', 'withdrawn', 'offered'] as const

/** The stored statuses of someone still waiting to hear back (New to Offer),
 *  derived from stageOf so the two can never disagree. A Not a fit can only be
 *  applied to a row in one of these. */
export const WAITING_STATUSES: string[] = DB_STATUSES.filter(s => isListed(stageOf(s)))

/**
 * The stage to SHOW. A Not a fit inside its Undo window is owed but not yet
 * applied: the stored status is still the old one (see the Not a fit route —
 * the status changes only when the update is sent, because changing it fires
 * the trigger that cancels interviews and withdraws offers, which no Undo can
 * put back). Everywhere that reads the owed column shows it as Not a fit.
 */
export function effectiveStage(status: string | null | undefined, dueAt?: string | null, sentAt?: string | null): ApplicantStage {
  const s = stageOf(status)
  return dueAt && !sentAt && isListed(s) ? 'not_a_fit' : s
}

/** The one next step per stage. `to` is the status written by a plain move;
 *  `flow` opens an existing form that moves the stage itself when it is done. */
export type NextStep =
  | { label: string; to: 'shortlisted' | 'hired' }
  | { label: string; flow: 'interview' | 'offer' }

export const NEXT_STEP: Record<ListedStage, NextStep> = {
  new: { label: 'Shortlist', to: 'shortlisted' },
  shortlisted: { label: 'Invite to interview', flow: 'interview' },
  interview: { label: 'Make offer', flow: 'offer' },
  offer: { label: 'Mark hired', to: 'hired' },
}

/** Whole days since the applicant entered their current stage. */
export function daysWaiting(stageEnteredAt: string | null | undefined, now: number = Date.now()): number | null {
  if (!stageEnteredAt) return null
  const t = new Date(stageEnteredAt).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((now - t) / 86_400_000))
}

/** Two weeks or more is shown in amber (#B45309). */
export const OVERDUE_DAYS = 14

/** "103d waiting", or "Today" once someone has been moved today. */
export function waitLabel(days: number | null): string {
  if (days === null) return ''
  return days === 0 ? 'Today' : `${days}d waiting`
}

// ── The toast (design 24, section 4; wording agreed 15 Nov 2026) ────────────
// The polite update is sent AFTER the Undo window, so the toast says it WILL
// be sent. "and sent them a polite update" was the design's first wording and
// would have been false for the six seconds it is on screen.
export const toastMoved = (name: string, stage: ApplicantStage) => `Moved ${name} to ${STAGE_LABEL[stage]}.`
export const toastNotAFit = (name: string) => `Marked ${name} as not a fit. We'll send them a polite update.`

/** How long Undo stays offered before the move (or the polite update) is final. */
export const UNDO_MS = 6000

// ── Empty states ────────────────────────────────────────────────────────────
export const EMPTY_ALL = 'No one is waiting. New applicants will show here.'
export const emptyStage = (stage: ListedStage) => `No one at ${STAGE_LABEL[stage]} right now.`

/** End states on the applicant page. */
export const HIRED_NOTE = 'Hired. Their job ad stays open until you close it.'
export const NOT_A_FIT_NOTE = 'Marked not a fit. We sent them a polite update.'
export const NOT_A_FIT_PENDING_NOTE = "Marked not a fit. We'll send them a polite update."
