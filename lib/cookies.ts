export interface CookieConsent {
  essential: boolean    // Always true
  functional: boolean
  analytics: boolean
}

const COOKIE_NAME = 'hex_cookie_consent'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 year in seconds

export function getCookieConsent(): CookieConsent | null {
  if (typeof document === 'undefined') return null

  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${COOKIE_NAME}=`))

  if (!cookie) return null

  try {
    return JSON.parse(decodeURIComponent(cookie.split('=')[1]))
  } catch {
    return null
  }
}

export function setCookieConsent(consent: CookieConsent): void {
  if (typeof document === 'undefined') return

  const value = encodeURIComponent(JSON.stringify(consent))
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function acceptAllCookies(): CookieConsent {
  const consent: CookieConsent = {
    essential: true,
    functional: true,
    analytics: true,
  }
  setCookieConsent(consent)
  return consent
}

export function rejectNonEssentialCookies(): CookieConsent {
  const consent: CookieConsent = {
    essential: true,
    functional: false,
    analytics: false,
  }
  setCookieConsent(consent)
  return consent
}

export function hasConsentBeenGiven(): boolean {
  return getCookieConsent() !== null
}

export function hasAnalyticsConsent(): boolean {
  const consent = getCookieConsent()
  return consent?.analytics === true
}

export function hasFunctionalConsent(): boolean {
  const consent = getCookieConsent()
  return consent?.functional === true
}
