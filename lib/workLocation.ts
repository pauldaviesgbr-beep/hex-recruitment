// THE work-location vocabulary. One list, one map, both sides of the market.
//
// This is lib/workTypes.ts's twin, and it exists because the same lesson was
// learned for that column and never applied to the one beside it. workTypes
// was written after SIX disagreeing copies of the work-TYPE vocabulary; nobody
// looked one field across. Work LOCATION had FOUR faults stacked on it, found
// 22–23 Aug 2026 after Paul's own phone showed him a board with one advert on
// it:
//
//   1. TWO VOCABULARIES, ONE PER SIDE OF THE MARKET. The employer form offers
//      "In person"; the candidate form offers "On-site". Same thing, different
//      word, and nothing mapped between them.
//   2. THE FILTER READ THE WRONG FIELD. The answer is in `jobs.work_location`
//      ("In person" on all 251 live adverts). The board filtered on `job.tags`,
//      a freely-typed column where "On-site" appears on ONE advert and
//      "Hybrid" and "Remote" on none.
//   3. STORED VALUES THE FORM CANNOT PRODUCE. A candidate profile holding
//      "In person" when the candidate form only ever writes "On-site".
//   4. AND THE "Work Arrangement" FILTER WAS NEVER APPLIED AT ALL — offered in
//      the UI, counted in the active-filter badge, referenced nowhere in the
//      predicate. It said a filter was on and filtered nothing.
//
// COST, COUNTED BEFORE THE FIX: of the eleven candidates who had set this
// preference, EIGHT had chosen "On-site" and were being shown a single advert
// out of 251. Not a corner case — three quarters of everyone who used the
// feature.
//
// "IN PERSON" WINS FOR DISPLAY (Paul, 23 Aug 2026). It is what 251 adverts
// say, what every employer typed, and what the job page already prints.
// "On-site" is an alias of it, not a separate value.
//
// AND NOTHING HERE MIGRATES A ROW. Stored values are mapped on READ. That is
// reversible, and it matters for a second reason: these strings are DISPLAYED,
// not only matched — components/CandidateDetail.tsx prints a candidate's
// preference verbatim to employers. Rewriting the rows would change what an
// employer reads on someone's card; mapping on read does not.
//
// `jobs.tags` IS DELIBERATELY UNTOUCHED. It is freely typed, other things
// render from it, and this module simply stops being the reason anybody reads
// it for work location.

/** The canonical values. "In person" is the one 251 live adverts use. */
export const WORK_LOCATIONS = ['In person', 'Remote', 'Hybrid'] as const
export type WorkLocation = (typeof WORK_LOCATIONS)[number]

/**
 * Every spelling anyone has ever stored, lowercased, mapped to its canonical
 * value.
 *
 * "on-site" and its variants are the candidate form's word for "In person".
 * Keep adding to this rather than rewriting rows: a value that appears here is
 * a value that keeps working for the people who already chose it.
 */
const ALIASES: Readonly<Record<string, WorkLocation>> = {
  'in person': 'In person',
  'in-person': 'In person',
  'onsite': 'In person',
  'on site': 'In person',
  'on-site': 'In person',
  'remote': 'Remote',
  'fully remote': 'Remote',
  'hybrid': 'Hybrid',
}

/**
 * Canonical value for anything stored, or null if it is not a work location.
 *
 * NULL IS A REAL ANSWER AND CALLERS MUST HANDLE IT. An unrecognised string is
 * not "In person" — defaulting an unknown to the commonest value is how a
 * mis-typed row would silently join the majority and stop being findable as
 * wrong.
 */
export function normaliseWorkLocation(raw: string | null | undefined): WorkLocation | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  if (!key) return null
  return ALIASES[key] ?? null
}

/** What a person reads. Unknown values are shown as stored rather than hidden. */
export function workLocationLabel(raw: string | null | undefined): string {
  return normaliseWorkLocation(raw) ?? (raw || '').trim()
}

/**
 * Does this job satisfy a work-location preference?
 *
 * Reads `workLocationType`, which lib/types.ts maps from `jobs.work_location`.
 * NOT `tags` — that was fault 2 and the whole reason this module exists.
 *
 * An unrecognised preference matches NOTHING rather than everything. The
 * relax-and-say rule then drops it and tells the candidate, which is the
 * honest outcome: better a named "we ignored this" than a filter that quietly
 * lets everything through and looks like it worked.
 */
export function jobMatchesWorkLocation(
  job: { workLocationType?: string | null },
  preference: string | null | undefined
): boolean {
  const want = normaliseWorkLocation(preference)
  if (!want) return false
  return normaliseWorkLocation(job.workLocationType) === want
}
