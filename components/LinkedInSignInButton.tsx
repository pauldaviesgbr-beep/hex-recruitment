'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { safeInternalPath } from '@/lib/safeRedirect'

interface LinkedInSignInButtonProps {
  role: 'employer' | 'employee'
  className?: string
  label?: string
  /**
   * Same-origin path to return to after OAuth completes (e.g. a job's apply
   * page). Carried through the callback as ?next= so a candidate who signed in
   * via LinkedIn from an Apply button lands back on that job, not the dashboard.
   */
  next?: string
}

/**
 * "Continue with LinkedIn" — kicks off the Supabase OAuth flow using the
 * linkedin_oidc provider (LinkedIn's current "Sign In with LinkedIn using
 * OpenID Connect"; the older `linkedin` provider is deprecated). Deliberately
 * mirrors GoogleSignInButton: same redirect/callback route (/auth/callback/
 * <role>), same ?next= apply-redirect threading, and the same oauth_intended_role
 * cookie — so it behaves identically to the Google flow. The provider's client
 * id/secret live in the Supabase dashboard, never in the repo.
 */
export default function LinkedInSignInButton({ role, className, label, next }: LinkedInSignInButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setError('')
    setLoading(true)
    try {
      const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      const safeNext = safeInternalPath(next) || ''
      const redirectTo = `${siteUrl}/auth/callback/${role}${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`
      // Mirror the Google flow so SessionGuard can recover the intended role on
      // whichever page the user lands on after OAuth.
      document.cookie = `oauth_intended_role=${role}; path=/; max-age=600; SameSite=Lax`
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'linkedin_oidc',
        options: {
          redirectTo,
          scopes: 'openid profile email',
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
      }
      // On success, the browser is navigated to LinkedIn — nothing to do.
    } catch (err: any) {
      setError(err?.message || 'Failed to start LinkedIn sign-in')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={className}
        aria-label="Continue with LinkedIn"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#0A66C2"
            d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45C23.2 24 24 23.22 24 22.27V1.73C24 .77 23.2 0 22.22 0z"
          />
        </svg>
        {loading ? 'Taking you to LinkedIn…' : (label || 'Continue with LinkedIn')}
      </button>
      {error && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</div>}
    </>
  )
}
