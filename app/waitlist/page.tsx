'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ThriveMark from '@/components/ThriveMark'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'
import { foundingPhraseShort } from '@/lib/trialUtils'
import styles from './page.module.css'

export default function WaitlistPage() {
  return (
    <Suspense>
      <WaitlistContent />
    </Suspense>
  )
}

function WaitlistContent() {
  const searchParams = useSearchParams()
  const isFull = searchParams.get('reason') === 'full'
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [error, setError] = useState('')
  const [employerCount, setEmployerCount] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => setEmployerCount(d.employerCount ?? 0))
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), company: company.trim(), email: email.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }

      setSubmittedEmail(email.trim())
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.origin + '/waitlist')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <ThriveMark size={36} />
        </Link>

        {/* Full banner */}
        {isFull && (
          <div className={styles.fullBanner}>
            All {EMPLOYER_COHORT_CAP} free spots have been claimed — but you can join the waitlist and we&apos;ll let you know if any open up.
          </div>
        )}

        {/* Headline */}
        <h1 className={styles.headline}>{isFull ? 'Join the waitlist' : `Get ${foundingPhraseShort()} — before we launch`}</h1>

        {/* Subheadline */}
        <p className={styles.subheadline}>
          Join the waitlist. The first {EMPLOYER_COHORT_CAP} employers on Thrive get {foundingPhraseShort()}. No card needed.
        </p>

        {/* Spots counter */}
        <div className={styles.spotsCounter}>
          <p className={styles.spotsText}>
            {employerCount ?? '—'} of {EMPLOYER_COHORT_CAP} spots already claimed
          </p>
          <div className={styles.spotsBar}>
            <div
              className={styles.spotsBarFill}
              style={{ width: `${Math.min((employerCount ?? 0) / EMPLOYER_COHORT_CAP * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Form or Success */}
        {!submitted ? (
          <form className={styles.card} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="wl-name">Your name</label>
              <input
                id="wl-name"
                type="text"
                className={styles.input}
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="wl-company">Company name</label>
              <input
                id="wl-company"
                type="text"
                className={styles.input}
                value={company}
                onChange={e => setCompany(e.target.value)}
                required
                autoComplete="organization"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="wl-email">Work email</label>
              <input
                id="wl-email"
                type="email"
                className={styles.input}
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? 'Claiming...' : 'Claim my free spot →'}
            </button>
            {error && <p className={styles.error}>{error}</p>}
            {/* foundingPhraseShort(), NOT TRIAL_MONTHS. This read "Free for 3
              months" — the DORMANT Stripe trial constant — on a page whose
              headline and subheadline both say 12. It understated the live
              founding offer by nine months, in the fine print, to the exact
              people being signed up for it. Same fault as the chatbot. */}
            <p className={styles.fine}>No credit card. No catch. {foundingPhraseShort().replace(/^./, c => c.toUpperCase())}.</p>
          </form>
        ) : (
          <div className={styles.card}>
            <div className={styles.success}>
              <h2 className={styles.successTitle}>You&apos;re on the list!</h2>
              <p className={styles.successText}>
                We&apos;ll email you at <strong>{submittedEmail}</strong> when we go live.
              </p>
              <p className={styles.shareLabel}>Know another business owner? Share your spot link:</p>
              <button className={styles.copyBtn} onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
