// Client-safe admin configuration (no server-only imports)
export const ADMIN_EMAILS = ['paul@thrivecareer.co.uk']

export function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
