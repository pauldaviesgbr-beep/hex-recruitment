'use client'

// ONE LOGIN. It never asks who you are — the account knows.
//
// This was a role CHOOSER: two cards sending people to /login/employee or
// /login/employer. Three screens to answer a question we could already answer
// ourselves, and it produced a dead end — sign in on the wrong one and you were
// told "This login is for job seekers only", having typed the right password.
//
// Both of those routes are now redirects here, and the bounce is gone by
// construction rather than by a fix: there is nowhere to be wrong.

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import LoginPanel from '@/components/LoginPanel'

function LoginPageContent() {
  const searchParams = useSearchParams()
  return (
    <main>
      <Header />
      <LoginPanel
        returnTo={searchParams.get('redirect')}
        authError={searchParams.get('error')}
        have={searchParams.get('have')}
        justRegistered={searchParams.get('registered') === 'true'}
      />
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main>
        <Header />
        <div style={{ textAlign: 'center', padding: '4rem' }}>Loading…</div>
      </main>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
