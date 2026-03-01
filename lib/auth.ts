import { supabase } from './supabase'

/**
 * Get the currently authenticated user from Supabase session.
 * Returns null if no session or on error.
 */
export async function getCurrentUser() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) return null
  return session.user
}

/**
 * Get the current user along with their role (employer | employee).
 * Returns null if no session.
 */
export async function getCurrentUserWithRole() {
  const user = await getCurrentUser()
  if (!user) return null
  const role = user.user_metadata?.role as 'employer' | 'employee' | undefined
  return { user, role }
}

/**
 * Require authentication — redirects to login if no session.
 * Returns the user if authenticated, null otherwise (after triggering redirect).
 */
export async function requireAuth(router: any, redirectTo = '/login') {
  const user = await getCurrentUser()
  if (!user) {
    router.push(redirectTo)
    return null
  }
  return user
}
