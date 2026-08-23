'use client'

// The candidate sign-up route — AND the apply gate.
//
// One route, two prop sets, decided by the ?redirect the page already carries.
// Arriving from Apply means ?redirect=/job/<id>?apply=1, and that single signal
// is what turns this into the gate: a role strip above the heading and copy
// that says where the person is going back to. There is no second flag that
// could disagree with the first.
//
// THE GATE USED TO LIVE AT /login/employee — a page headed "Create a free
// account to apply" over a LOGIN form with a Login button. A stranger read the
// invitation, typed an email, invented a password, pressed the only button on
// the screen, and got "Invalid login credentials". Paul hit it three times on
// his own phone. Moving the gate here is what makes the heading and the form
// the same screen.
//
// AND IT PUTS THE GATE ON A SIGN-UP ROUTE, so the header offers Log in on it —
// which is exactly what a returning chef needs on a form with no password box.

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import SignupPanel from '@/components/SignupPanel'
import styles from './page.module.css'

function RegisterEmployeePageContent() {
  const searchParams = useSearchParams()
  return (
    <main className={styles.main}>
      <Header />
      <SignupPanel returnTo={searchParams.get('redirect')} />
    </main>
  )
}

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
