'use client'

// SIGNING UP A CANDIDATE BY EMAIL — one definition for every place that does it.
//
// Two callers: the website's sign-up form (components/CandidateSignupForm.tsx)
// and the iOS app's native sign-up sheet (design G5), which reaches it through
// components/NativeAuthBridge.tsx. The steps, the wording and the order are the
// website's, moved here unchanged on 16 Oct 2026 so the app cannot sign people
// up differently from the site. Read the form's comments for why each step is
// there; they still apply.

import { supabase } from '@/lib/supabase'
import { calculateTrialExpiry } from '@/lib/trialUtils'
import { getStoredAttribution, attributionColumns } from '@/lib/attribution'
import { countryColumns } from '@/lib/geo'
import { isValidEmail, isDisposableEmail } from '@/lib/validateEmail'
import { setPendingConfirm } from '@/lib/pendingConfirm'

export type SignupResult =
  | { ok: true }
  | { ok: false; field: 'name' | 'email' | 'password' | 'exists' | 'general'; message: string }

/** Where the confirmation link should land them: the job they came from, or the dashboard. */
export function confirmRedirectUrl(returnPath: string | null): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
  return `${siteUrl}${returnPath || '/dashboard'}`
}

export async function signUpCandidate(input: {
  fullName: string
  email: string
  password: string
  /** A safe internal path (already checked by the caller), or null. */
  returnPath: string | null
}): Promise<SignupResult> {
  const fullName = input.fullName.trim()
  const email = input.email.trim()
  const { password } = input

  if (!fullName) return { ok: false, field: 'name', message: 'Please enter your name' }
  if (!isValidEmail(email)) return { ok: false, field: 'email', message: 'Please enter a valid email address' }
  if (isDisposableEmail(email)) {
    return { ok: false, field: 'email', message: 'Please use a permanent email address — temporary/disposable inboxes aren’t accepted.' }
  }
  if (password.length < 8) return { ok: false, field: 'password', message: 'Password must be at least 8 characters' }

  try {
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: 'employee' },
        emailRedirectTo: confirmRedirectUrl(input.returnPath),
      },
    })
    if (authError) throw authError
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { ok: false, field: 'exists', message: 'An account with this email already exists. Try logging in instead.' }
    }
    if (!data.user) throw new Error('Could not create your account. Please try again.')

    const now = new Date()
    const trialExpiresAt = calculateTrialExpiry(now)
    await fetch('/api/profile/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: data.user.id,
        profile: {
          full_name: fullName,
          email,
          account_status: 'trial',
          trial_start_date: now.toISOString(),
          trial_expires_at: trialExpiresAt.toISOString(),
          ...attributionColumns(getStoredAttribution()),
          ...countryColumns(),
        },
      }),
    }).catch(() => {})

    setPendingConfirm(email)
    return { ok: true }
  } catch (err: any) {
    const code = err?.code || ''
    const msg = err?.message || ''
    if (code === 'weak_password' || /weak and easy to guess|pwned|leaked|data breach/i.test(msg)) {
      return {
        ok: false,
        field: 'password',
        message:
          "That password has turned up in an online data breach, so it can't be used here — even though it looks strong. Try a longer passphrase (three random words like copper-anvil-mango7 works well), or tap 'Sign up with LinkedIn' above — there's no new password to create.",
      }
    }
    return { ok: false, field: 'general', message: msg || 'Something went wrong. Please try again.' }
  }
}

/** Send the confirmation email again. */
export async function resendSignupEmail(email: string, returnPath: string | null): Promise<boolean> {
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: confirmRedirectUrl(returnPath) },
    })
    return !error
  } catch {
    return false
  }
}
