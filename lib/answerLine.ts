import { ANSWER_LINE_STALL_DAYS, CANDIDATE_NO_NEWS_DAYS, viewCountsAreComparable } from '@/lib/constants/dashboard'
import { daysInStage } from '@/lib/stageDuration'
import type { AnswerLineModel } from '@/components/AnswerLine'

// THE EMPLOYER SENTENCE TABLE. Evaluated in order; the first true row wins.
//
// Kept out of the component and out of the page so it can be read as a table
// and reasoned about without a browser. The order IS the product decision —
// it encodes what the employer should look at first — and it should be
// arguable by reading twenty lines rather than by tracing JSX.
//
// ROWS 3 AND 4 (interview today/tomorrow, unread messages) ARE NOT HERE YET.
// Each needs a query the employer dashboard does not currently make, and four
// rows working beats six half-wired. They slot in at their numbered positions
// when the queries land — the gaps are deliberate, not an oversight.

export interface EmployerAnswerState {
  /** Longest-stalled shortlisted candidate, if any. */
  stalled?: { name: string; days: number } | null
  /** Applications created since the employer last opened this dashboard. */
  newApplications: number
  /** Ads the employer has ever posted, any status. */
  totalJobs: number
  /** Ads currently live. */
  activeJobs: number
  /** Views in the last 7 days. Held back until the counts are comparable. */
  viewsThisWeek?: number | null
}

/**
 * A person's name, or an honest fallback.
 *
 * MESS TOLERANCE. Half these rows come from scraped listings and half-finished
 * profiles, so a name can be null, empty, or the string "undefined" written by
 * an earlier import. Any sentence naming a person has to survive all three
 * without printing them at the employer.
 */
function personName(raw: string | null | undefined): string | null {
  const s = (raw || '').trim()
  if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return null
  return s
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

// ── "nothing live right now", in two registers ──────────────────────
//
// ONE FACT, TWO PLACES ON THE SAME PAGE, ONE ROOT STRING. The answer line says
// it at the top; the Active Jobs panel's empty state says it again ~800px down.
//
// The first draft shared the WHOLE sentence, which fixed drift and created
// repetition: the same twenty-word line twice on a page whose entire purpose is
// to say things once. So the panel now takes the short form. They share the
// opening clause, which is what makes them read as the same fact rather than
// two — and they cannot drift, because there is one definition of that clause.
//
// The register is set by the neighbours, not by taste: every other empty state
// in that column is "No messages yet." and "No candidates".
const NOTHING_LIVE = 'Nothing live right now'

/** Panel register. Four words, to sit beside "No messages yet." */
export function nothingLiveShort(): string {
  return `${NOTHING_LIVE}.`
}

/**
 * Answer-line register: "Nothing live right now — your 4 roles are filled or
 * closed." Names the cause, because this is the line that has to carry the
 * whole state on its own.
 *
 * NOT a general-purpose formatter — it assumes the caller has established that
 * the employer has posted before and has nothing live now.
 */
export function nothingLiveSentence(totalJobs: number): string {
  const roles = totalJobs === 1 ? 'role is' : `${totalJobs} roles are`
  return `${NOTHING_LIVE} — your ${roles} filled or closed.`
}

export function employerAnswerLine(state: EmployerAnswerState): AnswerLineModel {
  const name = personName(state.stalled?.name)
  const stalledDays = state.stalled?.days ?? 0
  const isStalled = !!state.stalled && stalledDays >= ANSWER_LINE_STALL_DAYS
  const hasNew = state.newApplications > 0

  // ROWS 1 + 2 COMBINED. Where both are true the spec asks for one sentence of
  // at most two clauses, because two separate lines is two things to read and
  // the whole point is that there is one.
  if (isStalled && hasNew) {
    const n = state.newApplications
    const who = name
      ? `${name} has been shortlisted for ${stalledDays} ${plural(stalledDays, 'day', 'days')}`
      : `someone has been shortlisted for ${stalledDays} ${plural(stalledDays, 'day', 'days')}`
    return {
      eyebrow: 'Today',
      sentence: `${n} new ${plural(n, 'application', 'applications')}, and ${who}.`,
      action: { label: 'Review applications', href: '/applied' },
    }
  }

  // ROW 1 — a candidate has sat in shortlisted long enough that not deciding
  // has become the decision.
  if (isStalled) {
    return {
      eyebrow: 'Today',
      sentence: name
        ? `${name} has been shortlisted for ${stalledDays} ${plural(stalledDays, 'day', 'days')}.`
        : `A candidate has been shortlisted for ${stalledDays} ${plural(stalledDays, 'day', 'days')}.`,
      action: { label: 'Review applications', href: '/applied' },
    }
  }

  // ROW 2 — new since they last looked.
  if (hasNew) {
    const n = state.newApplications
    return {
      eyebrow: 'Today',
      sentence: `${n} new ${plural(n, 'application', 'applications')}.`,
      action: { label: 'Review applications', href: '/applied' },
    }
  }

  // ROW 5 — day one. Names the cause rather than the absence.
  if (state.totalJobs === 0) {
    return {
      eyebrow: 'Today',
      sentence: 'Nothing needs you yet. Post a role and applications will land here.',
      action: { label: 'Post a job', href: '/post-job' },
    }
  }

  // ROW 5b — POSTED BEFORE, NOTHING LIVE NOW. A row of its own, sitting between
  // 5 and 6 because it belongs to neither.
  //
  // It shipped inside row 6 and read "All quiet. nothing running right now." —
  // a lowercase word after a full stop, which is how it was noticed. But the
  // capital was the smaller half of the fault. Row 6's contract is SILENCE IS A
  // LEGITIMATE ANSWER, DELIBERATELY NO BUTTON, and that was written for ads
  // live with nothing pending. An employer with an empty board is not in that
  // state: they have the single most important thing on the platform to do, and
  // answering them with "all quiet" and no action tells them to relax at the
  // exact moment the page should be handing them a button.
  //
  // The state that comes LATER — every ad eventually filled — is the one nobody
  // looked at, which CLAUDE.md now records for the fourth time.
  if (state.activeJobs === 0) {
    return {
      eyebrow: 'Today',
      sentence: nothingLiveSentence(state.totalJobs),
      action: { label: 'Post a job', href: '/post-job' },
    }
  }

  // ROW 6 — SILENCE IS A LEGITIMATE ANSWER AND TAKES ONE LINE, NOT FIVE PANELS.
  // Deliberately no button: there is nothing to do, and offering an action
  // would manufacture one. That claim is only true now that 5b has taken the
  // empty-board case out from under it.
  //
  // ads IS GUARANTEED >= 1 HERE — row 5 returned on totalJobs === 0 and row 5b
  // on activeJobs === 0. The zero branch that used to live in this clause is
  // deleted rather than left as a defensive fallback: an unreachable branch is
  // exactly what this one was mistaken for while it was quietly reachable, and
  // keeping a second, worse sentence for a state 5b now owns is how the two
  // drift apart.
  //
  // The views clause is held until view counts are comparable — before 11
  // August a seven-day window straddles the morning anonymous views started
  // counting, and "{v} views this week" would read as a result when most of it
  // is the instrument being fixed. The sentence is complete without it.
  const ads = state.activeJobs
  const adsClause = `${ads} ${plural(ads, 'ad', 'ads')} running`

  const showViews = viewCountsAreComparable() && typeof state.viewsThisWeek === 'number' && state.viewsThisWeek > 0
  return {
    eyebrow: 'Today',
    sentence: showViews
      ? `All quiet. ${adsClause}, ${state.viewsThisWeek} ${plural(state.viewsThisWeek!, 'view', 'views')} this week.`
      : `All quiet. ${adsClause}.`,
  }
}

// ══════════════════════════════════════════════════════════════════════
// THE CANDIDATE SENTENCE TABLE
// ══════════════════════════════════════════════════════════════════════
//
// Same component as the employer side, different table — which is the whole
// reason item 1 was built as a table plus a presentation component rather than
// as one page-shaped lump. The employer's question is "what needs me today";
// the candidate's is "what do I do next". Neither page answered its own
// question above the fold.
//
// Evaluated in order; the first true row wins. The ORDER IS THE PRODUCT
// DECISION, and it should be arguable by reading it rather than by tracing JSX.

export interface CandidateAnswerState {
  /** Applications this candidate has made, any status. */
  applicationCount: number
  /** Most recent status change, if any — the newest row of statusChangeEvents. */
  lastStatusChange?: { jobTitle: string | null; company: string | null; status: string; at: string } | null
  /** The next interview on the books, if one is scheduled. */
  nextInterview?: { company: string | null; jobTitle: string | null; date: string | null } | null
  /** Unread messages across all conversations. */
  unreadMessages: number
  /** 0–100. Rows 5 and 6 split on whether this is finished. */
  profileCompletionPct: number
  /** Roles matching this candidate posted in the last 7 days. Already computed
   *  for the recommendations panel — row 4 costs no new query. */
  newMatchesThisWeek: number
}

const STATUS_SENTENCE: Record<string, string> = {
  reviewing: 'is being reviewed',
  shortlisted: 'has been shortlisted',
  interview: 'has moved to interview',
  offered: 'has an offer',
  hired: 'has been accepted',
  rejected: 'was not taken forward',
}

/** A company or role name, or null — same mess tolerance as the employer side. */
function cleanName(raw: string | null | undefined): string | null {
  const s = (raw || '').trim()
  if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return null
  return s
}

export function candidateAnswerLine(state: CandidateAnswerState): AnswerLineModel {
  // ROW 1 — SOMETHING MOVED. The single most useful thing a job-seeker can be
  // told, and the thing they open the page hoping for. Fourteen days, not the
  // employer's three: a fortnight of silence is normal in hiring, and calling an
  // application stalled after three days would alarm rather than help. Both
  // numbers are declared side by side in lib/constants/dashboard.ts.
  if (state.lastStatusChange && daysInStage(state.lastStatusChange.at) <= CANDIDATE_NO_NEWS_DAYS) {
    const what = STATUS_SENTENCE[state.lastStatusChange.status?.toLowerCase()] || 'has been updated'
    const where = cleanName(state.lastStatusChange.company) || cleanName(state.lastStatusChange.jobTitle)
    return {
      eyebrow: 'Today',
      sentence: where
        ? `Your application to ${where} ${what}.`
        : `One of your applications ${what}.`,
      action: { label: 'View applications', href: '/applications' },
    }
  }

  // ROW 2 — AN INTERVIEW IS BOOKED. Below a status change only because a status
  // change is news and this is a commitment they already know about; it still
  // outranks everything below.
  if (state.nextInterview) {
    const who = cleanName(state.nextInterview.company) || cleanName(state.nextInterview.jobTitle)
    return {
      eyebrow: 'Today',
      sentence: who ? `You have an interview with ${who} coming up.` : 'You have an interview coming up.',
      action: { label: 'See details', href: '/applications' },
    }
  }

  // ROW 3 — UNREAD MESSAGES. An employer has written and is waiting.
  if (state.unreadMessages > 0) {
    const n = state.unreadMessages
    return {
      eyebrow: 'Today',
      sentence: `${n} unread ${plural(n, 'message', 'messages')}.`,
      action: { label: 'Open messages', href: '/messages' },
    }
  }

  // ROW 5 — NOTHING APPLIED FOR, PROFILE UNFINISHED. Names the blocker rather
  // than the absence: an incomplete profile is why the matching is poor, and
  // "browse jobs" would send them off to be badly matched.
  if (state.applicationCount === 0 && state.profileCompletionPct < 100) {
    return {
      eyebrow: 'Today',
      sentence: `Your profile is ${state.profileCompletionPct}% complete. Finishing it is what gets you matched.`,
      action: { label: 'Finish profile', href: '/profile' },
    }
  }

  // ROW 6 — NOTHING APPLIED FOR, PROFILE DONE. They have done everything asked
  // of them, so the only honest next step is the board.
  if (state.applicationCount === 0) {
    return {
      eyebrow: 'Today',
      sentence: 'Your profile is ready. Now find a role worth applying for.',
      action: { label: 'Browse jobs', href: '/jobs' },
    }
  }

  // ROW 4 — APPLICATIONS IN, NO NEWS. THE COMMON CASE, and the reason this
  // table is worth having at all: with a board that is mostly scraped listings
  // and few employers replying, most candidates most weeks are here. An empty
  // panel says "nothing happened"; this says what did, and pivots to the one
  // thing still worth doing.
  //
  // Last rather than first because every row above it is actual news. This is
  // the honest answer when there is none.
  const n = state.applicationCount
  const m = state.newMatchesThisWeek
  const first = `${n} ${plural(n, 'application', 'applications')}, no news yet.`
  return {
    eyebrow: 'Today',
    sentence: m > 0
      ? `${first} ${m} new ${plural(m, 'role', 'roles')} ${plural(m, 'matches', 'match')} you this week.`
      : first,
    action: m > 0
      ? { label: 'See matches', href: '/jobs' }
      : { label: 'Browse jobs', href: '/jobs' },
  }
}

// ───────────────────────── THE CANDIDATES DIRECTORY ─────────────────────────
//
// Third table, same component. The employer's question here is not "what needs
// me today" but "is there anybody in this list worth my afternoon" — and the
// honest answer on a young board is usually "fewer than the count suggests".
//
// ROW 1 IS THE WHOLE POINT: IT COUNTS WHAT'S USABLE, NOT WHAT EXISTS. Stating
// the shortfall in the same breath as the total is what stops a grid of sparse
// cards reading as a page that failed to load. 21 candidates, 10 with a CV.

export interface CandidatesAnswerState {
  /** Candidates matching the filters currently applied. */
  totalMatching: number
  /** How many of those have a CV attached — the usable subset. */
  withCvCount: number
  /** Labels of the filters currently applied, search included. */
  activeFilters: string[]
  /**
   * The single filter whose removal yields the most results, if any does.
   * Free to compute: the page loads every candidate once and filters in a
   * client-side memo, so this is array work rather than a query per filter.
   */
  bestFilterToDrop?: { label: string; resultCount: number } | null
  /** True when there is nobody to find at all, filters or no filters. */
  poolIsEmpty: boolean
  /** Named in row 4 so the emptiness is attributed rather than global. */
  sector?: string | null
}

export function candidatesAnswerLine(state: CandidatesAnswerState): AnswerLineModel {
  const eyebrow = 'MATCHING YOUR FILTERS'
  const n = state.totalMatching
  const m = state.withCvCount

  // ROW 1 — results, and some of them cannot be assessed yet.
  //
  // The action operates on the m, not the n, which is the reason it exists.
  // It was specified as "Message the {m}" and that control has nothing behind
  // it: bulk messaging does not exist, and /messages resolves ONE participant.
  // So it applies a filter the page already has instead — real, instant, and
  // more useful than opening ten threads at once.
  if (n > 0 && m < n) {
    return {
      eyebrow,
      sentence: `${n} ${n === 1 ? 'candidate' : 'candidates'} available now. ${m} ${m === 1 ? 'has' : 'have'} a CV.`,
      action: m > 0 ? { label: `Show the ${m} with a CV` } : undefined,
    }
  }

  // ROW 2 — results, all of them assessable. NO ACTION, deliberately.
  //
  // The design gave this row "Message all", which is the same missing feature
  // as row 1's original action — and here there is no filter to fall back on,
  // because everybody already passes it. A quiet row is the honest outcome:
  // there is nothing to say beyond the count and nothing to do but read it.
  if (n > 0) {
    return {
      eyebrow,
      sentence: `${n} ${n === 1 ? 'candidate' : 'candidates'} available now.`,
    }
  }

  // ROW 3 — nothing matches, but something would if one filter went.
  if (state.bestFilterToDrop && state.bestFilterToDrop.resultCount > 0) {
    const { label, resultCount } = state.bestFilterToDrop
    return {
      eyebrow,
      sentence: `Nobody matches all ${state.activeFilters.length} ${state.activeFilters.length === 1 ? 'filter' : 'filters'}. ${resultCount} ${resultCount === 1 ? 'is' : 'are'} available if you drop “${label}”.`,
      action: { label: `Drop “${label}”` },
    }
  }

  // ROW 4 — nothing matches and there is nothing to match. The only row that
  // sends them somewhere else, because the answer isn't on this page.
  if (state.poolIsEmpty) {
    const where = cleanName(state.sector)
    return {
      eyebrow,
      sentence: where
        ? `No candidates in ${where} yet. Post a role and we'll show applicants here as they arrive.`
        : `No candidates yet. Post a role and we'll show applicants here as they arrive.`,
      action: { label: 'Post a job', href: '/post-job' },
    }
  }

  // CATCH-ALL — zero results, filters applied, and dropping any single one
  // still yields nothing. Rows 3 and 4 both miss this and it is reachable with
  // two filters that only exclude each other, so it is written down rather
  // than left to render an empty shell.
  return {
    eyebrow,
    sentence: state.activeFilters.length
      ? `Nobody matches all ${state.activeFilters.length} ${state.activeFilters.length === 1 ? 'filter' : 'filters'}.`
      : 'Nobody is available right now.',
  }
}
