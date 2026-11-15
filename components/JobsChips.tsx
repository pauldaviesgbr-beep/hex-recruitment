'use client'

/**
 * ALL · FOR YOU · SHIFTS — three chips at the top of the candidate's job pages
 * on a phone (design_handoff_phone_navigation, 1c). The phone bottom bar has one
 * Jobs slot; the candidate hamburger used to hold Search Jobs, Recommended and
 * Temp Work as three entries, and these chips are where the last two went.
 *
 * Signed-in candidates only (For you means nothing to anyone else), and phone
 * width only: wider than that, the candidate side menu still carries all three.
 * The labels are the design's; the pages keep their own titles.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import styles from './JobsChips.module.css'

const CHIPS = [
  { key: 'all', label: 'All', href: '/jobs' },
  { key: 'for-you', label: 'For you', href: '/jobs/recommended' },
  { key: 'shifts', label: 'Shifts', href: '/temp-work' },
] as const

type Props = { current: (typeof CHIPS)[number]['key']; tone: 'dark' | 'light' }

export default function JobsChips({ current, tone }: Props) {
  const [candidate, setCandidate] = useState(false)

  useEffect(() => {
    const isCandidate = (u: any) => !!u && u.user_metadata?.role !== 'employer'
    if (DEV_MODE) { setCandidate(isCandidate(getMockUser())); return }
    supabase.auth.getSession().then(({ data: { session } }) => setCandidate(isCandidate(session?.user)))
  }, [])

  if (!candidate) return null

  return (
    <nav className={`${styles.chips} ${tone === 'dark' ? styles.dark : styles.light}`} aria-label="Jobs" data-hide-in-app="">
      {CHIPS.map(c => (
        <Link
          key={c.key}
          href={c.href}
          className={styles.chip}
          data-on={c.key === current ? '' : undefined}
          aria-current={c.key === current ? 'page' : undefined}
        >
          {c.label}
        </Link>
      ))}
    </nav>
  )
}
