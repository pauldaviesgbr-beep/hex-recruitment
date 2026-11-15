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
import { selectQuote } from './jobQuote'

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
// formatJobSalary LIVED HERE AND IS GONE (design 26, round 2: "pay becomes
// required"). It printed "£42k/year" with a hyphen, and "Competitive salary"
// for a job with no pay — the phrase the home page's "the salary on every one"
// cannot coexist with. Its last callers (the app API and the post-job preview)
// read jobPay below. A DRAFT WITH NO PERIOD YET still shows the figure and
// claims no period: jobPay returns period null for it, as this did.

/**
 * THE TEXT-LED CARDS' PAY (design_handoff_job_cards_text_led, 16 Oct 2026;
 * design 25). The amount is set bold and the period follows IN WORDS — "a year",
 * "an hour" — and a job with no pay has NO pay line: never "Competitive". So
 * this returns parts, or null, and the card decides the type.
 *
 * The only pay formatter for a job (formatJobSalary is gone; see above).
 *
 * ABOVE ZERO, NOT MERELY PRESENT. Two live rows once carried a literal 0 in
 * both columns (CLAUDE.md, "not-null and above-zero are different questions"),
 * and "£0k a year" is a claim. Annual figures are in thousands, with one
 * decimal when not a whole thousand (payThousands); hourly
 * rates keep their pence. A draft with no period yet shows the figure alone.
 */
export type JobPay = { amount: string; period: 'a year' | 'an hour' | null; negotiable: boolean }

/**
 * THE SHORT FORM'S ANNUAL FIGURE: "£42k", "£41.8k" (design 26, round 2 follow-
 * up: "card pay must not round"). £41,800 printed "£42k" on the card beside
 * "£41,800 a year" on the advert — a £200 overstatement on every card. Whole
 * thousands stay whole; anything else keeps ONE decimal.
 *
 * TRUNCATED, NOT ROUNDED, to the hundred: £41,960 reads "£41.9k". Rounding
 * would print "£42k" — a whole thousand the figure is not, which is the exact
 * fault this replaces — and would overstate the pay by up to £50. The short
 * form may lose a few pounds; it never adds any. Used by the website's cards
 * and rows (jobPay) AND the app's (lib/appApi appPay), so the two cannot drift.
 */
export function payThousands(n: number): string {
  const tenths = Math.floor(Math.round(n) / 100) / 10
  return `£${Number.isInteger(tenths) ? tenths : tenths.toFixed(1)}k`
}

/**
 * `full`: THE ADVERT PAGE'S FORM (design 26, round 2). Cards and rows keep the
 * short "£42k–£48k a year"; the advert views — the job page, the board's
 * slide-in, the advert modal, the list-and-detail panels and the post-job
 * preview — show whole figures, "£42,000–£48,000 a year". Hourly rates read
 * the same either way ("£17.85–£20 an hour"). One function, so the two forms
 * can never disagree about which figures a job has.
 */
export function jobPay(job: { salaryMin?: number | null; salaryMax?: number | null; salaryPeriod?: 'hour' | 'year' | null; tags?: string[] | null }, opts: { full?: boolean } = {}): JobPay | null {
  const min = job.salaryMin && job.salaryMin > 0 ? job.salaryMin : 0
  const max = job.salaryMax && job.salaryMax > 0 ? job.salaryMax : 0
  if (!min && !max) return null
  const lo = min || max
  const hi = max || min
  const annual = job.salaryPeriod === 'year'
  // Thousands are grouped here, not in the shared formatMoney (which every
  // email and shift card uses): "£30000" reads as a typo.
  const grouped = (n: number) => (n >= 1000 ? `£${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}` : formatMoney(n))
  const fmt = (n: number) => (annual && !opts.full ? payThousands(n) : grouped(n))
  // Compared AS PRINTED: £41,800 and £42,000 are different numbers and the
  // same "£42k", and "£42k–£42k" is what a local formatter put on the sector
  // page's advert (seen 15 Nov 2026).
  const amount = hi <= lo || fmt(lo) === fmt(hi) ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`
  return {
    amount,
    period: job.salaryPeriod === 'hour' ? 'an hour' : annual ? 'a year' : null,
    negotiable: (job.tags || []).includes('Salary negotiable'),
  }
}

/** "£50k–£60k a year" as one string, for alt text and checks. */
export const jobPayText = (p: JobPay | null) =>
  p ? `${p.amount}${p.period ? ` ${p.period}` : ''}${p.negotiable ? ' (negotiable)' : ''}` : ''

/**
 * THE ONE EMPLOYMENT TYPE A FIXED-HEIGHT CARD HAS ROOM FOR (the home page's
 * 1a card; design 26, round 2). Picked BY MEANING, not by the order the advert
 * lists them: Host lists "Flexible, Temporary", and "Flexible" says least.
 * Priority: Temporary, Part-time, Full-time, Fixed-term, Contract. Flexible
 * only when it is the only value; anything else (Permanent…) when none of the
 * priority types is there.
 */
const TYPE_PRIORITY = ['temporary', 'part-time', 'full-time', 'fixed-term', 'contract']
export function primaryEmploymentType(types: readonly string[] | string | null | undefined): string | null {
  const list = (Array.isArray(types) ? types : types ? [types as string] : []).filter(Boolean) as string[]
  if (!list.length) return null
  const key = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, '-')
  for (const want of TYPE_PRIORITY) {
    const hit = list.find(t => key(t) === want)
    if (hit) return hit
  }
  return list.find(t => key(t) !== 'flexible') ?? list[0]
}

/**
 * A JOB AS THE TEXT-LED CARDS SEE IT — the 1b board row and the 1a card read
 * the same model, so they "read as one family" (the handoff) and cannot drift.
 * Order: role → pay → place · type → "via {recruiter}" · age. No image, no
 * logo, anywhere a job appears (Paul, 16 Oct and 15 Nov 2026).
 *
 * NEW means posted in the last 48 hours. The board's job carries a humanised
 * posted string, not a timestamp, so "Today" or "Yesterday" is the nearest
 * honest reading (getPostedDaysAgo ≤ 1). The old image card used ≤ 2, which
 * counted up to three days as new.
 */
export type JobRowModel = {
  id: string
  title: string
  pay: JobPay | null
  place: string
  type: string | null
  via: string | null
  age: string
  isNew: boolean
}

export function jobRowModel(job: Job): JobRowModel {
  const types = Array.isArray(job.employmentType)
    ? job.employmentType
    : (job.employmentType ? [job.employmentType as unknown as string] : [])
  return {
    id: job.id,
    title: job.title,
    pay: jobPay(job),
    place: formatJobLocation(job),
    type: types.length ? types.join(', ') : null,
    via: job.company ? `via ${job.company}` : null,
    age: job.postedAt || '',
    isNew: getPostedDaysAgo(job.postedAt) <= 1,
  }
}

/**
 * THE PLACE LINE — "Bath, Somerset", but never "London, London".
 *
 * NINE PLACES BUILT THIS STRING INDEPENDENTLY, all of them
 * `${location}${area ? ', ' + area : ''}`, and every one of them printed the
 * town twice whenever `area` already began with it. On the live board that is
 * ELEVEN ACTIVE ADVERTS: ten reading "London, London" and one reading
 * "London, London E9 5EN". Exactly the habit that produced seven disagreeing
 * salary formatters, so this goes beside formatJobSalary rather than being
 * patched in the one place someone happened to notice.
 *
 * WHY THE PREFIX TEST AND NOT AN EQUALITY TEST. Ricci's advert has location
 * "London" and area "London E9 5EN" — not equal, still a repeat. When the area
 * already opens with the town, the area is the more specific of the two and is
 * shown alone; the postcode is worth keeping and design's own frame has it.
 *
 * WHY IT IS NOT A DATA FIX. `area` is PRINTED verbatim on every card, board and
 * job page, and these are real employer rows. The 243 imported rows pair a town
 * with a county — "Bath" with "Somerset" — which is correct and must keep its
 * comma. Rewriting the column would risk all of those to fix eleven; a display
 * rule risks none.
 */
export function formatJobLocation(job: { location?: string | null; area?: string | null }): string {
  const location = (job.location || '').trim()
  const area = (job.area || '').trim()
  if (!area) return location
  if (!location) return area
  // Case-insensitive, because "london E9 5EN" against "London" is the same repeat.
  if (area.toLowerCase().startsWith(location.toLowerCase())) return area
  return `${location}, ${area}`
}

/**
 * The location line on the JOB PAGE, which has a street address the cards do not.
 *
 * THE JOB PAGE NEVER USED formatJobLocation AND STILL SHOWED A DANGLING COMMA.
 * The fix above removed "London, London" from the cards; the job page has its
 * own inline ternary, and its address branch was a raw template literal —
 * `${addressLine1}, ${city} ${postcode}` — with no filter for the parts that are
 * missing. So a job whose address is only a town rendered "London,  ": the town,
 * a comma pointing at nothing, and two trailing spaces. Read out of the served
 * DOM on 22 Aug 2026, not inferred.
 *
 * IT WAS ON 226 OF 251 LIVE ADVERTS, because that branch is not the rare one —
 * it is the ONLY one. lib/types.ts synthesises a fullLocation from `location`
 * when the column is null (`{ addressLine1: location, city: '', postcode: '' }`),
 * so `fullLocation?.addressLine1` is truthy for every job in the table and the
 * else-branch beside it is unreachable on the job page. A discriminator that is
 * always true is not a discriminator.
 *
 * WHY AN EMPTY CITY FALLS ALL THE WAY BACK. A synthesised address is not an
 * address — it is the town wearing an address's shape. Returning `addressLine1`
 * alone would print "Bath" and silently drop "Somerset", which is the pairing
 * the 243 imported rows carry. So when there is no city and no postcode we defer
 * to formatJobLocation, which knows about the town/area pair and its repeats.
 * Checked against the data before choosing that: of the 25 live adverts with a
 * real full_location, 24 carry a city or a postcode and ZERO carry an address
 * line without one, so nothing real is lost by falling back.
 */
export function formatJobAddress(job: {
  location?: string | null
  area?: string | null
  fullLocation?: { addressLine1?: string | null; city?: string | null; postcode?: string | null } | null
}): string {
  const full = job.fullLocation
  const line1 = (full?.addressLine1 || '').trim()
  // City and postcode read as one line — "Bath BA1 1AA", space not comma.
  const cityLine = [full?.city, full?.postcode]
    .map(part => (part || '').trim())
    .filter(Boolean)
    .join(' ')

  if (!cityLine) return formatJobLocation(job)
  return [line1, cityLine].filter(Boolean).join(', ')
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
 * `jobs` for one employer and carries no tags, no workLocationType and no
 * isRecruiterPosting. Rather than invent them, "Easy apply" is OMITTED rather
 * than assumed: it is computed from tags, and claiming it on a card whose
 * advert requires a CV would be a promise to the employer about their own
 * advert that the board would then break.
 *
 * THE BANNER IS NOT IN THAT LIST, and this comment used to say it was. It
 * claimed PostedJob had no companyBanner and that the card "falls back to the
 * category art" — both false. The column was in the row the whole time
 * (/my-jobs does select('*')), it simply was not mapped, and there has been no
 * category art since resolveJobBanner stopped guessing stock images: the
 * fallback is the branded Thrive card. So the comment described a limitation
 * that did not exist, in a product that no longer had the thing it named, and
 * it read as a reason not to look. Fixed 20 Aug 2026 — see
 * scripts/prove-employer-card.mjs, which asks the one question our own
 * fixtures cannot answer.
 */
export function cardModelFromPostedJob(job: {
  id: string
  title: string
  company: string
  companyLogo?: string
  companyBanner?: string | null
  location: string
  salaryMin: number
  salaryMax: number
  salaryPeriod: 'hour' | 'year'
  employmentType?: string[]
  category?: string
  postedDate: string
  /* The no-photograph panel's three inputs. All optional: an employer whose
     advert has a photograph never reaches them, and /my-jobs must keep working
     against a row loaded before these columns existed. */
  brandColour?: string | null
  fullDescription?: string | null
  description?: string | null
  tags?: string[] | null
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
      // WAS HARD-CODED null, which made resolveJobBanner return null every
      // time, so every employer card rendered the branded fallback while the
      // board rendered the employer's real photograph for the same advert.
      // Reported 20 Aug 2026: "the image on the job card in manage job ads
      // doesn't show but it shows in browse jobs". The column was in the row
      // all along — /my-jobs does select('*') — it just was not mapped.
      id: job.id, companyBanner: job.companyBanner ?? null, company: job.company, category: job.category,
    }),
    logo: job.companyLogo || null,
    company: job.company,
    companyNote: null,
    title: job.title,
    where: job.location,
    // The shared short form; no pay → no pay line (never "Competitive salary").
    pay: jobPayText(jobPay({ salaryMin: job.salaryMin, salaryMax: job.salaryMax, salaryPeriod: job.salaryPeriod })) || null,
    isNew: days <= 2,
    badges: employmentBadges.map(label => ({ label })),

    // THE SAME PANEL THE BOARD SHOWS. The promise this mapper exists to keep is
    // that an employer sees their own advert as a candidate sees it — so if the
    // branded card is what the board renders, it has to be what /my-jobs
    // renders, from the same three inputs and the same selection rule.
    brandColour: job.brandColour ?? null,
    quote: selectQuote({ fullDescription: job.fullDescription, description: job.description }),
    panelTags: job.tags || [],
  }
}

export function cardModelFromJob(job: Job): FeedCardModel {
  const employmentBadges = Array.isArray(job.employmentType)
    ? job.employmentType.slice(0, 2)
    : (job.employmentType ? [job.employmentType] : [])

  return {
    id: job.id,
    banner: resolveJobBanner({
      id: job.id, companyBanner: job.companyBanner, company: job.company, category: job.category,
    }),
    logo: job.companyLogo || null,
    company: job.company,
    companyNote: job.isRecruiterPosting ? '· via recruiter' : null,
    title: job.title,
    where: formatJobLocation(job),
    pay: jobPayText(jobPay(job)) || null,
    isNew: getPostedDaysAgo(job.postedAt) <= 2,
    badges: [
      ...employmentBadges.map(label => ({ label })),
      ...(job.workLocationType ? [{ label: job.workLocationType }] : []),
      ...(job.urgent ? [{ label: 'Urgent' }] : []),
      // A "Right to work required" BADGE WAS BUILT HERE, MEASURED, AND DROPPED
      // ON PURPOSE. Recorded so nobody finds an empty slot and rebuilds it.
      //
      // It rendered on 231 of 251 live adverts — 92% of cards — so it
      // distinguished almost nothing in a badge row that already carries four
      // real discriminators, and it pushed the row to a second line on every
      // card.
      //
      // WHAT SETTLED IT WAS THE APPLY PATH, NOT THE RATIO. THE CARD HAS NO
      // APPLY CONTROL — only Save. Clicking a card pushes /jobs?id=, which is
      // the board's own copy of the advert and carries its own Apply Now
      // button. So every route to applying passes through an advert view, and
      // BOTH of them now render the Eligibility section: /job/[id] and the
      // board detail. The full sentence is always read before the Apply
      // button, which is strictly better than four scanned words on a card.
      //
      // IT WOULD EARN ITS PLACE AGAIN the day applying becomes possible from
      // the card itself — that is the condition to re-check, not the ratio.
      // "EASY APPLY" WAS REMOVED 16 Oct 2026. Nothing set it: it showed on any
      // advert WITHOUT a "CV required" / "Cover letter required" tag, which was
      // all 119 live adverts, so it distinguished nothing. Then Goldenkeys
      // started requiring a CV through employer_profiles.requires_cv, which
      // tags cannot see, and the badge became FALSE on all 98 of their cards.
      // The job-cards redesign drops it too. If it ever comes back it must ask
      // job_requires_cv(), not the tags.
    ],

    // THE NO-PHOTOGRAPH PANEL. Computed here rather than in the card because
    // the card is the one place that must not know what a job is — and because
    // selecting the sentence means parsing the advert body, which is server
    // work that should not run per render.
    //
    // The quote is LIFTED, never written; see lib/jobQuote. Deliberately
    // computed even when a banner exists: it costs a regex over a string that
    // is already in memory, and a model whose fields depend on which branch
    // the card will take is the kind of thing that goes stale silently.
    brandColour: job.brandColour ?? null,
    quote: selectQuote(job),
    panelTags: job.tags || [],
  }
}
