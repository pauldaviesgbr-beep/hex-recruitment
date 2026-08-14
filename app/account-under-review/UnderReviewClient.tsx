'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Ico } from '@/components/icons'

// Client subcomponent: renders the friendly status copy and polls
// /api/me/approval-status every 20s so a freshly-approved user gets
// bounced to the dashboard without having to refresh. The cookie-auth'd
// endpoint is the reliable read; the previous client-side localStorage
// read was the B2 bug.

type ApprovalStatus = 'pending' | 'rejected' | 'waitlisted' | 'approved' | 'legacy_or_missing' | null

export default function UnderReviewClient({
  initialStatus,
  email,
}: {
  initialStatus: ApprovalStatus
  email: string
}) {
  const router = useRouter()
  const [status, setStatus] = useState<ApprovalStatus>(initialStatus)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/me/approval-status', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const s = (data?.status as ApprovalStatus) ?? null
        setStatus(s)
        if (s === 'approved') {
          router.replace('/employer/dashboard')
        }
      } catch {
        // Network blip — keep current status, try again next tick.
      }
    }

    const interval = setInterval(check, 20000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [router])

  return (
    <div style={{ maxWidth: 520, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
      {(status === 'pending' || status === null || status === 'legacy_or_missing') && (
        <>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}><Ico name="clock" size={20} /></div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Account under review</h1>
          <p style={{ color: '#475569', lineHeight: 1.6 }}>
            Thanks for signing up! Your founding-cohort account needs a quick manual check{email ? <> on <strong>{email}</strong></> : null} before we open up posting and candidate access.
          </p>
          <p style={{ color: '#475569', lineHeight: 1.6, marginTop: '1rem' }}>
            We usually review applications within a few hours during UK business hours. You&apos;ll get an email the moment your account is approved.
          </p>
          {/*
            BOTH ESCAPE ROUTES ON THIS PAGE WERE DEAD UNTIL 12 AUG 2026, which
            is why the address changed here as well as in lib/email.ts. This is
            the page an employer lands on when they CANNOT USE THE PRODUCT, so
            it is the one place a contact address has to work — and it offered
            two: "reply to your confirmation email", whose Reply-To was
            hello@thrivecareer.co.uk, and a mailto to the same dead address.
            hello@ accepts mail and silently drops it, with no bounce, so a
            blocked employer got no answer and no indication why.
          */}
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '2rem' }}>
            In a hurry? Reply to your confirmation email or contact <a href="mailto:support@thrivecareer.co.uk" style={{ color: '#16a34a' }}>support@thrivecareer.co.uk</a> with your company name and we&apos;ll prioritise.
          </p>
        </>
      )}
      {status === 'rejected' && (
        <>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}><Ico name="alert-triangle" size={20} /></div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Account not approved</h1>
          <p style={{ color: '#475569', lineHeight: 1.6 }}>
            We weren&apos;t able to approve your founding-cohort signup. If you think this is a mistake, please reply to your confirmation email or contact <a href="mailto:support@thrivecareer.co.uk" style={{ color: '#16a34a' }}>support@thrivecareer.co.uk</a> with your company name and we&apos;ll take another look.
          </p>
        </>
      )}
      {status === 'waitlisted' && (
        <>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}><Ico name="file-text" size={20} /></div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem' }}>You&apos;re on the waitlist</h1>
          <p style={{ color: '#475569', lineHeight: 1.6 }}>
            The founding cohort is currently full, but we&apos;ve reserved your spot in the waitlist. We&apos;ll email you the moment a place opens up.
          </p>
        </>
      )}
      <div style={{ marginTop: '2.5rem' }}>
        <Link href="/" style={{ color: '#64748b', fontSize: '0.9rem' }}>← Back to home</Link>
      </div>
    </div>
  )
}
