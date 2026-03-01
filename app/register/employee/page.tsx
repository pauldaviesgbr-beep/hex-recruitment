'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import JobSeekerProfileForm from '@/components/JobSeekerProfileForm'
import styles from './page.module.css'

function RegisterEmployeePageContent() {
  return (
    <main className={styles.main}>
      <Header />
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Create Your Job Seeker Profile</h1>
          <p className={styles.subtitle}>
            Join Hex and connect with top employers across the UK
          </p>
        </div>

        <JobSeekerProfileForm mode="register" />

        <div className={styles.loginLink}>
          <p>Already have an account?</p>
          <Link href="/login/employee">Log in here</Link>
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
