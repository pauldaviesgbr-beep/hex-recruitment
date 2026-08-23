'use client'

// THE CANDIDATE SIGN-UP SCREEN — one component, two prop sets.
//
// `register`  — somebody chose to join. "Create your free account."
// `applyGate` — somebody tapped Apply on a job and has no account yet.
//               Same screen, with a strip naming the role above the heading.
//
// WHY THIS EXISTS AT ALL. Until now the apply gate was /login/employee: a page
// headed "Create a free account to apply" over an EMAIL AND PASSWORD LOGIN
// FORM with a Login button. A stranger read the invitation, typed an email,
// invented a password, pressed the only button there was, and got "Invalid
// login credentials". Paul hit it himself on 22 Aug 2026 — three times, on
// production, on his own phone. The heading was fixed on 15 August; the form
// underneath it never was.
//
// So the gate is not a login page wearing a sign-up heading any more. It is
// the sign-up screen, and the only difference is the strip.
//
// AND IT MOVES THE GATE ONTO A SIGN-UP ROUTE, which matters beyond tidiness:
// the header shows Log in on sign-up screens and hides it on login screens, so
// a returning chef who taps Apply now gets a way out of a form that has no
// password box. That was a dependency I had to record against branch 3 when
// the gate still lived at /login/employee. It resolves itself here.
//
// "We'll bring you straight back to the role" APPEARS TWICE ON THE GATE — in
// the strip and in the subtitle — and it is true. Proved end to end on 22 Aug
// 2026 by signing up from a job page, clicking the actual link in the actual
// email, and landing on the role with the apply modal open. Do not weaken that
// sentence without re-driving it: it is the only line on this screen that
// answers the question actually in the person's head.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import CandidateSignupForm from '@/components/CandidateSignupForm'
import LiveJobCount from '@/components/LiveJobCount'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import LinkedInSignInButton from '@/components/LinkedInSignInButton'
import { Ico } from '@/components/icons'
import { safeInternalPath } from '@/lib/safeRedirect'
import { applyGateJobId } from '@/lib/applyGate'
import styles from './SignupPanel.module.css'


export default function SignupPanel({ returnTo }: { returnTo?: string | null }) {
  const safeReturn = safeInternalPath(returnTo)
  const jobId = applyGateJobId(returnTo)
  const isGate = !!jobId

  // The role named in the strip. Fetched rather than passed, because the only
  // thing the URL carries is an id — and inventing a title from the id is how
  // you end up printing something the advert does not say.
  const [role, setRole] = useState<{ title: string; company: string } | null>(null)
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    supabase.from('jobs').select('title, company').eq('id', jobId).maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.title) setRole({ title: data.title, company: data.company || '' })
      })
    return () => { cancelled = true }
  }, [jobId])

  return (
    <div className={styles.panel}>
      {/* THE STRIP RENDERS ONLY ONCE THE ROLE IS KNOWN. An empty yellow box
          promising to bring somebody back to a role it cannot name is worse
          than no strip: it reads as a page that failed to load. If the fetch
          never returns, the screen is simply the register screen — which is
          correct, and still gets them an account. */}
      {isGate && role && (
        <div className={styles.roleStrip}>
          <span className={styles.roleIcon} aria-hidden="true">
            <Ico name="briefcase" size={20} />
          </span>
          <span className={styles.roleText}>
            <span className={styles.roleTitle}>
              {role.title}{role.company ? ` · ${role.company}` : ''}
            </span>
            <span className={styles.roleSub}>You&rsquo;ll go straight back here when you&rsquo;re done.</span>
          </span>
        </div>
      )}

      <h1 className={styles.title}>
        {isGate ? 'Create a free account to apply' : 'Create your free account'}
      </h1>
      <p className={styles.subtitle}>
        {isGate
          ? 'It takes a minute, and we’ll bring you straight back to the role.'
          : 'Apply in two taps once you’re in.'}
      </p>

      {!isGate && <LiveJobCount className={styles.count} />}

      {/* OAUTH IS FIRST AND IT IS NOT THE FILLED BUTTON.
          Design supersedes the earlier "LinkedIn is level 1" rule: every screen
          here also carries an email form, and two filled buttons on one screen
          is not a hierarchy. LinkedIn keeps first position and loses the fill.
          The eyebrow claims only what is always true — Thrive never makes you
          invent another password. It does not claim "one tap": signed out on
          that device, LinkedIn asks for one, which was false for exactly the
          person it would annoy most. */}
      <p className={styles.eyebrow}>Fastest &mdash; no new password to create</p>
      <LinkedInSignInButton role="employee" className={styles.oauth} label="Continue with LinkedIn" next={safeReturn || undefined} />
      <div className={styles.oauthGap}>
        <GoogleSignInButton role="employee" className={styles.oauth} label="Continue with Google" next={safeReturn || undefined} />
      </div>

      <div className={styles.divider}><span>or with email</span></div>

      <CandidateSignupForm submitLabel={isGate ? 'Create account and apply' : 'Create account'} />

      <p className={styles.foot}>
        Already with us?{' '}
        {/* CARRIES THE ROLE. Somebody who taps Apply, reaches sign-up, then
            remembers they already have an account must not lose the job on the
            way to logging in. This link dropped it once already. */}
        <Link
          href={safeReturn ? `/login/employee?redirect=${encodeURIComponent(safeReturn)}` : '/login/employee'}
          className={styles.footLink}
        >
          Log in
        </Link>
      </p>
    </div>
  )
}
