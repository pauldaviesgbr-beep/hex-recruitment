// DOES THIS ADVERT'S STORED SALARY INCLUDE A SERVICE CHARGE?
//
// Goldenkeys publish one headline figure that FOLDS base plus service charge,
// and the importer stores that headline in salary_min/salary_max. There is no
// base column and there never was. WE IMPORT AS THEY PUBLISH AND WE DO NOT EDIT
// THEIR ADVERTS — their number is theirs.
//
// THE ADVERT ITSELF IS ALREADY HONEST. /job/[id], the inline pane on /jobs and
// JobDetailModal all render the `benefits` list, so anyone who OPENS an advert
// reads "£45,000 per annum plus £7,000 service charge" in Goldenkeys' own
// words. The gap is only in our SUMMARIES, where the figure travels with no
// advert body: the board card, the aggregator feed, og:description, the
// roundup email and the apply modal.
//
// ── WHAT THIS MODULE IS AND IS NOT ──────────────────────────────────────────
//
// It owns the DECISION and the WORDS. It deliberately does NOT reformat the
// number, and that is a judgement worth stating rather than discovering:
//
//   JobCardLink          "£52k"
//   lib/jobsFeed         "£52,000 / year"
//   lib/jobMeta          "£75,000/yr"
//   lib/jobDigest        its own
//   ApplyNowModal        "£45,000 - £52,000 per year"
//
// Five formatters that already disagree. Unifying them would change what the
// board LOOKS like, which is a design decision and not this one. So each
// surface keeps its own number and appends the qualifier this module returns.
// When somebody does unify them, this module is where the decision already
// lives and nothing here has to move.
//
// ── THE RULE: THE QUALIFIER IS EARNED, PER ADVERT ───────────────────────────
//
// Never "it is Goldenkeys, therefore add the words". Measured 17 Sept 2026
// across all 119 live adverts:
//
//   67  stored figure is ABOVE the first £ figure the advert's own benefits
//       text quotes           -> the qualifier is EARNED
//   30  stored figure EQUALS the quoted figure -> NO QUALIFIER. Saying
//       "including service charge" on a plain base is a NEW false statement,
//       and it UNDERSTATES the job. That is the opposite mistake and just as
//       bad.
//   22  no quoted figure in benefits at all (20 Host, 1 Goldenkeys, 1 Collins
//       King) -> NO QUALIFIER. We cannot qualify what we cannot read.
//
// SO THE RISK IS OVER-APPLYING, NOT UNDER-APPLYING — a blanket rule would read
// true because most adverts happen to fit it. salaryqualifier:prove fails in
// that direction specifically.
//
// ── HOST IS OUT OF SCOPE UNTIL ADRIAN ANSWERS ───────────────────────────────
//
// lib/rolesRoundup.ts says "Host stores base in min and the package in max".
// Host's 20 live adverts carry NO benefits text and never mention a service
// charge, so nothing we hold can confirm or deny it. They fall out of this
// rule naturally — no quoted figure, no qualifier — and that is the correct
// behaviour while the question is open. Acting on an unverified code comment
// is the fault this project keeps recording.

/** One advert, in the shape every caller already has. */
export interface QualifiableJob {
  salary_min?: number | string | null
  salary_max?: number | string | null
  benefits?: string[] | string | null
}

/** The words. One place, so five surfaces cannot drift into five wordings. */
export const SERVICE_CHARGE_QUALIFIER = 'including service charge'

/**
 * The first £ figure of four digits or more in an advert's own benefits text,
 * or null if there is none to read.
 *
 * FOUR DIGITS IS THE POINT, not tidiness: benefits routinely mention "£300 per
 * month" for live-in accommodation and "20% bonus", and a three-digit match
 * would make a £300 rent look like the base and mark almost every advert as
 * folded. Same reasoning as the importer's own `>= 1000` filter.
 *
 * FIRST, not smallest: Goldenkeys write the base first and the service charge
 * second — "£45,000 per annum plus £7,000 service charge". Taking the smallest
 * would pick the service charge itself.
 */
export function quotedBaseFrom(benefits: QualifiableJob['benefits']): number | null {
  if (!benefits) return null
  const text = Array.isArray(benefits) ? benefits.join(' \n ') : String(benefits)
  const m = text.match(/£\s*([0-9][0-9,]{3,})/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) && n >= 1000 ? n : null
}

/**
 * Does the stored figure include a service charge, on the evidence of this
 * advert's own words?
 *
 * TRUE only when there is a quoted figure AND the stored figure is above it.
 * Equal means the stored figure IS the base. Absent means we do not know, and
 * "do not know" must render exactly like "no service charge" rather than
 * guessing — a candidate cannot tell the difference between a missing
 * qualifier and an absent one, so the only safe default is silence.
 */
export function salaryIncludesServiceCharge(job: QualifiableJob): boolean {
  const quoted = quotedBaseFrom(job.benefits)
  if (quoted === null) return false
  const stored = Number(job.salary_min ?? job.salary_max)
  if (!Number.isFinite(stored) || stored <= 0) return false
  return stored > quoted
}

/**
 * The qualifier to append, or null when none is earned.
 *
 * THE HIGHER NUMBER STAYS THE NUMBER — Paul's decision. The shape is
 * "£52,000 including service charge", never "£45,000 + service charge". The
 * point is that the figure stops being bare, not that it becomes smaller.
 */
export function salaryQualifier(job: QualifiableJob): string | null {
  return salaryIncludesServiceCharge(job) ? SERVICE_CHARGE_QUALIFIER : null
}

/**
 * A formatted salary with the qualifier appended when it is earned.
 *
 * Takes the surface's OWN formatted figure, so the board can keep "£52k" and
 * the feed can keep "£52,000 / year" while both agree about the words and
 * about when they apply.
 */
export function withSalaryQualifier(formatted: string | null, job: QualifiableJob): string | null {
  if (!formatted) return formatted
  const q = salaryQualifier(job)
  return q ? `${formatted} ${q}` : formatted
}
