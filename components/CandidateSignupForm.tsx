'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { safeInternalPath } from '@/lib/safeRedirect'
import { signUpCandidate, resendSignupEmail } from '@/lib/candidateSignup'
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
/**
 * `submitLabel` — "Create account" on the register screen, "Create account and
 * apply" on the apply gate. The design's two prop sets differ in four places
 * and this is the one that tells the person what actually happens next: they
 * are not just making an account, they are applying for the role named in the
 * strip above.
 */
export default function CandidateSignupForm({ submitLabel = 'Create account' }: { submitLabel?: string }) {
  const searchParams = useSearchParams()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  // Carry an Apply-gate return path (?redirect=/job/<id>?apply=1) through the
  // confirmation email, so the link lands them back on the job.
  //
  // THIS USED TO BUILD THE WHOLE /auth/confirm URL AND IT WAS DEAD CODE. The
  // confirmation email is not rendered by us — Supabase renders it from a
  // template pasted into its dashboard, and that template built its own link
  // with `next=/dashboard` hardcoded. So everything computed here was
  // discarded, in silence, and every candidate who signed up by email from a
  // job page was returned to the dashboard instead of the role. Proved on
  // 22 Aug 2026 by reading the actual email and clicking the actual link.
  //
  // What we hand over now is the FINAL DESTINATION, not a confirm URL. The
  // template puts it in `?next=` via `{{ .RedirectTo }}`, which is Supabase's
  // own documented pattern. `role=` is no longer threaded through the URL and
  // does not need to be: signUp below stamps `role: 'employee'` into
  // user_metadata, and the callback reads it from there.
  //
  // IF THE TEMPLATE IS EVER EDITED IN THE DASHBOARD, THIS BREAKS SILENTLY
  // AGAIN. It is the one link in this chain that no check in the repo can
  // see — not tsc, not the build, not verify.
  const applyRedirect = safeInternalPath(searchParams.get('redirect'))

  // THE STEPS LIVE IN lib/candidateSignup.ts, shared with the iOS app's native
  // sign-up sheet, so the two cannot sign people up differently. Moved there
  // unchanged on 16 Oct 2026, with the comments explaining each step:
  // already-registered detection, the minimal profile row via the service
  // endpoint, the pending-confirm marker, and the breached-password wording.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await signUpCandidate({ fullName, email, password, returnPath: applyRedirect })
      if (result.ok) setSubmitted(true)
      else setError(result.message)
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResend('sending')
    setResend((await resendSignupEmail(email, applyRedirect)) ? 'sent' : 'error')
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
        {loading ? 'Creating your account…' : submitLabel}
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
