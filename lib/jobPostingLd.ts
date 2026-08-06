import type { JobMeta } from './jobMeta'
import { isCredibleAnnualAsk, isHourly } from './salaryInput'

/**
 * The JobPosting JSON-LD, built ON THE SERVER.
 *
 * WHY THIS EXISTS SEPARATELY FROM components/JobPostingSchema.tsx: that one is
 * a client component, so it renders after hydration and Google's job crawler —
 * which does not run our JavaScript — never sees it. A job page served today
 * contains ZERO occurrences of "JobPosting", measured on production. Google
 * finds the URL in the sitemap, crawls it, sees a <title> and nothing else, and
 * does not index it.
 *
 * This module is rendered from /job/[id]/layout.tsx, which is already a server
 * component and already fetches the job for generateMetadata — so the schema
 * lands in the served HTML without the page being rewritten.
 *
 * THE EMPLOYMENT-TYPE MAP IS THE SAME ONE, deliberately duplicated in shape but
 * not in spirit: 'Fixed-term' -> CONTRACTOR was missing for months and every
 * fixed-term role published OTHER. If that map ever changes again it must
 * change in both places, which is why they are named the same thing and say so.
 */
const EMPLOYMENT_TYPE: Record<string, string> = {
  'Full-time': 'FULL_TIME',
  'Part-time': 'PART_TIME',
  'Temporary': 'TEMPORARY',
  'Flexible': 'OTHER',
  'Permanent': 'FULL_TIME',
  'Fixed-term': 'CONTRACTOR',
  'Contract': 'CONTRACTOR',
}

function mapEmploymentType(types: string[]): string[] {
  return types.map(t => EMPLOYMENT_TYPE[t] || 'OTHER')
}

/**
 * baseSalary, and it is the field most likely to fail validation.
 *
 * THREE DECISIONS, each made against the actual rows rather than the spec:
 *
 * 1. A SINGLE FIGURE EMITS `value`, NOT A RANGE WITH IDENTICAL BOUNDS. 209 of
 *    the 246 live rows have salary_min == salary_max. minValue 30000 /
 *    maxValue 30000 is technically valid and reads as a fake range; `value` is
 *    what the data actually says.
 *
 * 2. unitText COMES FROM salary_type THROUGH isHourly(), not from a narrow
 *    equality test. The column holds 'hourly'/'annual' while the client Job
 *    type holds 'hour'/'year', and treating 'hourly' as annual is exactly the
 *    bug lib/salaryInput warns about — it would label £17/hr as £17 A YEAR.
 *
 * 3. A ROW THAT FAILS THE CREDIBILITY GUARD GETS NO baseSalary AT ALL. Two
 *    live rows carry salary_min = salary_max = 0. Publishing "£0 per year" to
 *    Google is worse than publishing nothing: an omitted optional property is
 *    fine, a nonsense one is a wrong claim in a machine-readable format we do
 *    not control the display of.
 */
function baseSalary(job: JobMeta) {
  const period = job.salaryType
  const min = job.salaryMin
  const max = job.salaryMax

  const minOk = isCredibleAnnualAsk(min, period)
  const maxOk = isCredibleAnnualAsk(max, period)
  if (!minOk && !maxOk) return undefined

  const unitText = isHourly(period) ? 'HOUR' : 'YEAR'
  const lo = minOk ? min : max
  const hi = maxOk ? max : min

  const value =
    lo === hi
      ? { '@type': 'QuantitativeValue', value: lo, unitText }
      : { '@type': 'QuantitativeValue', minValue: lo, maxValue: hi, unitText }

  return { '@type': 'MonetaryAmount', currency: 'GBP', value }
}

export function buildJobPostingLd(job: JobMeta, id: string, siteUrl: string) {
  const salary = baseSalary(job)
  const loc = job.fullLocation || {}

  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    // Google requires a description and treats the title as no substitute.
    description: job.description || job.title,
    // datePosted is required. Every live row has posted_at; the fallback keeps
    // a null row valid rather than emitting an invalid document.
    datePosted: (job.postedAt || new Date().toISOString()).slice(0, 10),
    ...(job.employmentType?.length && { employmentType: mapEmploymentType(job.employmentType) }),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
      // A data: URI is not a usable logo for Google, and some legacy rows still
      // hold one — so only an http(s) logo is published.
      ...(job.logoUrl && /^https?:\/\//.test(job.logoUrl) && { logo: job.logoUrl }),
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'GB',
        ...(loc.city || job.location ? { addressLocality: loc.city || job.location } : {}),
        ...(job.area && { addressRegion: job.area }),
        ...(loc.postcode && { postalCode: loc.postcode }),
        ...(loc.addressLine1 && { streetAddress: loc.addressLine1 }),
      },
    },
    ...(salary && { baseSalary: salary }),
    ...(job.workLocation === 'Remote' && { jobLocationType: 'TELECOMMUTE' }),
    identifier: { '@type': 'PropertyValue', name: job.company, value: id },
    url: `${siteUrl}/job/${id}`,
    directApply: true,
  }
}
