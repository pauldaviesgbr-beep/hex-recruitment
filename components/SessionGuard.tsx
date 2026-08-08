'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function isAuthPage(): boolean {
  const p = window.location.pathname
  // Exclude /register/employer/payment — that's the Stripe card-collection
  // step and must not be interrupted by SessionGuard redirects.
  if (p === '/register/employer/payment') return false
  return p === '/' || p.startsWith('/login') || p.startsWith('/register')
}

/**
 * Global session guard — runs on every page (mounted in layout.tsx).
 *
 * After Google OAuth with PKCE, the server callback writes the session as
 * chunked cookies via @supabase/ssr. The client-side Supabase uses
 * localStorage and can't see those cookies via getSession(). On auth pages
 * (/, /login/*, /register/*) this guard hydrates the client from the
 * chunked cookies and redirects the user to their dashboard.
 *
 * Non-auth pages do their own hydration (see app/employer/dashboard) so
 * users landing directly on a protected route after OAuth don't have to
 * bounce through an auth page.
 */
export default function SessionGuard() {
  const router = useRouter()
  const handled = useRef(false)
  // Once a redirect is initiated we must not start another. With soft
  // navigation (router.push) SessionGuard stays mounted across the route
  // change, so handled/redirecting persist and the effect cannot re-enter
  // — the failure mode that bounced founding employers between /login,
  // /register/employer/payment and /register/employer-free in an infinite
  // hard-navigation loop.
  const redirecting = useRef(false)
  // Set by the volatile-cleanup effect when it signs a Remember-me-off
  // session out on a new browser session, so the detection effect doesn't
  // redirect a session we're in the middle of clearing.
  const volatileSignOut = useRef(false)

  // Volatile session cleanup — "Remember me" left unticked.
  //
  // THE MARKER IS A SESSION COOKIE, NOT sessionStorage, AND THAT IS THE WHOLE
  // FIX. sessionStorage is per browsing CONTEXT: a second tab has an empty one,
  // which this effect could not tell apart from a fresh browser. So opening a
  // link in a new tab ran the sign-out — and because signOut() clears the
  // shared cookie store, it signed the person out of the tab they were already
  // working in. Measured on production before the change: with the box
  // unticked, tab B landed on /login with 0 auth cookies and tab A followed it.
  // A cookie with no Max-Age is per BROWSER: shared across tabs, gone when the
  // browser closes. That is exactly the boundary this feature needs, and the
  // browser draws it instead of us.
  //
  // KNOWN TRADE, CHOSEN RATHER THAN MISSED: a browser set to restore tabs on
  // relaunch (Chrome's "Continue where you left off") can restore session
  // cookies too, so on that setting untick-and-close may no longer sign you
  // out — where sessionStorage was always cleared. Accepted deliberately: the
  // second-tab sign-out hit everyone who opened a link in a new tab and lost
  // them their session mid-work, while the restore-tabs case needs someone to
  // have chosen that setting AND to be relying on the checkbox.
  useEffect(() => {
    const sessionStarted = getCookie('hex_session_started')
    if (!sessionStarted) {
      const prevVolatile = localStorage.getItem('hex_prev_volatile')
      if (prevVolatile === '1') {
        volatileSignOut.current = true
        supabase.auth.signOut()
        localStorage.removeItem('hex_prev_volatile')
      }
      // No Max-Age and no Expires — that is what makes it a session cookie.
      document.cookie =
        'hex_session_started=1; path=/; SameSite=Lax' +
        (window.location.protocol === 'https:' ? '; Secure' : '')
    }
  }, [])

  // Session detection + redirect
  useEffect(() => {
    if (handled.current || redirecting.current) return
    if (!isAuthPage()) return

    // Single-fire, soft redirect. router.push keeps SessionGuard mounted
    // across the navigation so handled/redirecting survive — it cannot
    // re-enter into a loop even if another decider disagrees.
    const go = (path: string) => {
      handled.current = true
      redirecting.current = true
      router.push(path)
    }

    const handleAuth = async () => {
      // The cleanup effect above is signing out a volatile (Remember-me-off)
      // session — don't redirect a session we're about to clear, or we'd
      // push the user onto a protected route the server then rejects.
      if (volatileSignOut.current) return

      // 1. Check localStorage session first
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        const role = session.user.user_metadata?.role as string | undefined
        if (role) {
          // ONE destination per role. SessionGuard no longer chooses
          // payment-vs-dashboard — the server-side guard in
          // app/employer/layout.tsx is the single source of truth for
          // approval/entitlement (it bounces pending/unapproved employers
          // to /account-under-review). Routing founding employers (who have
          // no stripe_subscription_id) to /register/employer/payment here
          // collided with each auth page's own "session → dashboard"
          // redirect and caused the loop.
          go(role === 'employer' ? '/employer/dashboard' : '/dashboard')
          return
        }
        // Session but no role — new user, check cookie
        const intendedRole = getCookie('oauth_intended_role') as 'employer' | 'employee' | null
        if (intendedRole) {
          handled.current = true
          await routeNewUser(session.user, intendedRole)
          return
        }
        return
      }

      // No session. Client and server now share one cookie-backed store, so
      // getSession() above already reflects the post-OAuth cookie session that
      // used to require a separate hydration step here — nothing more to do.
    }

    handleAuth()
  }, [])

  return null
}

async function routeNewUser(user: any, intendedRole: 'employer' | 'employee') {
  document.cookie = 'oauth_intended_role=; path=/; max-age=0'

  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'
  console.log('[SessionGuard] New user — stamping role:', intendedRole)

  await supabase.auth.updateUser({ data: { role: intendedRole, full_name: displayName } })

  if (intendedRole === 'employer') {
    const domain = user.email?.split('@')[1]?.split('.')[0] || ''
    const isGeneric = ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail'].includes(domain.toLowerCase())
    const companyName = isGeneric ? 'My Company' : domain.charAt(0).toUpperCase() + domain.slice(1)

    await fetch('/api/profile/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, table: 'employer_profiles', profile: { company_name: companyName, contact_name: displayName, email: user.email || '' } }),
    }).catch(() => {})

    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: user.email, type: 'welcome', data: { contactName: displayName, companyName } }),
    }).catch(() => {})

    // New employer → payment page (trial subscription created there)
    window.location.href = '/register/employer/payment'
  } else {
    await fetch('/api/profile/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, profile: { full_name: displayName, email: user.email || '' } }),
    }).catch(() => {})

    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: user.email, type: 'candidate_welcome', data: { candidateName: displayName } }),
    }).catch(() => {})

    window.location.href = '/dashboard'
  }
}
