'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import PreferredAreasPicker from '@/components/PreferredAreasPicker'
import { supabase } from '@/lib/supabase'
import { categories } from '@/lib/categories'
import { safeInternalPath } from '@/lib/safeRedirect'
import { clearPendingConfirm } from '@/lib/pendingConfirm'
import type { NudgeKey } from '@/lib/nudges'
import styles from './page.module.css'

// The three-field welcome step. Both signup doors land here, then go straight
// to jobs.
//
// Only three fields, because only three change what the product can do:
//   job title  — the heaviest single signal in job matching
//   job sector — drives sector matching and skill suggestions
//   areas      — the filter deciding which jobs are shown at all
// Everything else (CV, photo, salary, bio, phone) is worth asking for later, at
// the moment its value is obvious. Asking here just costs completions.
//
// Skipping is a first-class outcome: it queues those fields for a later nudge
// rather than blocking the way in.

const SKIPPABLE: NudgeKey[] = ['jobTitle', 'jobSector', 'areas']

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeInternalPath(searchParams.get('next')) || '/jobs'

  const [jobTitle, setJobTitle] = useState('')
  const [jobSector, setJobSector] = useState('')
  const [areas, setAreas] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  // Signed out, or somehow here without a candidate profile — don't strand them.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { router.replace('/login/employee'); return }
      // THIS IS WHERE A CONFIRMED SIGN-UP ACTUALLY ARRIVES. Somebody who
      // clicks the link in the confirmation email lands here, not on the login
      // page, so clearing the pending-confirm notice only over there would
      // leave them being told to confirm an email they have just confirmed —
      // for seven days, or until they happened to visit /login/employee.
      clearPendingConfirm()
      setChecking(false)
    })()
    return () => { cancelled = true }
  }, [router])

  const token = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  }

  const recordSkipped = async (keys: NudgeKey[]) => {
    const t = await token()
    if (!t || keys.length === 0) return
    // Best-effort: this is bookkeeping for a later prompt, never a reason to
    // hold someone on the welcome screen.
    await fetch('/api/profile/nudge-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ action: 'skipped', keys }),
    }).catch(() => {})
  }

  const handleSkip = async () => {
    setSaving(true)
    await recordSkipped(SKIPPABLE)
    router.push(next)
  }

  const handleContinue = async () => {
    setError('')
    setSaving(true)
    try {
      const t = await token()
      if (!t) { router.replace('/login/employee'); return }
      const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }

      if (jobTitle.trim() || jobSector) {
        const res = await fetch('/api/profile/quick-start', {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ jobTitle: jobTitle.trim(), jobSector }),
        })
        if (!res.ok) throw new Error('Could not save your details. Please try again.')
      }

      if (areas.length > 0) {
        // Areas keep their own dedicated writer — same route the profile editor
        // uses, so there's exactly one way that column gets written.
        const res = await fetch('/api/profile/preferred-areas', {
          method: 'PUT',
          headers: auth,
          body: JSON.stringify({ areas }),
        })
        if (!res.ok) throw new Error('Could not save your work areas. Please try again.')
      }

      // Anything left blank isn't a failure — queue it for a later nudge.
      const skipped: NudgeKey[] = []
      if (!jobTitle.trim()) skipped.push('jobTitle')
      if (!jobSector) skipped.push('jobSector')
      if (areas.length === 0) skipped.push('areas')
      await recordSkipped(skipped)

      router.push(next)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  if (checking) return null

  return (
    <main className={styles.page}>
      <Header />
      <div className={styles.wrap}>
        <div className={styles.intro}>
          <h1 className={styles.title}>Three quick things</h1>
          <p className={styles.subtitle}>
            Just enough to show you jobs worth looking at. You can change any of it later,
            and you can skip straight to browsing.
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="jobTitle">What job are you looking for?</label>
          <input
            id="jobTitle"
            type="text"
            className={styles.input}
            value={jobTitle}
            onChange={e => setJobTitle(e.target.value)}
            placeholder="e.g. Sous Chef, Bartender, Housekeeper"
            autoComplete="organization-title"
          />
          <p className={styles.hint}>The single biggest thing we use to match you.</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="jobSector">Which industry?</label>
          <select
            id="jobSector"
            className={styles.input}
            value={jobSector}
            onChange={e => setJobSector(e.target.value)}
          >
            <option value="">Choose an industry</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Where are you willing to work?</span>
          <PreferredAreasPicker
            value={areas}
            onChange={setAreas}
            hint="Pick the areas you'd travel to. We'll only show you jobs you can actually get to — leave it empty to see everything."
          />
        </div>

        {/* Discoverability is on by default, so it gets said plainly, here, at
            full size — not buried in settings for someone to discover later. */}
        <div className={styles.notice}>
          <strong className={styles.noticeTitle}>Employers can find you</strong>
          <p className={styles.noticeBody}>
            Your profile is visible to employers hiring on Thrive, so they can approach you
            about roles. You can turn this off at any time with the{' '}
            <strong>visibility switch</strong> at the top of your dashboard — it reads
            &ldquo;Employers can find you&rdquo; while it is on.
          </p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={handleContinue} disabled={saving}>
            {saving ? 'Saving…' : 'Show me jobs'}
          </button>
          <button type="button" className={styles.skip} onClick={handleSkip} disabled={saving}>
            Skip for now
          </button>
        </div>
      </div>
    </main>
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeContent />
    </Suspense>
  )
}
