'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { supabaseProfileToCandidate } from '@/lib/types'
import { Candidate } from '@/lib/mockCandidates'
import { useJobs } from '@/lib/JobsContext'
import { Boost } from '@/lib/boostTypes'
import Header from '@/components/Header'
import CandidateInsights from '@/components/CandidateInsights'
// The dashboard's stylesheet, deliberately. These cards were on that page
// yesterday and should look identical today; a second stylesheet is how two
// cards that used to match stop matching.
import styles from '../dashboard/page.module.css'

// A HOME FOR THREE PANELS, NOT A NEW FEATURE.
//
// Career Insights, Activity and Profile Views moved off the candidate dashboard
// so it could be the answer line plus three. Everything here was already being
// rendered and already being queried — this page runs the same reads the
// dashboard ran for these panels, and nothing more.

const STATUS_LABELS: Record<string, string> = {
  pending: 'Applied',
  reviewing: 'Reviewing',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Rejected',
}

function formatRelativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(diff / 86400000)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

type Gate = 'loading' | 'ok' | 'signed-out' | 'wrong-role'

export default function InsightsPage() {
  const router = useRouter()
  const { jobs } = useJobs()

  const [gate, setGate] = useState<Gate>('loading')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [profileViews7d, setProfileViews7d] = useState(0)
  const [profileViews30d, setProfileViews30d] = useState(0)
  const [profileViewEvents, setProfileViewEvents] = useState<any[]>([])
  const [statusChangeEvents, setStatusChangeEvents] = useState<any[]>([])
  const [activeBoost, setActiveBoost] = useState<Boost | null>(null)

  useEffect(() => {
    const load = async () => {
      if (DEV_MODE) {
        const mockUser = getMockUser()
        setGate(mockUser?.user_metadata?.role === 'employee' ? 'ok' : 'wrong-role')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setGate('signed-out'); router.push('/login/employee'); return }

      // THE WRONG ROLE IS NOT THE SAME AS SIGNED OUT, and conflating them is
      // exactly what makes /dashboard/analytics useless to a candidate: it
      // bounces anyone who isn't an employer to the EMPLOYER login, so a
      // signed-in candidate is asked to log in as somebody else. An employer
      // who lands here is not lost and does not need a login form — they need a
      // sentence and a way back. Rendered below rather than redirected, because
      // a redirect they did not ask for is how you lose track of where you are.
      if (session.user.user_metadata?.role !== 'employee') { setGate('wrong-role'); return }

      const userId = session.user.id
      const d7 = new Date(Date.now() - 7 * 86400000).toISOString()
      const d30 = new Date(Date.now() - 30 * 86400000).toISOString()

      const [profileRes, res7, res30, viewEvents, changedApps, boostRes] = await Promise.all([
        supabase.from('candidate_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('profile_views').select('*', { count: 'exact', head: true }).eq('profile_id', userId).gte('viewed_at', d7),
        supabase.from('profile_views').select('*', { count: 'exact', head: true }).eq('profile_id', userId).gte('viewed_at', d30),
        supabase.from('profile_views').select('id, viewed_at, company_name, source').eq('profile_id', userId).order('viewed_at', { ascending: false }).limit(10),
        supabase.from('job_applications').select('id, job_title, company, status, updated_at')
          .eq('candidate_id', userId)
          .gt('updated_at', new Date(Date.now() - 30 * 86400000).toISOString())
          .neq('status', 'applied').neq('status', 'pending')
          .order('updated_at', { ascending: false }).limit(5),
        // `boosts`, filtered by boost_type and is_active — copied from the
        // dashboard rather than guessed. My first attempt invented a
        // `profile_boosts` table with a `status` column; neither exists, and it
        // type-checked perfectly because the Supabase client types are loose.
        supabase.from('boosts').select('*').eq('user_id', userId).eq('boost_type', 'profile').eq('is_active', true),
      ])

      if (profileRes.data) setCandidate(supabaseProfileToCandidate(profileRes.data))
      setProfileViews7d(res7.count || 0)
      setProfileViews30d(res30.count || 0)
      if (viewEvents.data) setProfileViewEvents(viewEvents.data)
      if (changedApps.data) setStatusChangeEvents(changedApps.data)
      if (boostRes.data && boostRes.data.length > 0) setActiveBoost(boostRes.data[0] as Boost)
      setGate('ok')
    }
    load().catch(() => setGate('ok'))
  }, [router])

  if (gate === 'loading' || gate === 'signed-out') {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.dashboardWrap} />
      </main>
    )
  }

  if (gate === 'wrong-role') {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.dashboardWrap}>
          <div className={styles.card} style={{ padding: '2rem', maxWidth: 560 }}>
            <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>This one is for job seekers</h1>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-gray)' }}>
              Insights shows how your profile is doing — views, activity and what your
              sector is paying. You&rsquo;re signed in as an employer, so there is nothing here for you.
            </p>
            <Link href="/employer/dashboard" className={styles.cardLink}>Go to your dashboard &rarr;</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Header />
      <div className={styles.dashboardWrap}>
        <div className={styles.greetingRow}>
          <div>
            <h1 className={styles.greeting}>Insights</h1>
          </div>
        </div>
        {/* One column. The dashboard split these across its left and right
            columns; that grid is not what they are in any more. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <CandidateInsights
            candidate={candidate}
            jobs={jobs}
            profileViewEvents={profileViewEvents}
            statusChangeEvents={statusChangeEvents}
            activeBoost={activeBoost}
            profileViews7d={profileViews7d}
            profileViews30d={profileViews30d}
            styles={styles}
            statusLabels={STATUS_LABELS}
            formatRelativeTime={formatRelativeTime}
          />
        </div>
        <p style={{ marginTop: '1.5rem' }}>
          <Link href="/dashboard" className={styles.cardLink}>&larr; Back to your dashboard</Link>
        </p>
      </div>
    </main>
  )
}
