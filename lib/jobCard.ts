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
    pay: formatJobSalary({
      salaryMin: job.salaryMin, salaryMax: job.salaryMax,
      salaryPeriod: job.salaryPeriod, tags: [],
    } as unknown as Job),
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
    where: formatJobLocation(job),
    pay: formatJobSalary(job),
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
      ...(easyApply ? [{ label: 'Easy apply', accent: true }] : []),
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
