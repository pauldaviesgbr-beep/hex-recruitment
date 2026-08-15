'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { safeInternalPath } from '@/lib/safeRedirect'

interface GoogleSignInButtonProps {
  role: 'employer' | 'employee'
  className?: string
  label?: string
  /**
   * Same-origin path to return to after OAuth completes (e.g. a job's apply
   * page). Carried through the callback as ?next= so a candidate who signed in
   * via Google from an Apply button lands back on that job, not the dashboard.
   */
  next?: string
}

/**
 * Renders the official Google "Continue with Google" button that kicks
 * off the Supabase OAuth flow. The role is carried through the redirect
 * URL so /auth/callback can stamp the right user_metadata.role and
 * create the matching profile row for first-time sign-ins.
 */
export default function GoogleSignInButton({ role, className, label, next }: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setError('')
    setLoading(true)
    try {
      // Use the env var for a stable, known-good origin — window.location.origin
      // can be unreliable during SSR or in edge cases.
      const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      // Carry a same-origin return path through the callback (?next=) so the
      // user lands back where they started (e.g. a job's apply page).
      const safeNext = safeInternalPath(next) || ''
      const redirectTo = `${siteUrl}/auth/callback/${role}${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`
      console.log('[GoogleSignIn] redirectTo:', redirectTo)
      // Store intended role in a cookie so SessionGuard can pick it up
      // on whichever page the user lands on after OAuth (Supabase may
      // redirect to a different page if the callback URL isn't in the
      // allowlist).
      document.cookie = `oauth_intended_role=${role}; path=/; max-age=600; SameSite=Lax`
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'email profile',
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
      }
      // On success, the browser is navigated to Google — nothing to do.
    } catch (err: any) {
      setError(err?.message || 'Failed to start Google sign-in')
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
        aria-label="Continue with Google"
      >
        {/* Google's current official branding 'G' (Sign in with Google
            guidelines). Replaces the older Material four-colour G. Brand
            colours are a permanent exception to the currentColor icon rule:
            these are trust marks, not icons. */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {loading ? 'Taking you to Google…' : (label || 'Continue with Google')}
      </button>
      {error && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</div>}
    </>
  )
}
