// Notify-then-flip: state and rules for making already-existing candidate
// profiles discoverable, with notice and a real chance to say no.
//
// The 22 hidden candidates never chose to be hidden — it was the old column
// default. So preserving it isn't respecting a preference. But it IS their
// profile being shown to strangers, which means it needs three things:
// notice, a genuine window, and a one-tap way out. This module encodes those
// three as rules rather than leaving them to the call site.
//
// One canonical shape, read and written through this one helper — the same
// discipline notification preferences needed after the flat-vs-nested repair.
// Nothing else should touch candidate_profiles.discoverability_notice.

/** The window a candidate has to say "keep me hidden" before the flip runs. */
export const OPT_OUT_WINDOW_DAYS = 14

const DAY_MS = 86_400_000

/** Canonical stored shape. Every field optional on read, always present on write. */
export interface DiscoverabilityNotice {
  /** ISO timestamp the notice was sent. NULL state = never notified. */
  notifiedAt: string | null
  /** ISO timestamp the opt-out window closes. Stored, not recomputed, so
   *  changing OPT_OUT_WINDOW_DAYS later can never shorten a window somebody
   *  was already promised. */
  deadlineAt: string | null
  /** ISO timestamp they asked to stay hidden. Set = permanently excluded. */
  optedOutAt: string | null
  /** ISO timestamp is_discoverable was actually set true by the flip step. */
  flippedAt: string | null
  /**
   * ISO timestamp we emailed them a SECOND time to say the first opt-out link
   * did not work. Set = told twice, and never eligible for a third.
   *
   * A separate field rather than a reset of notifiedAt, and that is the whole
   * point of it: notifiedAt is the only evidence of what we promised and when,
   * and the tempting way to make these eight selectable again is to clear it.
   */
  correctedAt: string | null
  channel: 'email' | null
}

export const EMPTY_NOTICE: DiscoverabilityNotice = {
  notifiedAt: null,
  deadlineAt: null,
  optedOutAt: null,
  flippedAt: null,
  correctedAt: null,
  channel: null,
}

/** The subset of a candidate row these rules need. */
export interface CandidateNoticeRow {
  user_id: string
  email: string | null
  full_name: string | null
  job_title: string | null
  cv_url: string | null
  is_discoverable: boolean
  discoverability_notice: unknown
}

/**
 * Normalise whatever is in the column into the canonical shape. Tolerant by
 * design: a malformed value must degrade to "never notified", which is the
 * safe direction — the flip step refuses to act on a row it can't prove was
 * notified.
 */
export function parseNotice(raw: unknown): DiscoverabilityNotice {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_NOTICE }
  const r = raw as Record<string, unknown>
  const iso = (v: unknown): string | null =>
    typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null
  return {
    notifiedAt: iso(r.notifiedAt),
    deadlineAt: iso(r.deadlineAt),
    optedOutAt: iso(r.optedOutAt),
    flippedAt: iso(r.flippedAt),
    correctedAt: iso(r.correctedAt),
    channel: r.channel === 'email' ? 'email' : null,
  }
}

// ── Eligibility ──────────────────────────────────────────────────────

/**
 * An empty profile helps nobody and looks bad to employers, so it stays
 * hidden. A job title OR a CV is enough to be worth showing; neither means
 * there is nothing to show.
 */
/**
 * Do we know what this person is called?
 *
 * Separate from hasSomethingToShow so the three gates can report WHY they
 * blocked. A candidate with a job title AND a CV but no name used to report
 * 'nothing-to-show', identically to somebody with an empty profile — and the
 * remedy is completely different: one needs asking their name, the other
 * needs to fill their profile in. That string is the only visibility anyone
 * has into why the flip skipped somebody.
 */
export function hasName(row: Pick<CandidateNoticeRow, 'full_name'>): boolean {
  return typeof row.full_name === 'string' && row.full_name.trim().length > 0
}

export function hasSomethingToShow(row: Pick<CandidateNoticeRow, 'full_name' | 'job_title' | 'cv_url'>): boolean {
  const filled = (v: string | null) => typeof v === 'string' && v.trim().length > 0
  // A NAME IS NOW REQUIRED, ALONGSIDE the job title or CV rather than
  // instead of them.
  //
  // Until 26 Aug 2026 the name was not checked at all, which was fine while
  // every signup path guaranteed one — the OAuth callbacks invented a name
  // from the email local-part when the provider gave none, so the column was
  // never empty. That invention has been removed (lib/displayName.ts): an
  // Apple relay address would otherwise have written a random ten-character
  // token as somebody's name. Now that full_name can legitimately be NULL,
  // this gate has to say so, or the first nameless profile becomes
  // discoverable and an employer browses a card with no name on it.
  //
  // MEASURED BEFORE ADDING IT: 51 discoverable candidates, 0 with an empty
  // name, 0 hidden with an empty name. Not one existing row changes state.
  // And structurally it could not hide anyone anyway — flipBlocker returns
  // 'already-discoverable' first, so the flip only ever reveals.
  return filled(row.full_name) && (filled(row.job_title) || filled(row.cv_url))
}

/** Who should receive the notice: hidden, worth showing, has an address, and
 *  hasn't already been sent one. */
export function isEligibleForNotice(row: CandidateNoticeRow): boolean {
  if (row.is_discoverable) return false
  if (!hasSomethingToShow(row)) return false
  if (!row.email || !row.email.trim()) return false
  const notice = parseNotice(row.discoverability_notice)
  if (notice.optedOutAt) return false
  return notice.notifiedAt === null
}

// ── The correction cohort ────────────────────────────────────────────
//
// A SEPARATE SELECTOR, NOT A REUSE OF isEligibleForNotice. That one ends
// `notifiedAt === null`, so everybody who needs the correction is excluded by
// it — and the tempting fix is to clear notifiedAt, which would destroy the
// only record of what we promised on 26 July.
//
// Written as its own function so the correction send can only ever reach
// people who WERE notified, have NOT opted out, and have NOT already been
// corrected. The old cohort and the correction cohort are disjoint by
// construction rather than by a mode flag someone might pass wrongly.

export type CorrectionExclusion =
  | 'not-notified'
  | 'opted-out'
  | 'already-corrected'
  | 'already-discoverable'
  | 'nothing-to-show'
  | 'no-name'
  | 'no-email'

/**
 * Why a candidate is not in the correction cohort, or null if they are.
 *
 * The last two matter as much as the first three: someone whose profile has
 * emptied since July would be told a date that the flip will refuse to act on
 * — flipBlocker returns 'nothing-to-show' — and promising a change we will not
 * make is the same class of fault as the link that did nothing.
 */
export function correctionExclusion(row: CandidateNoticeRow): CorrectionExclusion | null {
  const notice = parseNotice(row.discoverability_notice)
  if (!notice.notifiedAt) return 'not-notified'
  if (notice.optedOutAt) return 'opted-out'
  if (notice.correctedAt) return 'already-corrected'
  if (row.is_discoverable) return 'already-discoverable'
  if (!hasName(row)) return 'no-name'
  if (!hasSomethingToShow(row)) return 'nothing-to-show'
  if (!row.email || !row.email.trim()) return 'no-email'
  return null
}

export function isEligibleForCorrection(row: CandidateNoticeRow): boolean {
  return correctionExclusion(row) === null
}

/**
 * Why a hidden candidate is being skipped. Reporting the reason matters more
 * than the count — "13 excluded" is only meaningful if you can say why.
 */
export type ExclusionReason = 'already-discoverable' | 'nothing-to-show' | 'no-name' | 'no-email' | 'already-notified' | 'opted-out'

export function exclusionReason(row: CandidateNoticeRow): ExclusionReason | null {
  if (row.is_discoverable) return 'already-discoverable'
  if (!hasName(row)) return 'no-name'
  if (!hasSomethingToShow(row)) return 'nothing-to-show'
  if (!row.email || !row.email.trim()) return 'no-email'
  const notice = parseNotice(row.discoverability_notice)
  if (notice.optedOutAt) return 'opted-out'
  if (notice.notifiedAt) return 'already-notified'
  return null
}

// ── Transitions ──────────────────────────────────────────────────────

export function markNotified(now: Date = new Date()): DiscoverabilityNotice {
  return {
    notifiedAt: now.toISOString(),
    deadlineAt: new Date(now.getTime() + OPT_OUT_WINDOW_DAYS * DAY_MS).toISOString(),
    optedOutAt: null,
    flippedAt: null,
    correctedAt: null,
    channel: 'email',
  }
}

/**
 * The correction: they were notified, the opt-out link we gave them pointed at
 * a page that could not use it, and this records that we have told them so and
 * given them a fresh window.
 *
 * WRITES deadlineAt AND correctedAt. LEAVES notifiedAt ALONE — that timestamp
 * is the record of what we originally promised, and it is not ours to tidy.
 *
 * NEVER SHORTENS. The existing deadline is kept if it is somehow the later of
 * the two, for the same reason the field is stored rather than recomputed: a
 * window somebody was already promised cannot be taken back by a later run.
 */
export function markCorrected(
  current: DiscoverabilityNotice,
  now: Date = new Date(),
): DiscoverabilityNotice {
  const fresh = now.getTime() + OPT_OUT_WINDOW_DAYS * DAY_MS
  const existing = current.deadlineAt ? Date.parse(current.deadlineAt) : 0
  return {
    ...current,
    deadlineAt: new Date(Math.max(fresh, existing)).toISOString(),
    correctedAt: now.toISOString(),
  }
}

export function markOptedOut(current: DiscoverabilityNotice, now: Date = new Date()): DiscoverabilityNotice {
  // Idempotent: a candidate clicking the link twice keeps their first answer.
  if (current.optedOutAt) return current
  return { ...current, optedOutAt: now.toISOString() }
}

export function markFlipped(current: DiscoverabilityNotice, now: Date = new Date()): DiscoverabilityNotice {
  return { ...current, flippedAt: now.toISOString() }
}

// ── The flip gate ────────────────────────────────────────────────────

/** Every condition the flip must satisfy, and which one failed. */
export type FlipBlocker =
  | 'not-notified'
  | 'opted-out'
  | 'window-open'
  | 'already-flipped'
  | 'already-discoverable'
  | 'nothing-to-show'
  | 'no-name'

/**
 * The single gate the flip step must pass. Fail-closed: anything unexpected
 * blocks the flip rather than allowing it, because the cost of wrongly
 * flipping somebody is a privacy breach and the cost of wrongly skipping
 * them is that they stay as they already are.
 */
export function flipBlocker(row: CandidateNoticeRow, now: Date = new Date()): FlipBlocker | null {
  if (row.is_discoverable) return 'already-discoverable'
  // Re-checked at flip time, not just at notice time: a profile can be emptied
  // during the 14 days, and we promised not to show empty profiles.
  if (!hasName(row)) return 'no-name'
  if (!hasSomethingToShow(row)) return 'nothing-to-show'
  const notice = parseNotice(row.discoverability_notice)
  if (!notice.notifiedAt || !notice.deadlineAt) return 'not-notified'
  if (notice.optedOutAt) return 'opted-out'
  if (notice.flippedAt) return 'already-flipped'
  if (now.getTime() < Date.parse(notice.deadlineAt)) return 'window-open'
  return null
}

export function canFlip(row: CandidateNoticeRow, now: Date = new Date()): boolean {
  return flipBlocker(row, now) === null
}

/** e.g. "9 August 2026" — for the deadline line in the email. */
export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London',
  })
}
