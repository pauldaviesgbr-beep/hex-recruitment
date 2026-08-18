// WHERE A REQUEST CAME FROM, ACCORDING TO THE EDGE — not according to us.
//
// Vercel resolves the country at its edge and hands it over as
// `x-vercel-ip-country`, an ISO 3166-1 alpha-2 code. We read that header and
// store the two letters. NOTHING HERE TOUCHES AN IP ADDRESS: no lookup, no
// third party, no geolocation of our own. The distinction matters because the
// alternative — geolocating the IPs already sitting in auth.sessions — would
// mean sending real candidates' addresses to somebody else's service.
//
// LOCALLY THE HEADER IS ABSENT, which is not the same as unknown, so
// countryFromHeaders returns null there and nothing is written. A dev session
// must never look like a real signup from nowhere.

/** Vercel's header. Present on every request in production, absent locally. */
export const COUNTRY_HEADER = 'x-vercel-ip-country'

/**
 * First-party cookie carrying the country to the CLIENT-side signup paths,
 * which cannot read request headers. Same shape and lifetime reasoning as
 * `thrive_attr` in lib/attribution.ts — this codebase already solves "server
 * knows something the signup form needs" that way, so it does it once more
 * rather than inventing a second mechanism.
 */
export const COUNTRY_COOKIE = 'thrive_country'
export const COUNTRY_MAX_AGE_DAYS = 90

/**
 * `XX` is Vercel's own value for "the edge could not determine it". It is kept
 * rather than nulled, because "we asked and it did not know" is a different
 * fact from "we never asked" — and null already means the second one.
 */
export const COUNTRY_UNKNOWN = 'XX'

const ISO2 = /^[A-Z]{2}$/

/** Accept only two uppercase letters. Anything else is treated as absent —
 *  the column carries the same constraint, so a bad value cannot reach it
 *  from here or from anywhere else. */
export function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim().toUpperCase()
  return ISO2.test(v) ? v : null
}

type HeaderBag = { get(name: string): string | null }

/** Read the country from a server request's headers. Null when the header is
 *  absent, which is the local-development case. */
export function countryFromHeaders(headers: HeaderBag): string | null {
  return normalizeCountry(headers.get(COUNTRY_HEADER))
}

/** Parse the country out of a raw Cookie header (server fallback, and how the
 *  client-side signup forms' value is read back). */
export function parseCountryCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  const m = cookieHeader.match(new RegExp('(?:^|; )' + COUNTRY_COOKIE + '=([^;]*)'))
  return m ? normalizeCountry(decodeURIComponent(m[1])) : null
}

/** Client-only: read whatever middleware last stored. */
export function getStoredCountry(): string | null {
  if (typeof document === 'undefined') return null
  return parseCountryCookie(document.cookie)
}

// ── TIMEZONE ────────────────────────────────────────────────────────────────
//
// THE BROWSER KNOWS ITS ZONE EXACTLY; THE COUNTRY ONLY IMPLIES ONE BADLY. A
// country -> timezone map is wrong for precisely the markets in the plan —
// the US spans six zones and Australia five, so deriving "US" to
// America/New_York puts a Los Angeles candidate three hours out and a chart
// of "when candidates are active" quietly lies.
//
// So this is captured client-side and carried in a cookie, because the
// signup paths that need it include SERVER routes (the OAuth callbacks) which
// cannot read the browser. Same mechanism as the country cookie and
// thrive_attr before it.

export const TZ_COOKIE = 'thrive_tz'

/** IANA zone names only — 'Europe/London', 'Australia/Sydney'. Anything that
 *  is not Region/City shape is treated as absent rather than stored. */
const IANA = /^[A-Za-z_]+\/[A-Za-z_+\-0-9/]+$/

export function normalizeTimezone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  return IANA.test(v) && v.length <= 64 ? v : null
}

/** Client-only: ask the browser directly. */
export function browserTimezone(): string | null {
  if (typeof Intl === 'undefined') return null
  try {
    return normalizeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return null
  }
}

/** Client-only: store it where the server signup paths can reach it. */
export function storeTimezone(): void {
  if (typeof document === 'undefined') return
  const tz = browserTimezone()
  if (!tz) return
  document.cookie =
    `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=${COUNTRY_MAX_AGE_DAYS * 86400}; SameSite=Lax`
}

export function parseTimezoneCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  const m = cookieHeader.match(new RegExp('(?:^|; )' + TZ_COOKIE + '=([^;]*)'))
  return m ? normalizeTimezone(decodeURIComponent(m[1])) : null
}

export function getStoredTimezone(): string | null {
  if (typeof document === 'undefined') return null
  return parseTimezoneCookie(document.cookie)
}

/**
 * The column patch for a signup insert, EMPTY when we have nothing.
 *
 * Deliberately not `{ signup_country: null }`. These inserts run against rows
 * that may already exist, and writing an explicit null would overwrite a real
 * value with a guess — the same reason attributionColumns is only spread when
 * `hasAttr`. An absent key changes nothing.
 */
export function countryColumns(country?: string | null): Record<string, string> {
  const c = normalizeCountry(country ?? getStoredCountry())
  const tz = browserTimezone() ?? getStoredTimezone()
  return {
    ...(c ? { signup_country: c } : {}),
    ...(tz ? { signup_timezone: tz } : {}),
  }
}

/** Server-side equivalent: both facts off a request, for the OAuth callbacks
 *  and anywhere else without a browser. */
export function geoColumnsFromRequest(headers: {
  get(name: string): string | null
}): Record<string, string> {
  const cookie = headers.get('cookie')
  const c = countryFromHeaders(headers) || parseCountryCookie(cookie)
  const tz = parseTimezoneCookie(cookie)
  return {
    ...(c ? { signup_country: c } : {}),
    ...(tz ? { signup_timezone: tz } : {}),
  }
}
