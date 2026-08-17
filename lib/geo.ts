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
  return c ? { signup_country: c } : {}
}
