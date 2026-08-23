// NO PREFERENCE MAY SILENTLY EMPTY THE BOARD.
//
// Paul, on his own phone, 22 Aug 2026: signed in, tapped through to the job
// board, and got "No jobs match your search" with a Hybrid chip he never
// pressed. His profile carries a Hybrid work-location preference, /jobs
// pre-applied it, and EVERY ONE of the 251 live adverts is In person — so the
// one personalised feature on the product could only ever return nothing, for
// the people who had already bothered to join.
//
// THE FAULT WAS NOT THE PREFERENCE, IT WAS THAT NOBODY ASKED WHAT IT WOULD
// MATCH. The sector pre-set beside it already had the right guard —
//
//     // Only pre-set sector if it has matching jobs — otherwise show all
//     const hasMatchingJobs = jobs.some(j => j.category === match.id)
//
// — and the work-style pre-set two lines above it did not. Somebody had this
// exact idea, applied it to one of the two preferences, and moved on. That is
// the same "fixed the instance, missed the class" shape as the location line
// and the dangling comma, so this is written as the RULE rather than as a
// second copy of that guard:
//
//   · a preference that would return zero is DROPPED, not honoured
//   · the page SAYS which one it dropped, in the candidate's words
//   · the stored preference is KEPT — we broaden past hospitality eventually
//     and it will matter then
//
// SILENT SUPPRESSION WAS THE OTHER OPTION AND IT IS WORSE. A filter that
// secretly does nothing teaches the candidate that their preferences are
// ignored, without ever telling them why they are seeing on-site roles.
//
// CUMULATIVE AND ORDER-SENSITIVE, DELIBERATELY. Each surviving preference
// narrows the pool the next one is tested against, so two preferences that are
// individually fine but jointly empty do not slip through — the second one is
// the one that gets relaxed, and the candidate is told about that one.

/**
 * One candidate preference, expressed as something that can be tested against
 * the real board rather than assumed to match.
 */
import { jobMatchesWorkLocation, workLocationLabel } from './workLocation'
import { getJobSector } from './jobSector'

export type PrefFilter<J> = {
  /** Stable name for the preference — 'workStyle', 'sector', 'salaryFloor'. */
  key: string
  /** What the candidate chose, as they would recognise it: 'Hybrid'. */
  value: string
  /**
   * What the page says when this one is dropped. The candidate's words, and it
   * must explain WHY, not merely announce the fact — "we ignored your filter"
   * with no reason reads as a bug.
   */
  message: string
  predicate: (job: J) => boolean
}

export type ResolvedPrefs<J> = {
  /** Preferences that survive — safe to apply, in this order. */
  applied: PrefFilter<J>[]
  /** Preferences dropped because honouring them would show nothing. */
  relaxed: PrefFilter<J>[]
  /** The jobs left after every applied preference. Never empty unless the board is. */
  matched: J[]
  /**
   * True when no decision could be made because there was nothing to test
   * against — the first render, before the board has loaded.
   *
   * THIS FLAG IS THE WHOLE SAFETY OF THE FUNCTION. Without it an empty `jobs`
   * array looks identical to "every preference matches nothing", so the very
   * first paint would relax everything and announce it, and the candidate
   * would be told their preferences were ignored on a page that had simply not
   * finished loading. Callers must do nothing while this is true.
   */
  undecided: boolean
}

/**
 * Decide which of a candidate's preferences the board can actually honour.
 *
 * Never returns an empty `matched` for a non-empty board: a preference is only
 * applied if something survives it.
 */
export function resolvePrefFilters<J>(jobs: J[], prefs: PrefFilter<J>[]): ResolvedPrefs<J> {
  if (!jobs || jobs.length === 0) {
    return { applied: [], relaxed: [], matched: [], undecided: true }
  }

  const applied: PrefFilter<J>[] = []
  const relaxed: PrefFilter<J>[] = []
  let pool = jobs

  for (const pref of prefs) {
    const next = pool.filter(pref.predicate)
    if (next.length > 0) {
      applied.push(pref)
      pool = next
    } else {
      relaxed.push(pref)
    }
  }

  return { applied, relaxed, matched: pool, undecided: false }
}

/**
 * The sentence the banner shows. One relaxed preference reads as a sentence;
 * more than one reads as a list, because "we ignored 2 preferences" is a
 * number and not an explanation.
 */
export function relaxedPrefsMessage<J>(relaxed: PrefFilter<J>[]): string | null {
  if (relaxed.length === 0) return null
  if (relaxed.length === 1) return relaxed[0].message
  return relaxed.map(r => r.message).join(' ')
}

/**
 * The work-location preference, as a testable filter.
 *
 * Hospitality is on site and that is a property of OUR BOARD, not of the idea —
 * so the message says so plainly rather than implying the candidate chose
 * badly. When Thrive broadens, this preference starts matching and the message
 * simply stops appearing.
 */
export function workStylePref<J extends { workLocationType?: string | null }>(value: string): PrefFilter<J> {
  const label = workLocationLabel(value)
  return {
    key: 'workStyle',
    value: label,
    // THE MESSAGE NAMES THE CANONICAL LABEL, NOT THE STORED STRING. A candidate
    // who stored "On-site" is told about "In person", because that is the word
    // the board and the job pages use and being told we ignored a preference
    // you cannot see anywhere would read as a bug.
    message: `We've ignored your ${label} preference — the roles on Thrive right now are all on site.`,
    // READS work_location, NOT tags. Filtering on tags matched ONE advert out
    // of 251, which is why eight candidates saw a board with a single job on
    // it. See lib/workLocation.ts for the four stacked faults behind that.
    predicate: (job: J) => jobMatchesWorkLocation(job, value),
  }
}

/**
 * The industry preference, as a testable filter.
 *
 * CALLS THE SAME CLASSIFIER THE BOARD DOES, and that is the whole point of the
 * change. This used to test `job.category` directly while the board's category
 * filter called getJobSector — two predicates for one question, so the resolver
 * could decide "the sector matches, apply it" and the board could then show
 * something different. It never emptied a board in practice, because 235 of 251
 * adverts agreed under both, but it is the same fault as everything else this
 * week and I named it against myself rather than leave it on a list.
 */
export function sectorPref<J extends { title?: string | null; category?: string | null }>(
  value: string,
  label: string
): PrefFilter<J> {
  return {
    key: 'sector',
    value: label,
    message: `We've ignored your ${label} preference — there are no ${label} roles live at the moment.`,
    predicate: (job: J) => getJobSector({ title: job.title || '', category: job.category || undefined }) === value,
  }
}
