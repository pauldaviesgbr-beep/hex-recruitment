// Client-safe admin configuration (no server-only imports)
// TEMPORARY, BRANCH-ONLY: the test employer fixture is allowlisted so the
// rendered admin page can be driven. THIS LINE MUST NOT REACH MAIN — the
// commit adding it is reverted before merge, and the merge is grepped.
export const ADMIN_EMAILS = ['paul@thrivecareer.co.uk', 'pauldavies.gbr+employer@gmail.com']

export function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
