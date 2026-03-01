// Client-safe admin configuration (no server-only imports)
export const ADMIN_EMAILS = ['pauldavies.gbr@gmail.com']

export function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
