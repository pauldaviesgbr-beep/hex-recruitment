import { COUNTRY_COOKIE, TZ_COOKIE } from './geo'
import { ATTR_COOKIE } from './attribution'

/**
 * WHAT CONSENT MEANS HERE, AND WHY THERE ARE ONLY TWO CATEGORIES.
 *
 * There used to be three — essential, functional, analytics. THE ANALYTICS ONE
 * WAS CONSENT FOR SOMETHING THAT DOES NOT EXIST: measured 22 Sept 2026 across
 * six driven browser contexts, no analytics cookie is set on this site before
 * or after consent, because our analytics are database rows written
 * server-side (`job_views`, `job_impressions`) and a cookie toggle cannot
 * touch them. Offering a switch for it was the thing Apple's reviewer read as
 * "cookies may be used to track users" under Guideline 5.1.2(i).
 *
 * The old panel also said "Data is anonymised", which is false of a signed-in
 * visitor — `job_views.viewer_id` holds their id — and contradicted our own
 * App Store privacy labels, which mark every data type as linked to the user.
 * Both documents get read together, so both had to be true.
 *
 * `analytics` is still TOLERATED when parsing, because a year-long cookie from
 * the old shape is sitting in real browsers. It is read and discarded.
 */
export interface CookieConsent {
  essential: boolean    // Always true
  functional: boolean
}

const COOKIE_NAME = 'hex_cookie_consent'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 year in seconds

/**
 * THE COOKIES A REFUSAL ACTUALLY STOPS, NAMED ONCE.
 *
 * Imported from the modules that own them rather than retyped, so this list
 * cannot drift from the strings that are actually written. If a fourth
 * non-essential cookie is ever added, it belongs here and nowhere else.
 *
 * NOT ON THIS LIST, DELIBERATELY: the Supabase auth token (you cannot stay
 * signed in without it), `hex_session_started` (the session marker the auth
 * flow reads), and this consent cookie itself — recording that somebody
 * declined is the only way to stop asking them again.
 */
export const NON_ESSENTIAL_COOKIES = [COUNTRY_COOKIE, TZ_COOKIE, ATTR_COOKIE] as const

function parse(raw: string): CookieConsent | null {
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Partial<CookieConsent>
    // Tolerant of the retired three-field shape: anything not named here is
    // read and dropped.
    return { essential: true, functional: v.functional === true }
  } catch {
    return null
  }
}

export function getCookieConsent(): CookieConsent | null {
  if (typeof document === 'undefined') return null

  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${COOKIE_NAME}=`))

  if (!cookie) return null
  return parse(cookie.slice(COOKIE_NAME.length + 1))
}

export function setCookieConsent(consent: CookieConsent): void {
  if (typeof document === 'undefined') return

  const value = encodeURIComponent(JSON.stringify(consent))
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function acceptAllCookies(): CookieConsent {
  const consent: CookieConsent = { essential: true, functional: true }
  setCookieConsent(consent)
  return consent
}

export function rejectNonEssentialCookies(): CookieConsent {
  const consent: CookieConsent = { essential: true, functional: false }
  setCookieConsent(consent)
  clearNonEssentialCookies()
  return consent
}

export function hasConsentBeenGiven(): boolean {
  return getCookieConsent() !== null
}

/**
 * THE GATE. Every non-essential write asks this first.
 *
 * UNDECIDED IS A NO, AND THAT IS THE WHOLE POINT. Before this existed the
 * banner recorded a refusal and then ignored it — `hasAnalyticsConsent`,
 * `hasFunctionalConsent` and `rejectNonEssentialCookies` had ZERO callers
 * anywhere in the codebase, so declining changed no behaviour at all. A
 * consent mechanism that writes down a refusal and carries on is a promise in
 * writing that we break.
 */
export function nonEssentialAllowed(): boolean {
  return getCookieConsent()?.functional === true
}

/**
 * The same question, answerable on the SERVER from a raw Cookie header.
 *
 * `thrive_country` is set by middleware.ts, at the edge, before any component
 * has rendered — so the client-side gate above cannot reach it and the server
 * needs its own way to ask. Same cookie, same rule, one parser.
 */
export function nonEssentialAllowedFromHeader(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false
  const m = cookieHeader.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)'))
  if (!m) return false
  return parse(m[1])?.functional === true
}

/**
 * Remove what a refusal refuses — cookie AND localStorage, because
 * `thrive_attr` is mirrored into both and deleting one leaves the other
 * readable.
 *
 * Runs on decline rather than only on future writes: by the time somebody
 * reaches the banner, `thrive_country` may already have been set at the edge
 * on an earlier request, and a refusal that leaves it in place is not a
 * refusal.
 */
export function clearNonEssentialCookies(): void {
  if (typeof document === 'undefined') return
  for (const name of NON_ESSENTIAL_COOKIES) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
  }
  try { window.localStorage.removeItem(ATTR_COOKIE) } catch { /* private mode */ }
}
