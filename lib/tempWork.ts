// Shared model for the Temp Work feed. Client + server safe.

import type { FeedCardModel } from '@/components/FeedCard'
import type { IconName } from '@/components/icons'
import { formatMoney } from '@/lib/money'

// ── Grouped role taxonomy (one source for the composer picker AND the filter) ──
export interface RoleDef { key: string; label: string }

// `icon` IS IconName, NOT string, AND THAT IS THE HALF THAT LASTS.
//
// It was `string`, so nothing checked that these six names correspond to icons
// that exist. They all do — verified by hand on 6 Sept 2026, which is exactly
// the kind of verification that is true once and then quietly stops being
// true. The seventh name somebody adds should not depend on anyone remembering
// to check it again; `IconName` is `keyof typeof ICONS`, so a name that is not
// an icon is now a compile error at the point it is typed.
export interface RoleGroup { key: string; label: string; icon: IconName; roles: RoleDef[] }

export const ROLE_GROUPS: RoleGroup[] = [
  { key: 'kitchen', label: 'Kitchen', icon: 'chef-hat', roles: [
    { key: 'head_chef', label: 'Head Chef' },
    { key: 'sous_chef', label: 'Sous Chef' },
    { key: 'chef_de_partie', label: 'Chef de Partie' },
    { key: 'commis_chef', label: 'Commis Chef' },
    { key: 'pastry_chef', label: 'Pastry Chef' },
    { key: 'kitchen_porter', label: 'Kitchen Porter' },
  ] },
  { key: 'foh', label: 'Front of House', icon: 'utensils', roles: [
    { key: 'waiting_staff', label: 'Waiting Staff' },
    { key: 'runner', label: 'Runner' },
    { key: 'host', label: 'Host/Hostess' },
    { key: 'barista', label: 'Barista' },
    { key: 'foh_supervisor', label: 'FOH Supervisor' },
  ] },
  { key: 'bar', label: 'Bar', icon: 'martini', roles: [
    { key: 'bartender', label: 'Bartender' },
    { key: 'barback', label: 'Barback' },
    { key: 'bar_supervisor', label: 'Bar Supervisor' },
  ] },
  { key: 'events', label: 'Events & Banqueting', icon: 'tent', roles: [
    { key: 'events_staff', label: 'Events Staff' },
    { key: 'banqueting_staff', label: 'Banqueting Staff' },
    { key: 'catering_assistant', label: 'Catering Assistant' },
  ] },
  { key: 'management', label: 'Management', icon: 'file-text', roles: [
    { key: 'duty_manager', label: 'Duty Manager' },
    { key: 'restaurant_manager', label: 'Restaurant Manager' },
    { key: 'general_manager', label: 'General Manager' },
  ] },
  { key: 'other', label: 'Other / General', icon: 'briefcase', roles: [
    { key: 'other', label: 'Other / General' },
  ] },
]

const ROLE_INDEX: Record<string, { role: RoleDef; group: RoleGroup }> = (() => {
  const idx: Record<string, { role: RoleDef; group: RoleGroup }> = {}
  for (const g of ROLE_GROUPS) for (const r of g.roles) idx[r.key] = { role: r, group: g }
  return idx
})()

// The return type carries IconName through too — widening it back to `string`
// here would undo the guarantee one line after making it, since this is what
// every caller actually holds.
export function roleMeta(key: string): { key: string; label: string; groupKey: string; groupLabel: string; icon: IconName } {
  const hit = ROLE_INDEX[key]
  if (hit) return { key, label: hit.role.label, groupKey: hit.group.key, groupLabel: hit.group.label, icon: hit.group.icon }
  return { key, label: key, groupKey: 'other', groupLabel: 'Other', icon: 'briefcase' }
}

export function rolesInGroup(groupKey: string): string[] {
  return ROLE_GROUPS.find(g => g.key === groupKey)?.roles.map(r => r.key) ?? []
}

/**
 * Best-guess role key for a JOBS row, from its title.
 *
 * A shift carries an explicit category because the person posting it picked one.
 * A jobs row does not: jobs.category is the SECTOR, and it is 'hospitality' on
 * all 247 rows, so it cannot drive a role filter. The title is the only signal
 * there is.
 *
 * Longest label first, so "Chef de Partie" wins over "Chef" and "Head Chef" over
 * both. Anything unrecognised falls to 'other', which is honest — it means the
 * filter shows it under Other rather than silently hiding it, and a role missing
 * from a filter is a much smaller failure than a role missing from the page.
 */
const ROLE_MATCHERS: { key: string; needle: string }[] = ROLE_GROUPS
  .flatMap(g => g.roles.map(r => ({ key: r.key, needle: r.label.toLowerCase() })))
  .filter(r => r.key !== 'other')
  .sort((a, b) => b.needle.length - a.needle.length)

export function roleKeyFromTitle(title: string | null | undefined): string {
  const t = (title || '').toLowerCase()
  if (!t) return 'other'
  for (const { key, needle } of ROLE_MATCHERS) {
    if (t.includes(needle)) return key
  }
  // A couple of titles the labels don't spell out but the trade does.
  if (/\bkp\b|porter/.test(t)) return 'kitchen_porter'
  if (/waiter|waitress|server\b/.test(t)) return 'waiting_staff'
  if (/\bchef\b/.test(t)) return 'chef_de_partie'
  if (/\bbar\b|mixologist|sommelier/.test(t)) return 'bartender'
  if (/manager|supervisor/.test(t)) return 'duty_manager'
  return 'other'
}

export const RATE_TYPES = ['hour', 'shift', 'day'] as const
export type RateType = typeof RATE_TYPES[number]

export interface TempPost {
  id: string
  employer_id: string
  title: string
  category: string // granular role key (see roleMeta)
  description: string | null
  date_from: string | null
  date_to: string | null
  start_time: string | null
  end_time: string | null
  is_ongoing: boolean
  location_area: string
  postcode: string | null
  hourly_rate: number | null
  rate_type: RateType
  headcount: number
  image_url: string | null
  external_link: string | null
  company_name: string | null
  company_logo: string | null
  like_count: number
  comment_count: number
  /** Maintained by trg_temp_interest_count on INSERT and DELETE. */
  interest_count?: number
  status: 'open' | 'filled' | 'closed' | 'expired'
  created_at: string
  isExample?: boolean
}

// A public, LinkedIn-style comment on a post. Author identity is denormalised on
// the row so the public feed can render it without cross-table profile reads.
export interface TempComment {
  id: string
  post_id: string
  user_id: string
  body: string
  author_name: string | null
  author_avatar: string | null
  author_role: 'candidate' | 'employer' | null
  hidden: boolean
  created_at: string
}

export const DISCLAIMER =
  'Thrive connects workers and employers. Bookings, pay and compliance are arranged directly between you — Thrive is not the employer or agency.'

export function formatWhen(p: Pick<TempPost, 'is_ongoing' | 'date_from' | 'date_to' | 'start_time' | 'end_time'>): string {
  if (p.is_ongoing) return 'Ongoing · flexible'
  if (!p.date_from) return 'Flexible dates'
  const from = new Date(`${p.date_from}T00:00:00`)
  const to = p.date_to && p.date_to !== p.date_from ? new Date(`${p.date_to}T00:00:00`) : null
  const t = (s?: string | null) => (s ? s.slice(0, 5) : null)
  const times = [t(p.start_time), t(p.end_time)].filter(Boolean).join('–')

  let datePart: string
  if (to) {
    // Multi-day: "14–16 Jul" within a month, else "30 Jul – 2 Aug".
    const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
    const fromLbl = from.toLocaleDateString('en-GB', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
    const toLbl = to.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    datePart = sameMonth ? `${fromLbl}–${toLbl}` : `${fromLbl} – ${toLbl}`
  } else {
    datePart = from.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  return times ? `${datePart} · ${times}` : datePart
}

/**
 * A shift's pay line, in the SAME shape the job card uses.
 *
 * Two things were wrong and both were visible in one screenshot of the mixed
 * feed: `£${rate}` printed £12.5 where the job card printed £18.16, and the unit
 * read "/hour" next to the job card's "/hr". The money now comes from the single
 * shared formatter, and 'hour' abbreviates to match. 'shift' and 'day' stay as
 * words because there is nothing to abbreviate them to.
 */
const RATE_UNIT: Record<RateType, string> = { hour: 'hr', shift: 'shift', day: 'day' }

export function formatRate(p: Pick<TempPost, 'hourly_rate' | 'rate_type'>): string | null {
  if (p.hourly_rate == null) return null
  return `${formatMoney(p.hourly_rate)}/${RATE_UNIT[p.rate_type] || p.rate_type}`
}

/**
 * A shift as the shared card sees it — the same model a job fills in, so the two
 * cannot end up looking like two products.
 *
 * ONE DELIBERATE DEVIATION from the brief: the rate goes in the PAY slot, next to
 * the location, rather than into a badge. A job's pay sits there, and putting a
 * shift's rate somewhere else would rebuild the difference this change exists to
 * remove — pay is the number a chef compares between two postings and it should
 * be in the same place on both. The genuinely shift-shaped fields (when, how many
 * needed) are the badges.
 */
export function cardModelFromShift(p: TempPost): FeedCardModel {
  const ageDays = (Date.now() - new Date(p.created_at).getTime()) / 86400_000
  return {
    id: p.id,
    banner: p.image_url || null,
    logo: p.company_logo || null,
    company: p.company_name || 'A hospitality employer',
    companyNote: `· ${roleMeta(p.category).label}`,
    title: p.title,
    where: `${p.location_area}${p.postcode ? ` · ${p.postcode}` : ''}`,
    pay: formatRate(p),
    isNew: ageDays <= 2,
    badges: [
      { label: formatWhen(p) },
      ...(p.headcount > 1 ? [{ label: `${p.headcount} needed` }] : []),
      // A FILLED shift keeps its when and its headcount — it is still a real
      // thing happening on that date — but it must not advertise an action that
      // has gone. Someone putting themselves forward for work already taken is
      // worse than never having seen it.
      //
      // THE "✓ FILLED" PILL USED TO SIT HERE AND HAS BEEN REMOVED. It was the
      // same size and treatment as the date beside it, so it read as one more
      // detail ABOUT the shift rather than as the shift being over — you had to
      // look for it. The stamp across the card says it instead. Saying it twice,
      // in two registers, is the thing we just spent a round removing from the
      // availability wording, and this badge row is where the LIVE facts are.

      // The ACTION badge is appended by the feed, not here: it depends on who is
      // looking (owner, signed out, already interested), and this module has no
      // business knowing about the viewer or holding a click handler.
    ],
  }
}

/**
 * The word stamped across a card that is no longer live — null while it still
 * is. One vocabulary in one place, so the stamp, and anything that follows it,
 * cannot drift into calling the same state two different things.
 *
 * The CSS uppercases it, so these stay sentence-case as data.
 */
export function retiredLabel(status: TempPost['status']): string | null {
  if (status === 'filled') return 'Filled'
  if (status === 'closed') return 'Closed'
  if (status === 'expired') return 'Expired'
  return null
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

export function initialsOf(name: string | null | undefined): string {
  return (name || '?').split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()
}
