// THE iOS APP'S DATA, SHAPED BY THE WEBSITE'S OWN RULES.
//
// The native screens (design_handoff_ios_native_layer, step 3) show jobs, saved
// jobs and applications. They do NOT reformat anything themselves: pay, place,
// region and "New" come from the same functions the website uses
// (formatJobSalary, formatJobLocation, resolveJobArea), so the app cannot drift
// from the site. The app keeps a copy of what this returns for offline reading.
//
// Signed-in calls carry the web session's own access token as a Bearer header.
// The app never signs anyone in and never refreshes a token: it reads the one
// the web page left (ios/App/App/ThriveSession.swift). Queries run AS THAT USER,
// so row-level security applies exactly as on the website.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { supabaseJobToJob } from '@/lib/types'
import { formatJobSalary, formatJobLocation } from '@/lib/jobCard'
import { resolveJobArea, regionName } from '@/lib/areas'
import { formatMoney } from '@/lib/money'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function publicClient(): SupabaseClient {
  return createClient(URL_, ANON, { auth: { persistSession: false } })
}

/** The signed-in user behind a Bearer token, and a client that queries as them. */
export async function userFromRequest(req: NextRequest): Promise<{ client: SupabaseClient; userId: string } | null> {
  const header = req.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  const client = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  // No catch binding and nothing logged: an auth error can carry the token.
  try {
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return null
    return { client, userId: data.user.id }
  } catch {
    return null
  }
}

/** The columns an app job needs, read once. */
export const APP_JOB_COLUMNS =
  'id, title, company, location, area, area_region, area_county, salary_min, salary_max, salary_type, ' +
  'employment_type, posted_at, created_at, status, description, full_description, responsibilities, ' +
  'requirements, benefits, tags, is_recruiter_posting, employer_id, category'

export type AppJob = {
  id: string
  title: string
  company: string
  place: string          // "Bath, Somerset" — formatJobLocation
  pay: string | null     // formatJobSalary; null when there is no figure (never "Competitive")
  type: string | null    // "Full time" — what the row says, nothing assumed
  postedAt: string | null
  postedLabel: string    // "Today", "Yesterday", "Fri 9 Oct"
  isNew: boolean         // posted in the last 48 hours
  isClosed: boolean
  region: { key: string; label: string } | null
  about: string
  responsibilities: string[]
  requirements: string[]
  benefits: string[]
  url: string
  // Brand pass (design H1–H5): pay as the cards and the job page write it.
  payShort: string | null  // "£63k", "£55k–£62k", "£12.50 an hour"
  payLong: string | null   // "£63,000 a year", "£12.50 an hour"
  facts: string[]          // ["Full time", "Permanent"], from employment_type
  // Build 17 review (design R1 and the small fixes).
  town: string             // "Deptford": the row's place
  category: string | null  // for "See similar jobs" on a closed job
  aboutBlocks: { kind: 'heading' | 'text'; text: string }[]
}

// Regions resolved from a place name are cached per server instance: the
// resolver can call postcodes.io, and the answer for a place does not change.
const regionCache = new Map<string, string | null>()

async function regionFor(row: any): Promise<string | null> {
  if (row.area_region) return row.area_region
  const key = `${row.location || ''}|${row.area || ''}`
  if (regionCache.has(key)) return regionCache.get(key)!
  try {
    const r = await resolveJobArea({ location: row.location, area: row.area })
    regionCache.set(key, r.region ?? null)
    return r.region ?? null
  } catch {
    return null
  }
}

function postedLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const startOf = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  // A card is scanned, not read: "3 days ago" says how fresh it is at a
  // glance; "Tue 13 Oct" makes the reader do the sum.
  // Design R1 (build 17 review): to 6 days, then "6 Oct"; from six months, the year too.
  if (days <= 6) return `${days} days ago`
  return shortDate(d, days >= 183)
}

// "Sep", never "Sept": en-GB's own abbreviation became "Sept" in newer ICU,
// and the design asks for three letters everywhere.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function shortDate(d: Date, withYear = false): string {
  const london = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/London' }))
  const base = `${london.getDate()} ${MONTHS[london.getMonth()]}`
  return withYear ? `${base} ${london.getFullYear()}` : base
}

/** The town alone (design R1): no postcode district and no county after a
 *  town. "Deptford, London, SE8" gives "Deptford"; "Wokingham, Berkshire"
 *  gives "Wokingham". With no town, the county. */
export function townOf(row: { location?: string | null; area?: string | null }): string {
  const isDistrict = (t: string) => /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i.test(t)
  const first = (v?: string | null) =>
    (v || '').split(',').map(t => t.trim()).filter(t => t && !isDistrict(t))[0] || ''
  return first(row.location) || first(row.area)
}

/** The advert body as headings and paragraphs (design: "the advert's
 *  subheadings render as headings everywhere"). A short line with no closing
 *  punctuation, followed by more text, is a subheading. */
export function aboutBlocks(text: string): { kind: 'heading' | 'text'; text: string }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  return lines.map((line, i) => {
    const bare = line.replace(/:$/, '')
    const heading = i < lines.length - 1 && bare.length <= 48 && !/[.!?;,]$/.test(bare) &&
      bare.split(/\s+/).length <= 7 && !/^[•\-–]/.test(bare)
    return heading ? { kind: 'heading' as const, text: bare } : { kind: 'text' as const, text: line }
  })
}

/** Dates for the app: ISO 8601 UTC with milliseconds ("2026-10-16T08:12:00.000Z").
 *  Postgres gives microseconds and an offset, which iOS's ISO8601DateFormatter
 *  does not reliably parse beyond three fractional digits. */
export function isoDate(s: string | null | undefined): string | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// The native screens show plain text. One live advert carries HTML (measured
// 16 Oct 2026: 1 of 119), so tags become line breaks or nothing and the common
// entities are decoded, rather than the app printing "<p>".
export function plainText(s: string | null | undefined): string {
  return (s || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Pay for the app's cards and job page (design H1, H5). Same rounding as the
 *  website's formatJobSalary (whole thousands a year) and the same pounds-and-
 *  pence formatter, with the period in words as the website's new cards write it. */
export function appPay(row: any): { payShort: string | null; payLong: string | null } {
  const min = Number(row.salary_min) || 0
  const max = Number(row.salary_max) || 0
  if (min <= 0 && max <= 0) return { payShort: null, payLong: null }
  const lo = min > 0 ? min : max
  const single = max <= 0 || min <= 0 || min === max
  if (row.salary_type === 'annual') {
    const k = (n: number) => `£${(n / 1000).toFixed(0)}k`
    const full = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
    return single
      ? { payShort: k(lo), payLong: `${full(lo)} a year` }
      : { payShort: `${k(min)}–${k(max)}`, payLong: `${full(min)}–${full(max)} a year` }
  }
  const text = single ? `${formatMoney(lo)} an hour` : `${formatMoney(min)}–${formatMoney(max)} an hour`
  return { payShort: text, payLong: text }
}

function typeOf(row: any): string | null {
  const t = Array.isArray(row.employment_type) ? row.employment_type[0] : row.employment_type
  return t ? String(t).replace('-', ' ') : null
}

export async function toAppJob(row: any): Promise<AppJob> {
  const job = supabaseJobToJob(row)
  const hasPay = Number(row.salary_min) > 0 || Number(row.salary_max) > 0
  const regionKey = await regionFor(row)
  const posted = isoDate(row.posted_at || row.created_at)
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    place: formatJobLocation(row),
    pay: hasPay ? formatJobSalary(job) : null,
    type: typeOf(row),
    postedAt: posted,
    postedLabel: postedLabel(posted),
    isNew: posted ? Date.now() - new Date(posted).getTime() < 48 * 3_600_000 : false,
    isClosed: row.status !== 'active',
    region: regionKey ? { key: regionKey, label: regionName(regionKey) || regionKey } : null,
    about: plainText(row.full_description || row.description),
    aboutBlocks: aboutBlocks(plainText(row.full_description || row.description)),
    town: townOf(row),
    category: row.category || null,
    responsibilities: (row.responsibilities || []).map(plainText).filter(Boolean),
    requirements: (row.requirements || []).map(plainText).filter(Boolean),
    benefits: (row.benefits || []).map(plainText).filter(Boolean),
    url: `https://thrivecareer.co.uk/job/${row.id}`,
    ...appPay(row),
    facts: (Array.isArray(row.employment_type) ? row.employment_type : [row.employment_type])
      .filter(Boolean)
      .map((t: string) => String(t).replace('-', ' ')),
  }
}
