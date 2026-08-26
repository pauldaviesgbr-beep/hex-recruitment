import disposableList from 'disposable-email-domains'

export type EmailClass = 'business' | 'freemail' | 'disposable'

const DISPOSABLE_SET: Set<string> = new Set(
  (disposableList as string[]).map(d => d.toLowerCase())
)

/**
 * Curated free / generic-provider domains. These aren't disposable but they
 * give us no signal that the signup is a real business — we treat them as
 * pending-approval. Conservative list (additive is safer than missing one).
 */
export const FREE_MAIL_DOMAINS: Set<string> = new Set([
  // Google
  'gmail.com', 'googlemail.com',
  // Microsoft
  'outlook.com', 'outlook.co.uk', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr',
  'live.com', 'live.co.uk', 'msn.com',
  // Yahoo / Verizon
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'ymail.com', 'rocketmail.com',
  // Apple
  'icloud.com', 'me.com', 'mac.com',
  // Apple's Sign in with Apple PRIVATE RELAY. Not free mail in the ordinary
  // sense — it is a forwarding address Apple mints per app — but it belongs
  // here for exactly the reason the list exists: it gives us NO SIGNAL that
  // the signup is a real business.
  //
  // WITHOUT IT, classifyEmail returns 'business' and, under
  // FREE_FOUNDING_MODE, an Apple signup walks into the founding cohort with
  // no manual review at all. It is the same shape as every other fault this
  // week: our side looks perfect, nothing errors, and the wrong thing happens
  // quietly.
  //
  // Added 26 Aug 2026, BEFORE Sign in with Apple is built, so the first Apple
  // employer cannot arrive through a door nobody has closed yet.
  //
  // STILL OPEN, AND IT IS NOT FIXED BY THIS LINE: companyNameFromEmail takes
  // the domain stem and title-cases it, from its OWN hardcoded list in two
  // files — so an Apple employer's company is still created as
  // "Privaterelay". That belongs with the Sign in with Apple work.
  // THREE domains, not one. Apple's own documentation: private relay
  // addresses 'end in @private.icloud.com, @privaterelay.appleid.com, or
  // @icloud.com'. icloud.com was already here as ordinary free mail; the
  // other two were not. Adding only the obvious one would have left two
  // thirds of the hole open.
  'privaterelay.appleid.com', 'private.icloud.com',
  // AOL / Verizon
  'aol.com', 'aol.co.uk',
  // GMX / Mail.com / 1&1
  'gmx.com', 'gmx.co.uk', 'gmx.net', 'mail.com',
  // Proton
  'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me',
  // Other free providers
  'fastmail.com', 'fastmail.fm', 'zoho.com', 'tutanota.com', 'tutanota.de',
  'tuta.io', 'inbox.com', 'hushmail.com',
  // UK ISP mail (historically free)
  'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net',
])

/**
 * Extract the domain (lowercased, trimmed) from an email. Returns null
 * if the string isn't a single @-separated address.
 */
export function domainOf(email: string): string | null {
  const cleaned = (email || '').trim().toLowerCase()
  const at = cleaned.lastIndexOf('@')
  if (at < 1 || at === cleaned.length - 1) return null
  return cleaned.slice(at + 1)
}

/**
 * Classify an email address for the founding-signup gate.
 *   business    — anything that isn't freemail or disposable
 *   freemail    — curated FREE_MAIL_DOMAINS; account allowed but
 *                 spot only consumed after Paul approves
 *   disposable  — disposable-email-domains list; signup hard-rejected
 *
 * Format validation is the caller's job (see lib/validateEmail.ts).
 */
export function classifyEmail(email: string): EmailClass {
  const domain = domainOf(email)
  if (!domain) return 'business' // shouldn't reach classify with malformed; treat as unknown→business and let format check elsewhere reject
  if (DISPOSABLE_SET.has(domain)) return 'disposable'
  if (FREE_MAIL_DOMAINS.has(domain)) return 'freemail'
  return 'business'
}
