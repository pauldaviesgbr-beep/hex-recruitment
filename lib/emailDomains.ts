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
/**
 * RELAY AND ALIAS SERVICES — declared ONCE, used twice.
 *
 * These are not mail providers. Each mints a forwarding address that reveals
 * nothing about who is behind it, and each is a member of FREE_MAIL_DOMAINS
 * below (which is COMPOSED from this set rather than repeating it).
 *
 * The second use is display: an employer must not be shown a relay address as
 * a clickable mailto. Mailing one only works if the SENDER's domain is
 * registered with Apple, and a hiring manager's Outlook never will be — so it
 * is not a slightly worse address, it is a dead link that fails silently on
 * their side, where neither they nor we ever learn it failed.
 *
 * Note icloud.com is deliberately NOT here even though Apple can issue relay
 * addresses on it: it is overwhelmingly an ordinary personal mailbox, and
 * hiding every iCloud address from employers would break far more than it
 * fixed. The trade is deliberate — see isRelayAddress.
 */
export const RELAY_DOMAINS: Set<string> = new Set([
  'privaterelay.appleid.com',
  'private.icloud.com',
  'duck.com',
  'mozmail.com',
  'simplelogin.io',
  'aleeas.com',
  'addy.io',
])

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
  // Relay and alias services, declared above and spread in here so there is
  // exactly one place they are listed.
  ...Array.from(RELAY_DOMAINS),
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

/**
 * Is this a forwarding address from a relay or alias service?
 *
 * Used to decide whether to RENDER an address to an employer, never to
 * decide whether to accept a signup — classifyEmail does that, and a relay
 * address is a perfectly legitimate way to sign up.
 */
export function isRelayAddress(email: string | null | undefined): boolean {
  if (!email) return false
  const domain = domainOf(email)
  return domain ? RELAY_DOMAINS.has(domain) : false
}
