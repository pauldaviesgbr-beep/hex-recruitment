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
  'requirements, benefits, tags, is_recruiter_posting, employer_id'

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
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })
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

function typeOf(row: any): string | null {
  const t = Array.isArray(row.employment_type) ? row.employment_type[0] : row.employment_type
  return t ? String(t).replace('-', ' ') : null
}

export async function toAppJob(row: any): Promise<AppJob> {
  const job = supabaseJobToJob(row)
  const hasPay = Number(row.salary_min) > 0 || Number(row.salary_max) > 0
  const regionKey = await regionFor(row)
  const posted = row.posted_at || row.created_at || null
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
    responsibilities: (row.responsibilities || []).map(plainText).filter(Boolean),
    requirements: (row.requirements || []).map(plainText).filter(Boolean),
    benefits: (row.benefits || []).map(plainText).filter(Boolean),
    url: `https://thrivecareer.co.uk/job/${row.id}`,
  }
}
