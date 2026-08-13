'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import CandidateSignupForm from '@/components/CandidateSignupForm'
import LiveJobCount from '@/components/LiveJobCount'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import LinkedInSignInButton from '@/components/LinkedInSignInButton'
import loginStyles from '../../login/page.module.css'
import styles from './page.module.css'

function RegisterEmployeePageContent() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  return (
    <main className={styles.main}>
      <Header />
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Create your free account</h1>
          <p className={styles.subtitle}>
            Join Thrive and connect with top employers across the UK
          </p>
          <LiveJobCount style={{ marginTop: '0.75rem', color: '#374151' }} />
        </div>

        {/* OAuth is the hero path — one tap, already verified, straight in.
            LinkedIn leads: it's how most candidates join, and it sidesteps the
            leaked-password check that trips people up on the email path. */}
        <div style={{ maxWidth: 480, margin: '0 auto 1.5rem' }}>
          <p style={{ textAlign: 'center', margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 600 }}>
            Fastest way in — one tap, no password
          </p>
          <LinkedInSignInButton role="employee" className={loginStyles.googleBtn} label="Sign up with LinkedIn" next={redirectTo || undefined} />
          <div style={{ marginTop: '0.6rem' }}>
            <GoogleSignInButton role="employee" className={loginStyles.googleBtn} label="Sign up with Google" next={redirectTo || undefined} />
          </div>
          <div className={loginStyles.divider}><span>or sign up with email</span></div>
        </div>

        <CandidateSignupForm />

        <div className={styles.loginLink}>
          <p>Already have an account?</p>
          {/*
            CARRIES THE JOB. Everything else on this page threads the apply
            redirect — the OAuth buttons via `next`, the email form via the
            confirmation link's `?next` — but this one link dropped it. Someone
            who tapped Apply, reached signup, then realised they already had an
            account would arrive at a bare login and, after signing in, land on
            the dashboard instead of the role they wanted. The one door out of
            this page that forgot where the person was going.
          */}
          <Link href={redirectTo ? `/login/employee?redirect=${encodeURIComponent(redirectTo)}` : '/login/employee'}>
            Log in here
          </Link>
        </div>
      </div>
    </main>
  )
}

// Wrap in Suspense for useSearchParams (used by JobSeekerProfileForm)
export default function RegisterEmployeePage() {
  return (
    <Suspense fallback={
      <main>
        <Header />
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          Loading...
        </div>
      </main>
    }>
      <RegisterEmployeePageContent />
    </Suspense>
  )
}
