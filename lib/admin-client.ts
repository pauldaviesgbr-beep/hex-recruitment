// Client-safe admin configuration (no server-only imports)
// TEMPORARY, BRANCH-ONLY (approved procedure): fixture allowlisted for the
// phase-3 render drive. REVERT BEFORE MERGE; merge result gets grepped.
export const ADMIN_EMAILS = ['paul@thrivecareer.co.uk', 'pauldavies.gbr+employer@gmail.com']

export function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
