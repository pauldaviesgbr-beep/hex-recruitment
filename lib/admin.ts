import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_EMAILS, isAdmin } from './admin-client'

export { ADMIN_EMAILS, isAdmin }

/**
 * Creates a Supabase admin client.
 * - With service role key: bypasses RLS (full access)
 * - Without service role key: falls back to anon key + optional JWT for RLS auth
 */
export function createAdminClient(authToken?: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceRoleKey) {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
  }

  // Fallback: authenticate with the admin user's JWT so RLS sees them as logged in
  const options = authToken
    ? { global: { headers: { Authorization: `Bearer ${authToken}` } } }
    : undefined

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    options
  )
}

export async function verifyAdmin(req: Request): Promise<{ authorized: boolean; email?: string; token?: string }> {
  const admin = createAdminClient()

  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const { data: { user } } = await admin.auth.getUser(token)
    if (user && isAdmin(user.email)) {
      return { authorized: true, email: user.email, token }
    }
  }

  return { authorized: false }
}
