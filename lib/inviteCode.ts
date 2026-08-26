import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * A CODE SENT TO THE INVITED MAILBOX, TO PROVE THE ACCEPTER HOLDS IT.
 *
 * WHAT PROBLEM THIS SOLVES. accept_employer_invite compares the signed-in
 * user's email to the invited email with exact string equality. That is a
 * PROXY for the question we actually care about — does this person control the
 * invited mailbox — and the proxy fails for real people:
 *
 *   · invited at jane@restaurant.co.uk, signs up with her personal Gmail
 *   · invited at jane.smith@, signs in as janesmith@ — same mailbox, and
 *     Gmail treats the dots as noise; the string comparison does not
 *   · SIGN IN WITH APPLE, which is guaranteed and permanent: Apple returns a
 *     private relay address, so it can NEVER equal the address that was typed
 *     into the invite form. Every Apple user invited by name-at-company hits a
 *     wall with no way through, the day the app ships.
 *
 * The mismatch screen offers "sign out and switch account", which works when
 * the person has two accounts and used the wrong one. It leads nowhere when
 * there is no account at the invited address, which is all three cases above.
 *
 * THIS DOES NOT WEAKEN WHO MAY ACCEPT — IT IS A STRONGER PROOF OF THE SAME
 * CLAIM. A matching string can be typed by anybody. A code delivered to the
 * invited mailbox can only be read by whoever holds that mailbox, which is the
 * thing the string was standing in for. Every other gate is untouched:
 * expiry, single use, status must be 'invited', one active employer per user.
 *
 * NO DATABASE COLUMN, AND THE REASON IS NOT ONLY THAT IT AVOIDS A MIGRATION.
 * The code is DERIVED from the invite it belongs to, so:
 *   · a code for one invite cannot be used on another — the member id and the
 *     invited address are inside the HMAC;
 *   · there is no stored secret to leak, expire, or forget to clean up;
 *   · re-requesting produces the same code inside the same window rather than
 *     silently killing the previous one. That last property is deliberate:
 *     this project has already shipped a recovery flow where asking twice
 *     destroyed the first link and the failure blamed "expired".
 *
 * WHAT IT GIVES UP, stated rather than discovered later: there is no
 * per-attempt counter, so brute force is bounded only by the size of the code.
 * Hence EIGHT characters from a 32-symbol alphabet — 2^40, about a trillion —
 * rather than the six digits a stored code could afford behind a counter. And
 * a single code cannot be revoked without rotating the shared secret.
 *
 * The secret is FOUNDING_APPROVAL_SECRET, the same one stayHiddenToken and
 * jobDigestToken use, deliberately rather than a fourth to configure and
 * forget. The payload shape is distinct ('invite' prefix, three segments), so
 * a value from another flow cannot verify here.
 */

/** Fifteen minutes per bucket; the previous one is honoured too. */
const BUCKET_MS = 15 * 60_000

/**
 * No 0/O/1/I/L/U. The first four because a person reads this off a screen and
 * types it into another one, and the last because a random string should not
 * be able to spell anything unfortunate.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

function getSecret(): string {
  const s = process.env.FOUNDING_APPROVAL_SECRET
  // Fail closed and loudly. A missing secret must never mean "no code needed";
  // it means this route cannot run, and the caller turns that into a refusal.
  if (!s) throw new Error('FOUNDING_APPROVAL_SECRET is not set')
  return s
}

function codeForBucket(memberId: string, invitedEmail: string, bucket: number): string {
  const payload = `invite.${memberId}.${invitedEmail.trim().toLowerCase()}.${bucket}`
  const mac = createHmac('sha256', getSecret()).update(payload).digest()
  let out = ''
  for (let i = 0; i < 8; i++) out += ALPHABET[mac[i] % ALPHABET.length]
  return out
}

/** The code to send right now. Rendered to a person as XXXX-XXXX. */
export function inviteCode(memberId: string, invitedEmail: string, now: Date = new Date()): string {
  return codeForBucket(memberId, invitedEmail, Math.floor(now.getTime() / BUCKET_MS))
}

export function formatInviteCode(code: string): string {
  return code.slice(0, 4) + '-' + code.slice(4)
}

/**
 * Does this code prove control of the invited mailbox?
 *
 * ACCEPTS THE PREVIOUS BUCKET TOO, so a code is good for 15–30 minutes rather
 * than for however long is left of the current quarter hour. Without that, a
 * code issued at 14:59 dies at 15:00 and the person is told it is wrong when
 * it was right when they were sent it.
 *
 * timingSafeEqual on equal-length buffers, and the comparison is done against
 * BOTH buckets unconditionally rather than short-circuiting on the first —
 * an early return leaks which bucket matched through timing. Cheap here, and
 * the habit is what matters.
 */
export function verifyInviteCode(
  memberId: string,
  invitedEmail: string,
  supplied: string,
  now: Date = new Date(),
): boolean {
  const cleaned = (supplied || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (cleaned.length !== 8) return false
  const bucket = Math.floor(now.getTime() / BUCKET_MS)
  const given = Buffer.from(cleaned, 'utf8')
  let ok = false
  for (const b of [bucket, bucket - 1]) {
    const expected = Buffer.from(codeForBucket(memberId, invitedEmail, b), 'utf8')
    if (expected.length === given.length && timingSafeEqual(expected, given)) ok = true
  }
  return ok
}

/**
 * "j•••@restaurant.co.uk" — enough for the person to recognise their own
 * mailbox, not enough to disclose an address they may not already know.
 *
 * THE INVITED ADDRESS IS ALREADY ON THE MISMATCH SCREEN IN FULL, so this is
 * not the only thing standing between a stranger and that address. It is here
 * so the pattern is right if that screen ever changes, and so a support
 * transcript or a log line carries less than the whole address.
 */
export function maskEmail(email: string): string {
  const [local, domain] = (email || '').split('@')
  if (!local || !domain) return 'your invited address'
  return local[0] + '•••@' + domain
}
