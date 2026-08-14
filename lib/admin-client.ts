// Client-safe admin configuration (no server-only imports)
// TEMPORARY, BRANCH-ONLY (same approved pattern as this morning): the test
// employer is allowlisted so the admin render can be driven. REVERT BEFORE
// MERGE; the merge result gets grepped for this address.
export const ADMIN_EMAILS = ['paul@thrivecareer.co.uk', 'pauldavies.gbr+employer@gmail.com']

export function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
