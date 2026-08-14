'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import PasswordInput from '@/components/PasswordInput'
import styles from './page.module.css'

type Phase =
  | 'loading'
  | 'need-auth'
  | 'mismatch'
  | 'accepting'
  | 'done'
  | 'invalid'
  | 'expired'
  | 'used'
  | 'error'

const ERROR_COPY: Record<string, string> = {
  expired: 'This invitation has expired. Ask your team to send you a new one.',
  already_used: 'This invitation has already been accepted.',
  invalid: 'This invitation link is invalid or has been revoked.',
  email_mismatch: 'This invitation is for a different email address.',
  already_in_account: "You're already part of a team on Thrive. Leave that account before joining another.",
  server_error: 'Something went wrong accepting the invitation. Please try again.',
}

// Module-level (stable identity) so it does NOT remount on every keystroke —
// a Shell defined inside the component would be a new component type each render,
// unmounting/remounting the form inputs and yanking focus back to the autoFocus
// field.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Image src="/logo/thrive-mark-192.png" alt="Thrive" width={46} height={46} className={styles.mark} />
        {children}
      </div>
    </div>
  )
}

function AcceptInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [phase, setPhase] = useState<Phase>('loading')
  const [company, setCompany] = useState('a team')
  const [invitedEmail, setInvitedEmail] = useState('')
  const [currentEmail, setCurrentEmail] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Minimal staff-signup form (Create your account from an invite).
  const [signupName, setSignupName] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupBusy, setSignupBusy] = useState(false)
  const [signupErr, setSignupErr] = useState('')

  const accept = useCallback(async () => {
    setPhase('accepting')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setPhase('need-auth'); return }

    const res = await fetch('/api/team/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ token }),
    })
    const json = await res.json().catch(() => ({ ok: false, error: 'server_error' }))

    if (!json.ok) {
      if (json.error === 'expired') setPhase('expired')
      else if (json.error === 'already_used') setPhase('used')
      else if (json.error === 'invalid') setPhase('invalid')
      else { setErrorMsg(ERROR_COPY[json.error] || ERROR_COPY.server_error); setPhase('error') }
      return
    }

    // Role was set to 'employer' server-side. Refresh the session so the new
    // metadata is in the token. refreshSession() writes the rotated session to
    // the shared cookie store the employer layout reads, so no separate bridge
    // is needed.
    try {
      await supabase.auth.refreshSession()
    } catch { /* best effort */ }

    setPhase('done')
    router.push('/employer/dashboard')
  }, [token, router])

  // Create a minimal EMPLOYER-SIDE staff account for the invited email, then
  // sign in and accept — the invitee joins the existing employer (no candidate
  // profile, no company creation).
  const handleSignup = useCallback(async () => {
    setSignupErr('')
    if (signupName.trim().length < 2) { setSignupErr('Please enter your name.'); return }
    if (signupPassword.length < 8) { setSignupErr('Password must be at least 8 characters.'); return }
    setSignupBusy(true)

    const res = await fetch('/api/team/invite-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name: signupName.trim(), password: signupPassword }),
    })
    const json = await res.json().catch(() => ({ error: 'server_error' }))
    if (!json.ok) {
      if (json.error === 'account_exists') {
        setSignupErr('You already have an account with this email — use "I already have an account" below.')
      } else {
        setSignupErr(json.error || 'Could not create your account.')
      }
      setSignupBusy(false)
      return
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: invitedEmail, password: signupPassword })
    if (signInErr) {
      setSignupErr('Account created, but sign-in failed. Try logging in.')
      setSignupBusy(false)
      return
    }
    // Session is live — run the shared accept flow (accept RPC → cookie bridge → dashboard).
    await accept()
  }, [token, signupName, signupPassword, invitedEmail, accept])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      if (!token) { setPhase('invalid'); return }

      const infoRes = await fetch(`/api/team/invite-info?token=${encodeURIComponent(token)}`)
      const info = await infoRes.json().catch(() => ({ status: 'invalid' }))
      if (cancelled) return

      if (info.status !== 'valid') {
        setPhase(info.status === 'expired' ? 'expired' : info.status === 'used' ? 'used' : 'invalid')
        return
      }
      setCompany(info.company || 'a team')
      setInvitedEmail((info.email || '').toLowerCase())

      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { setPhase('need-auth'); return }

      const email = (session.user.email || '').toLowerCase()
      setCurrentEmail(email)
      if (email !== (info.email || '').toLowerCase()) { setPhase('mismatch'); return }

      accept()
    }
    init()
    return () => { cancelled = true }
  }, [token, accept])

  const acceptUrl = `/invite/accept?token=${encodeURIComponent(token)}`
  const emailQ = invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ''

  if (phase === 'loading' || phase === 'accepting' || phase === 'done') {
    return (
      <Shell>
        <p className={styles.eyebrow}>Team invitation</p>
        <h1 className={styles.title}>{phase === 'loading' ? 'Checking your invitation…' : 'Joining the team…'}</h1>
        <div className={styles.spinner} />
      </Shell>
    )
  }

  if (phase === 'need-auth') {
    return (
      <Shell>
        <p className={styles.eyebrow}>Team invitation</p>
        <h1 className={styles.title}>Join <span className={styles.company}>{company}</span> on Thrive</h1>
        <p className={styles.body}>Create your account to join the team. Your invitation email is locked below.</p>

        <form
          method="post"
          className={styles.actions}
          onSubmit={(e) => { e.preventDefault(); handleSignup() }}
        >
          <input className={styles.field} type="email" value={invitedEmail} readOnly aria-label="Invited email" />
          <input
            className={styles.field}
            type="text"
            placeholder="Your full name"
            value={signupName}
            onChange={(e) => setSignupName(e.target.value)}
            autoComplete="name"
            autoFocus
          />
          <PasswordInput
            className={styles.field}
            placeholder="Create a password (8+ characters)"
            value={signupPassword}
            onChange={(e) => setSignupPassword(e.target.value)}
            autoComplete="new-password"
          />
          {signupErr && <p className={styles.fieldError}>{signupErr}</p>}
          <button className={styles.primary} type="submit" disabled={signupBusy}>
            {signupBusy ? 'Joining…' : `Create account & join ${company}`}
          </button>
        </form>

        <Link className={styles.link} href={`/login/employer?redirect=${encodeURIComponent(acceptUrl)}${emailQ}`}>
          I already have an account
        </Link>
      </Shell>
    )
  }

  if (phase === 'mismatch') {
    return (
      <Shell>
        <p className={styles.eyebrow}>Team invitation</p>
        <h1 className={styles.title}>Wrong account</h1>
        <p className={styles.body}>
          This invitation is for <span className={styles.email}>{invitedEmail}</span>, but you're signed in as <span className={styles.email}>{currentEmail}</span>.
        </p>
        <div className={styles.actions}>
          <button
            className={styles.primary}
            onClick={async () => { await supabase.auth.signOut(); router.refresh(); setPhase('need-auth') }}
          >
            Sign out and switch account
          </button>
        </div>
      </Shell>
    )
  }

  // Terminal error states
  const heading =
    phase === 'expired' ? 'Invitation expired'
    : phase === 'used' ? 'Already accepted'
    : phase === 'error' ? 'Something went wrong'
    : 'Invalid invitation'
  const message =
    phase === 'expired' ? ERROR_COPY.expired
    : phase === 'used' ? ERROR_COPY.already_used
    : phase === 'error' ? errorMsg
    : ERROR_COPY.invalid

  return (
    <Shell>
      <div className={styles.errorIcon}>{phase === 'used' ? '✅' : '⚠️'}</div>
      <h1 className={styles.title}>{heading}</h1>
      <p className={styles.body}>{message}</p>
      <Link className={styles.link} href="/">Back to Thrive</Link>
    </Shell>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className={styles.wrap}><div className={styles.card} /></div>}>
      <AcceptInviteContent />
    </Suspense>
  )
}
