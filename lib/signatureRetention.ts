// SIGNATURE METADATA IS NOT A CONTRACT TERM, AND IT DOES NOT LIVE FOREVER.
//
// Paul's decision, 25 Aug 2026: signature_ip and signature_user_agent are
// cleared TWELVE MONTHS after signing, and immediately on erasure.
//
// THE REASONING, so the number is not mistaken for an arbitrary one: the OFFER
// is the contract and it is retained under legitimate interest for legal
// claims. The IP and user agent are ANTI-FRAUD metadata, not terms, and their
// value decays fast — a dispute about whether a signature was genuine surfaces
// early if it surfaces at all. Twelve months covers that window without holding
// surveillance data on people for years against a hypothetical.
//
// ── THE LIMIT THIS FILE USED TO CARRY HAS BEEN REMOVED AT SOURCE ──────────
//
// This block used to say: clearing these columns does not remove the IP from
// the signed PDF, because lib/signPdf.ts printed it into the certificate page
// and that PDF is kept as the contract. The address would have been gone from
// the database and still on the document, and any claim we published had to
// match the weaker of the two.
//
// PAUL TOOK THE OTHER OPTION ON 25 AUG 2026: THE PDF STOPPED CARRYING IT.
// The IP is no longer accepted by SignatureBlock at all, so passing one is a
// compiler error rather than a silent no-op. Clearing these columns now really
// does remove the address, and the privacy policy says so in as many words.
// Zero offers existed at the time, so there was nothing to remediate.
//
// STILL TRUE, AND STILL WORTH KNOWING: the certificate page continues to print
// the SIGNER'S USER AGENT as "Device". `signature_user_agent` is cleared here
// at twelve months and the Device line on the retained PDF is not, so that one
// column keeps exactly the asymmetry the IP used to have. It is a smaller
// string and a weaker identifier, and it has not been decided either way —
// flagged rather than fixed, because what a retained contract says is Paul's
// call and not a tidy-up.

/** Twelve months, in days. Named rather than inlined so the policy and the
 *  code cannot drift apart silently. */
export const SIGNATURE_METADATA_RETENTION_DAYS = 365

export const SIGNATURE_METADATA_COLUMNS = [
  'signature_ip',
  'signature_user_agent',
  'employer_signature_ip',
  'employer_signature_user_agent',
] as const

/**
 * Is this signature old enough for its metadata to be cleared?
 *
 * Pure, and takes `now` as a real parameter rather than reading the clock, so
 * a check can generate two answers at two instants. A rule about the passage
 * of time cannot be proved by looking once.
 */
export function metadataDue(signedAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!signedAt) return false
  const t = signedAt instanceof Date ? signedAt.getTime() : Date.parse(signedAt)
  if (Number.isNaN(t)) return false
  return (now.getTime() - t) / 86_400_000 >= SIGNATURE_METADATA_RETENTION_DAYS
}

/**
 * HOW THIS SHOULD RUN — PROPOSED, NOT BUILT, AND DELIBERATELY NOT A CRON.
 *
 * Three options, and the recommendation is the third:
 *
 *   1. A CRON. Rejected for now. An expiry cron was retired from this project
 *      this week precisely because nobody could tell whether it had run, and a
 *      second one arriving quietly would repeat that. If it ever is a cron it
 *      should be added deliberately, with a receipt line per invocation.
 *
 *   2. ON READ. Clearing during a GET is a write on a read path — surprising,
 *      untestable in isolation, and it does nothing at all for a row nobody
 *      opens, which is most of them.
 *
 *   3. A SWEEP SCRIPT, run when someone runs it, plus the immediate clear on
 *      erasure that already exists. RECOMMENDED. There are ZERO offers today,
 *      so nothing is overdue and nothing is at risk; by the time there are
 *      enough for this to matter it will be obvious whether it wants
 *      automating. A script that has to be run is honest about being manual;
 *      a cron nobody checks is not.
 *
 * The RULE is implemented here either way. The scheduling is a separate
 * decision and is Paul's.
 */
export function overdueFilter(now: Date = new Date()): string {
  const cutoff = new Date(now.getTime() - SIGNATURE_METADATA_RETENTION_DAYS * 86_400_000)
  return cutoff.toISOString()
}
