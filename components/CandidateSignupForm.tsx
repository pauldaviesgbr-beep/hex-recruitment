'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { calculateTrialExpiry } from '@/lib/trialUtils'
import { getStoredAttribution, attributionColumns } from '@/lib/attribution'
import { isValidEmail, isDisposableEmail } from '@/lib/validateEmail'
import { safeInternalPath } from '@/lib/safeRedirect'
import PasswordInput from './PasswordInput'
import LiveJobCount from './LiveJobCount'
import { Ico } from '@/components/icons'

// Minimal candidate signup: full name + email + password ONLY (Phase 2, section A).
// Everything else the old 5-step wizard collected is now deferred to post-login
// progressive profiling. On success we show a strong "holding" screen (section C,
// Option B) — NOT a dead-end — while keeping Supabase email confirmation ON: the
// user finishes by clicking the link in their email (which logs them in via the
// unchanged /auth/confirm path). OAuth (Google/LinkedIn) is the promoted path and
// bypasses this form entirely.
export default function CandidateSignupForm() {
  const searchParams = useSearchParams()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  // Carry an Apply-gate return path (?redirect=/job/<id>?apply=1) through the
  // confirmation email as ?next, so the link lands them back on the job.
  const applyRedirect = safeInternalPath(searchParams.get('redirect'))
  const nextQS = applyRedirect ? `&next=${encodeURIComponent(applyRedirect)}` : ''
  const confirmRedirect = () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    return `${siteUrl}/auth/confirm?role=employee${nextQS}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!fullName.trim()) return setError('Please enter your name')
    if (!isValidEmail(email)) return setError('Please enter a valid email address')
    if (isDisposableEmail(email)) return setError('Please use a permanent email address — temporary/disposable inboxes aren’t accepted.')
    if (password.length < 8) return setError('Password must be at least 8 characters')

    setLoading(true)
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim(), role: 'employee' },
          emailRedirectTo: confirmRedirect(),
        },
      })
      if (authError) throw authError
      // Supabase obfuscates "already registered" by returning a user with no
      // identities and no error — surface a helpful message instead of a
      // silent no-op holding screen.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError('An account with this email already exists. Try logging in instead.')
        setLoading(false)
        return
      }
      if (!data.user) throw new Error('Could not create your account. Please try again.')

      // Minimal profile row via the service-role endpoint (anon has no session
      // yet with confirmation on). Everything else is filled post-login.
      const now = new Date()
      const trialExpiresAt = calculateTrialExpiry(now)
      await fetch('/api/profile/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: data.user.id,
          profile: {
            full_name: fullName.trim(),
            email: email.trim(),
            account_status: 'trial',
            trial_start_date: now.toISOString(),
            trial_expires_at: trialExpiresAt.toISOString(),
            // The tag layer only. heard_from is asked on the dashboard now
            // (components/HeardFromPrompt.tsx) and fills the gap there when no
            // ?ref / ?utm_* was carried — normalizeSource ranks tags above the
            // self-report, and the prompt honours that same priority.
            ...attributionColumns(getStoredAttribution()),
          },
        }),
      }).catch(() => {})

      // Remember the pending confirmation so the apply-gate / login page can show
      // a "confirm your email to apply" prompt instead of a bare login they can't
      // complete yet. Cleared on successful login.
      try { localStorage.setItem('thrive_pending_confirm', email.trim()) } catch { /* ignore */ }
      setSubmitted(true)
    } catch (err: any) {
      // Supabase's leaked-password protection (HaveIBeenPwned) rejects any
      // password found in a breach corpus with a blunt "weak and easy to guess"
      // message. To someone who just typed a long password that reads as broken,
      // so they retry variants of the same breached pattern and give up. Replace
      // it with an honest explanation + the one-tap escape hatch.
      const code = err?.code || ''
      const msg = err?.message || ''
      if (code === 'weak_password' || /weak and easy to guess|pwned|leaked|data breach/i.test(msg)) {
        setError(
          "That password has turned up in an online data breach, so it can't be used here — even though it looks strong. Try a longer passphrase (three random words like copper-anvil-mango7 works well), or tap 'Sign up with LinkedIn' above for one-tap access, no password needed."
        )
      } else {
        setError(msg || 'Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResend('sending')
    try {
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: confirmRedirect() },
      })
      setResend(resendErr ? 'error' : 'sent')
    } catch {
      setResend('error')
    }
  }

  // ── Holding screen (section C / Option B) — strong, not a dead-end ──
  if (submitted) {
    return (
      <div className="hold">
        <div className="holdIcon" aria-hidden="true"><Ico name="mail" size={20} /></div>
        <h2 className="holdTitle">Confirm your email to finish</h2>
        <p className="holdText">
          We've sent a confirmation link to <strong>{email}</strong>. Click it and you'll be
          taken straight in — no password needed the first time.
        </p>

        <button type="button" onClick={handleResend} disabled={resend === 'sending'} className="resendBtn">
          {resend === 'sending' ? 'Sending…' : resend === 'sent' ? 'Email sent ✓' : 'Resend email'}
        </button>
        {resend === 'error' && <p className="resendErr">Couldn't resend — check the address and try again.</p>}
        <p className="holdHint">Can't see it? Check your spam folder, or resend above.</p>

        <div className="holdDivider" />
        <LiveJobCount style={{ color: 'inherit' }} />
        <Link href="/jobs" className="browseLink">Browse live roles while you wait →</Link>

        <style jsx>{`
          .hold { max-width: 480px; margin: 0 auto; text-align: center; padding: 1rem 0; }
          .holdIcon { font-size: 2.6rem; margin-bottom: 0.5rem; }
          .holdTitle { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.6rem; }
          .holdText { color: #4b5563; line-height: 1.55; margin: 0 0 1.4rem; }
          .resendBtn {
            border: 1px solid #d1d5db; background: #fff; color: #111827;
            padding: 0.6rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer;
          }
          .resendBtn:disabled { opacity: 0.6; cursor: default; }
          .resendErr { color: #b91c1c; font-size: 0.85rem; margin: 0.5rem 0 0; }
          .holdHint { color: #6b7280; font-size: 0.85rem; margin: 0.8rem 0 0; }
          .holdDivider { height: 1px; background: #e5e7eb; margin: 1.6rem 0 1.2rem; }
          .browseLink { display: inline-block; margin-top: 0.6rem; color: #111827; font-weight: 600; }
        `}</style>
      </div>
    )
  }

  // ── Minimal signup form ──
  return (
    <form method="post" onSubmit={handleSubmit} className="signup">
      {error && <div className="err">{error}</div>}

      <div className="grp">
        <label htmlFor="fullName">Full name</label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          className="authInput"
          placeholder="John Smith"
          autoComplete="name"
          required
        />
      </div>

      <div className="grp">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="authInput"
          placeholder="you@email.com"
          autoComplete="email"
          required
        />
      </div>

      <div className="grp">
        <label htmlFor="password">Password</label>
        <PasswordInput
          id="password"
          name="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="authInput"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          required
        />
        <p className="pwHint">Tip: three random words make a password that's strong and easy to remember.</p>
      </div>

      {/* "How did you hear about us?" USED TO SIT HERE and now lives on the
          dashboard (components/HeardFromPrompt.tsx) — asked once, after the
          account exists. It is our attribution problem, not something to put
          between a person and the thing they came to do. The two changes
          shipped together on purpose: this dropdown is the only attribution
          layer that actually works, so removing it without the replacement
          would have quietly killed the one signal we have. */}

      <button type="submit" disabled={loading} className="submit">
        {loading ? 'Creating your account…' : 'Create account'}
      </button>

      <p className="tiny">That's it — you can add your CV, skills and preferences once you're in.</p>

      <style jsx>{`
        .signup { max-width: 480px; margin: 0 auto; }
        .grp { margin-bottom: 1rem; text-align: left; }
        .grp label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 0.35rem; color: #111827; }
        :global(.authInput) {
          width: 100%; padding: 0.7rem 0.85rem; border: 1px solid #d1d5db;
          border-radius: 8px; font-size: 1rem; background: #fff;
        }
        :global(.authInput:focus) { outline: none; border-color: #111827; box-shadow: 0 0 0 3px rgba(17,24,39,0.08); }
        .submit {
          width: 100%; padding: 0.8rem; border: none; border-radius: 8px;
          background: #111827; color: #fff; font-weight: 700; font-size: 1rem; cursor: pointer; margin-top: 0.3rem;
        }
        .submit:disabled { opacity: 0.65; cursor: default; }
        .err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 0.7rem 0.85rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; }
        .tiny { text-align: center; color: #6b7280; font-size: 0.85rem; margin: 0.9rem 0 0; }
        .pwHint { margin: 0.4rem 0 0; font-size: 0.8rem; color: #6b7280; line-height: 1.4; }
        .optional { color: #94a3b8; font-weight: 400; }
      `}</style>
    </form>
  )
}
