// First-party signup source attribution. No third-party trackers — we only read
// our own ?ref / ?utm_* tags and store them first-party (cookie + localStorage) so
// they survive the signup journey, then persist onto the profile row at creation.
//
// Isomorphic: the capture/store helpers are client-only (guarded on `document`),
// while normalizeSource + parseAttrCookie are pure and safe on the server (used by
// the auth callback to write the columns).

export const ATTR_COOKIE = 'thrive_attr'
export const ATTR_MAX_AGE_DAYS = 90

export interface Attribution {
  signup_ref?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  heard_from?: string | null
  /** Bare host of document.referrer on the first page load — 'linkedin.com'.
   *  The WEAKEST of the four signals and deliberately kept apart from the
   *  others: see normalizeSource and sourceBasis below. */
  referrer_host?: string | null
}

/** How much of a claim `signup_source` is. */
export type SourceBasis = 'tag' | 'self-reported' | 'referrer' | 'unknown'

// Options shown in the "How did you hear about us?" dropdown (Layer 2).
export const HEARD_FROM_OPTIONS = [
  'LinkedIn',
  'Facebook group',
  'WhatsApp / word of mouth',
  'Instagram',
  'TikTok',
  'A recruiter / agency',
  'Google search',
  'Other',
] as const

// Map raw ref/utm channel tokens -> normalized channel label.
const CHANNEL_ALIASES: Record<string, string> = {
  li: 'LinkedIn', linkedin: 'LinkedIn',
  fb: 'Facebook', facebook: 'Facebook', meta: 'Facebook',
  wa: 'WhatsApp', whatsapp: 'WhatsApp',
  ig: 'Instagram', instagram: 'Instagram', insta: 'Instagram',
  tt: 'TikTok', tiktok: 'TikTok',
  google: 'Google search', gsearch: 'Google search', g: 'Google search',
  email: 'Email', newsletter: 'Email',
}

// Map self-reported dropdown answers -> the same normalized channels, so the
// signup_source column is consistent whether it came from a tag or the dropdown.
const HEARD_FROM_ALIASES: Record<string, string> = {
  'linkedin': 'LinkedIn',
  'facebook group': 'Facebook',
  'whatsapp / word of mouth': 'WhatsApp',
  'instagram': 'Instagram',
  'tiktok': 'TikTok',
  'a recruiter / agency': 'Recruiter/agency',
  'google search': 'Google search',
  'other': 'Other',
}

function titleCase(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Referrer hosts -> the same normalized channels, so a referrer-derived
// LinkedIn groups with a tagged one instead of splitting the chart in two.
// Registrable domain only: the host is stripped of 'www.' and any leading
// subdomain is matched by suffix, so lnkd.in, m.facebook.com and
// l.instagram.com all land correctly.
const REFERRER_CHANNELS: [string, string][] = [
  ['linkedin.com', 'LinkedIn'], ['lnkd.in', 'LinkedIn'],
  ['facebook.com', 'Facebook'], ['fb.com', 'Facebook'], ['fb.me', 'Facebook'],
  ['instagram.com', 'Instagram'],
  ['whatsapp.com', 'WhatsApp'], ['wa.me', 'WhatsApp'],
  ['t.co', 'X/Twitter'], ['twitter.com', 'X/Twitter'], ['x.com', 'X/Twitter'],
  ['google.', 'Google search'], ['bing.com', 'Google search'],
  ['reddit.com', 'Reddit'], ['tiktok.com', 'TikTok'],
  ['indeed.com', 'Indeed'], ['caterer.com', 'Caterer'],
]

/** Map a bare referrer host onto a channel, or null if we don't recognise it.
 *  Null is returned rather than a guess — an unrecognised host is reported as
 *  itself, never folded into 'Other'. */
export function channelFromReferrer(host: string | null | undefined): string | null {
  if (!host) return null
  const h = host.toLowerCase().replace(/^www\./, '')
  for (const [needle, channel] of REFERRER_CHANNELS) {
    if (h === needle || h.endsWith('.' + needle) || h.includes(needle)) return channel
  }
  return null
}

/**
 * Derive a single normalized channel. Priority, strongest evidence first:
 *   explicit ref/utm_source  ->  heard_from  ->  referrer host  ->  'unknown'.
 *
 * THE REFERRER IS LAST DELIBERATELY, AND IT IS ALSO THE ONLY ONE THAT FIRES
 * IN OUR MAIN CHANNEL. Paul removes the link from a LinkedIn post once the
 * card has rendered — the interstitial warning scares people off, the card
 * image keeps working — so people click an image, not a tagged URL, and no
 * ?ref can exist to be read. That is why 62 candidates recorded 'unknown'
 * while at least one was a known LinkedIn signup.
 *
 * For ref tags we key off the channel PREFIX before the first '-'
 * (fb-chefsuk -> Facebook) while the raw ref is kept separately for drill-down.
 */
export function normalizeSource(a: Attribution): string {
  const raw = (a.signup_ref || a.utm_source || '').toString().trim().toLowerCase()
  if (raw) {
    const prefix = raw.split(/[-_]/)[0]
    return CHANNEL_ALIASES[prefix] || CHANNEL_ALIASES[raw] || titleCase(prefix || raw)
  }
  const hf = (a.heard_from || '').toString().trim()
  if (hf) return HEARD_FROM_ALIASES[hf.toLowerCase()] || hf
  const ref = a.referrer_host?.toString().trim()
  if (ref) return channelFromReferrer(ref) || ref.replace(/^www\./, '')
  return 'unknown'
}

/**
 * HOW WE KNOW, kept beside WHAT WE THINK.
 *
 * Without this, an inference and a declaration are the same string in the
 * same column, and the difference is unrecoverable afterwards. It matters
 * because the entire purpose of this data is deciding where to spend money:
 * "LinkedIn, they told us" and "LinkedIn, because a header said so and native
 * apps often send none" support different decisions.
 */
export function sourceBasis(a: Attribution): SourceBasis {
  if (a.signup_ref || a.utm_source || a.utm_medium || a.utm_campaign) return 'tag'
  if (a.heard_from) return 'self-reported'
  if (a.referrer_host) return 'referrer'
  return 'unknown'
}

// ── Client-only store helpers (first-touch-wins) ─────────────────────────────

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? m[1] : null
}

/** Read whatever attribution we've already stored (localStorage first, then cookie). */
export function getStoredAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null
  try {
    const ls = window.localStorage.getItem(ATTR_COOKIE)
    if (ls) return JSON.parse(ls) as Attribution
  } catch { /* ignore */ }
  const c = readCookie(ATTR_COOKIE)
  if (c) { try { return JSON.parse(decodeURIComponent(c)) as Attribution } catch { /* ignore */ } }
  return null
}

function writeStored(a: Attribution) {
  if (typeof document === 'undefined') return
  const json = JSON.stringify(a)
  try { window.localStorage.setItem(ATTR_COOKIE, json) } catch { /* ignore */ }
  const maxAge = ATTR_MAX_AGE_DAYS * 86400
  document.cookie = `${ATTR_COOKIE}=${encodeURIComponent(json)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

/** The host of an EXTERNAL referrer, or null. Our own hostname returns null —
 *  internal navigation is not a referral, and treating it as one would tag
 *  every candidate with thrivecareer.co.uk on their second page view. */
export function externalReferrerHost(referrer: string, selfHost: string): string | null {
  if (!referrer) return null
  try {
    const h = new URL(referrer).hostname.replace(/^www\./, '')
    const self = selfHost.replace(/^www\./, '')
    if (!h || h === self || h.endsWith('.' + self)) return null
    return h
  } catch { return null }
}

/**
 * Read ref/utm_* from a URL query string and store them FIRST-TOUCH-WINS,
 * falling back to the referrer host when there is no tag.
 *
 * THE FALLBACK IS THE WHOLE FIX. Previously this returned early with nothing
 * stored whenever a tag was absent — which is every visit through our largest
 * channel, because the LinkedIn post has its link removed once the card
 * renders and people click the image instead. `?ref` has landed on zero of 62
 * candidates. The referrer is the only thing that survives that path.
 *
 * A TAG STILL UPGRADES A REFERRER-ONLY RECORD, and only that. First-touch
 * still wins on the channel — but if we stored 'they came from linkedin.com'
 * and they later arrive on a tagged link, the tag is better evidence about
 * the same first touch, not a second one, so it is allowed to fill in. A
 * record that already has a tag is never overwritten.
 */
export function captureFromSearch(search: string, referrer?: string) {
  if (typeof document === 'undefined') return
  const params = new URLSearchParams(search)
  const incoming: Attribution = {
    signup_ref: params.get('ref') || undefined,
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
  }
  const hasTag = !!(incoming.signup_ref || incoming.utm_source || incoming.utm_medium || incoming.utm_campaign)

  const host = externalReferrerHost(
    referrer ?? (typeof document !== 'undefined' ? document.referrer : ''),
    typeof window !== 'undefined' ? window.location.hostname : '',
  )

  const stored = getStoredAttribution()
  if (stored) {
    const storedHasTag = !!(stored.signup_ref || stored.utm_source || stored.utm_medium || stored.utm_campaign)
    if (storedHasTag || !hasTag) return          // first-touch wins
    writeStored({ ...stored, ...incoming })      // referrer-only record, now tagged
    return
  }

  if (!hasTag && !host) return                   // nothing to record at all
  writeStored({ ...incoming, ...(host ? { referrer_host: host } : {}) })
}

// ── Server helper ────────────────────────────────────────────────────────────

/** Parse the thrive_attr cookie out of a raw Cookie header (server fallback). */
export function parseAttrCookie(cookieHeader: string | null | undefined): Attribution | null {
  if (!cookieHeader) return null
  const m = cookieHeader.match(new RegExp('(?:^|; )' + ATTR_COOKIE + '=([^;]*)'))
  if (!m) return null
  try { return JSON.parse(decodeURIComponent(m[1])) as Attribution } catch { return null }
}

/** Build the profile columns from raw attribution (used at profile creation). */
export function attributionColumns(a: Attribution | null | undefined) {
  const attr = a || {}
  return {
    signup_ref: attr.signup_ref || null,
    utm_source: attr.utm_source || null,
    utm_medium: attr.utm_medium || null,
    utm_campaign: attr.utm_campaign || null,
    heard_from: attr.heard_from || null,
    referrer_host: attr.referrer_host || null,
    signup_source: normalizeSource(attr),
    signup_source_basis: sourceBasis(attr),
  }
}
