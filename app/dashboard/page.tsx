'use client'

import { PAID_SURFACES_ENABLED } from "@/lib/paidSurfaces"

import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import { supabaseProfileToCandidate } from '@/lib/types'
import { Candidate } from '@/lib/mockCandidates'
import { useJobs } from '@/lib/JobsContext'
import { useMessages } from '@/lib/MessagesContext'
import { useSavedJobs } from '@/lib/useSavedJobs'
import { scoreAndRankJobs, hasRelevanceSignal, RecommendedJob } from '@/lib/recommendations'
import JobCardLink from '@/components/JobCardLink'
import { Boost, getDaysRemaining } from '@/lib/boostTypes'
import { Notification, formatNotificationTime } from '@/lib/mockNotifications'
import { useNotifications } from '@/lib/NotificationsContext'
import Header from '@/components/Header'
import dynamic from 'next/dynamic'

// Lazy-load the boost modal so Stripe.js isn't pulled into the candidate
// dashboard's initial bundle. Only fetches when boostModalOpen flips true.
const ProfileBoostPaymentModal = dynamic(() => import('@/components/ProfileBoostPaymentModal'), {
  ssr: false,
  loading: () => null,
})
import SignedImage from '@/components/SignedImage'
import CandidateCard from '@/components/CandidateCard'
import ProfileNudge from '@/components/ProfileNudge'
import HeardFromPrompt from '@/components/HeardFromPrompt'
import ConfirmCvSkillsPrompt from '@/components/ConfirmCvSkillsPrompt'
import { STAGE_COLORS } from '@/lib/constants/pipelineStages'
// The SAME component the employer dashboard uses, with a different sentence
// table — which is what item 1 was built as table-plus-presentation for.
import AnswerLine from '@/components/AnswerLine'
import { candidateAnswerLine } from '@/lib/answerLine'
import styles from './page.module.css'

// ── Helpers ─────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
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

// Application status helpers
const STATUS_ORDER = ['pending', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'] as const

const STATUS_LABELS: Record<string, string> = {
  pending: 'Applied',
  reviewing: 'Reviewing',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Rejected',
}

function getStatusColor(status: string): string {
  if (status === 'pending') return 'statusApplied'
  if (status === 'reviewing' || status === 'shortlisted') return 'statusReviewing'
  if (status === 'interview' || status === 'offered' || status === 'hired') return 'statusInterview'
  if (status === 'rejected') return 'statusRejected'
  return 'statusApplied'
}

// Funnel accent per status — reuse the pipeline board's stage colours (single
// source of truth in lib/constants/pipelineStages) so the dashboard funnel and
// the pipeline columns share one palette. 'pending'/Applied isn't a board stage,
// so it gets a warm amber of its own.
function funnelColor(status: string): string {
  if (status === 'pending') return '#f59e0b'
  return (STAGE_COLORS as Record<string, string>)[status] || '#94a3b8'
}
// Soft 14%/32% tint treatment matching the pipeline column count badges, with
// the count itself in the full stage colour for vibrancy.
function funnelChipStyle(status: string): CSSProperties {
  const c = funnelColor(status)
  return {
    background: `color-mix(in srgb, ${c} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${c} 32%, transparent)`,
    color: c,
  }
}

// Profile completion fields
interface ProfileField {
  key: string
  label: string
  check: (c: Candidate) => boolean
  link: string
  // Benefit-framed reward shown next to the prompt ("add X → get Y"), so each
  // nudge offers a payoff rather than reading as a chore.
  benefit?: string
}

// Each field deep-links straight to its own section in Edit Profile via
// ?section=<slug>. JobSeekerProfileForm maps the slug to the right wizard step
// and scrolls to/highlights the control, so "Add →" is genuinely one click
// instead of dropping the user at the top of the form.
const PROFILE_FIELDS: ProfileField[] = [
  { key: 'fullName', label: 'Full name', check: c => !!c.fullName, link: '/profile?section=name' },
  { key: 'phone', label: 'Phone number', check: c => !!c.phone, link: '/profile?section=phone', benefit: 'so employers can reach you' },
  { key: 'location', label: 'Location', check: c => !!c.location, link: '/profile?section=location', benefit: 'see what’s commutable' },
  { key: 'jobTitle', label: 'Job title', check: c => !!c.jobTitle, link: '/profile?section=job-title', benefit: 'match the right roles' },
  { key: 'experience', label: 'Years of experience', check: c => c.yearsExperience > 0, link: '/profile?section=experience', benefit: 'match your level' },
  { key: 'skills', label: 'Skills (at least 3)', check: c => (c.skills || []).length >= 3, link: '/profile?section=skills', benefit: 'see roles that match' },
  { key: 'bio', label: 'About me bio', check: c => !!c.personalBio, link: '/profile?section=bio', benefit: 'stand out to employers' },
  { key: 'cvUrl', label: 'Upload CV', check: c => !!c.cvUrl, link: '/profile?section=cv', benefit: 'apply in one tap' },
  { key: 'photo', label: 'Profile photo', check: c => !!c.profilePictureUrl, link: '/profile?section=photo', benefit: 'get noticed' },
  { key: 'jobSector', label: 'Job sector', check: c => !!c.jobSector, link: '/profile?section=job-sector', benefit: 'see roles that match' },
  { key: 'areas', label: 'Desired work location', check: c => (c.preferredAreas || []).length > 0, link: '/profile?section=areas', benefit: 'only see jobs you can get to' },
  { key: 'salary', label: 'Salary expectations', check: c => !!(c.salaryMin || c.salaryMax || c.desiredSalary), link: '/profile?section=job-preferences', benefit: 'filter to roles that pay' },
  { key: 'jobTypes', label: 'Preferred job type', check: c => !!(c.preferredJobTypes && c.preferredJobTypes.length > 0), link: '/profile?section=job-preferences', benefit: 'see roles that fit' },
  { key: 'workStyle', label: 'Work style (remote/hybrid/on-site)', check: c => !!(c.workLocationPreferences && c.workLocationPreferences.length > 0), link: '/profile?section=job-preferences', benefit: 'match remote or on-site' },
]

// Sector display labels
import { getCategoryLabel } from '@/lib/categories'
import { Ico, type IconName } from '@/components/icons'
import { nameFromAuth, greetingName } from '@/lib/displayName'
import { parseHold, holdState, HOLD_WINDOW_DAYS } from '@/lib/duplicateHold'
const JOB_SECTOR_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_target, key: string) => getCategoryLabel(key),
})

// ── Circular progress SVG ───────────────────────────────
function CircleProgress({ pct }: { pct: number }) {
  const r = 30
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className={styles.progressCircle}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className={styles.progressLabel}>{pct}%</span>
    </div>
  )
}

// ── Skeleton placeholders ───────────────────────────────
function SkeletonCard({ height = 120 }: { height?: number }) {
  return <div className={`${styles.skeleton} ${styles.skeletonCard}`} style={{ height }} />
}

// ═════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════

export default function DashboardPage() {
  const router = useRouter()
  const { jobs } = useJobs()
  const { conversations, totalUnreadCount } = useMessages()
  const { savedCount } = useSavedJobs()

  // Core state
  const [user, setUser] = useState<any>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  // Dashboard-only profile photo — kept in local state (NOT on the shared
  // Candidate type) so it can never be read/rendered by employer surfaces.
  const [dashboardPhotoUrl, setDashboardPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [isDiscoverable, setIsDiscoverable] = useState(false)
  // WHEN THE PROFILE IS HELD, THE CANDIDATE IS TOLD.
  //
  // A hold hides a real person for up to seven days while a duplicate is
  // decided, and until now nothing said so anywhere they could see. Their own
  // dashboard showed the visibility switch OFF and labelled it "Profile
  // hidden" — true, and it reads as something THEY did. It is something we
  // did, for a reason, with an end date.
  //
  // Null unless genuinely held. holdState is imported rather than restated:
  // reviewed and released holds are not this state, and re-deriving that test
  // here is how two answers to one question start disagreeing.
  const [heldUntil, setHeldUntil] = useState<string | null>(null)
  /** Field the nudge is currently asking about, so the completion card can
   *  stand down on that one row. Null when no nudge is showing. */
  const [nudgedKey, setNudgedKey] = useState<string | null>(null)
  // "Not interested" job ids — remembered per device via localStorage (no DB).
  const [dismissedJobIds, setDismissedJobIds] = useState<Set<string>>(new Set())
  const photoInputRef = useRef<HTMLInputElement>(null)
  // Recommended row horizontal scroll (desktop arrows; mobile uses touch swipe).
  const recScrollerRef = useRef<HTMLDivElement>(null)
  const scrollRec = (dir: number) => {
    recScrollerRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  }

  // Application data
  const [applications, setApplications] = useState<any[]>([])

  // Profile views
  const [profileViews7d, setProfileViews7d] = useState(0)
  const [profileViews30d, setProfileViews30d] = useState(0)

  // Boost
  const [activeBoost, setActiveBoost] = useState<Boost | null>(null)
  const [boostModalOpen, setBoostModalOpen] = useState(false)

  // Notifications come from the shared NotificationsProvider — no per-page
  // fetch. The dashboard panel just shows the top 5 of the same list.
  const { notifications } = useNotifications()
  const [upcomingInterviews, setUpcomingInterviews] = useState<any[]>([])

  // Activity feed data
  const [profileViewEvents, setProfileViewEvents] = useState<any[]>([])
  const [statusChangeEvents, setStatusChangeEvents] = useState<any[]>([])

  // ── Load data ───────────────────────────────────────────
  useEffect(() => {
    const loadDashboard = async () => {
      // DEV MODE
      if (DEV_MODE) {
        const mockUser = getMockUser()
        const userType = getMockUserType()
        setUser(mockUser)

        if (userType === 'employer') {
          router.replace('/employer/dashboard')
          return
        }

        // Mock candidate profile
        setCandidate({
          id: mockUser?.id || '',
          userId: mockUser?.id || '',
          fullName: mockUser?.user_metadata?.full_name || 'James Wilson',
          profilePictureUrl: null,
          jobTitle: 'Marketing Manager',
          jobSector: 'marketing',
          location: 'Manchester',
          yearsExperience: 5,
          bio: 'Results-driven marketing professional with 5 years of experience across digital and traditional channels.',
          skills: ['Digital Marketing', 'Campaign Management', 'Analytics'],
          workHistory: [],
          cvUrl: null,
          availability: 'Immediately',
          email: mockUser?.email || '',
          phone: '+44 7700 900456',
          createdAt: '2024-01-01',
          education: [],
          languages: [],
          salaryMin: '28000',
          salaryMax: '35000',
          salaryPeriod: 'year' as const,
        })

        // Mock applications
        setApplications([
          { id: '1', job_title: 'Senior Marketing Executive', company: 'Acme Corp', status: 'shortlisted', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
          { id: '2', job_title: 'Content Strategist', company: 'MediaWorks', status: 'pending', created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
          { id: '3', job_title: 'Brand Manager', company: 'Bright Agency', status: 'interview', created_at: new Date(Date.now() - 7 * 86400000).toISOString() },
        ])

        setProfileViews7d(12)
        setProfileViews30d(47)

        // Mock activity feed data
        setProfileViewEvents([
          { id: 'pv1', viewed_at: new Date(Date.now() - 2 * 3600000).toISOString(), company_name: 'Acme Corp', source: 'search' },
          { id: 'pv2', viewed_at: new Date(Date.now() - 8 * 3600000).toISOString(), company_name: 'TechFlow Ltd', source: 'recommendation' },
          { id: 'pv3', viewed_at: new Date(Date.now() - 26 * 3600000).toISOString(), company_name: null, source: 'search' },
          { id: 'pv4', viewed_at: new Date(Date.now() - 3 * 86400000).toISOString(), company_name: 'Bright Agency', source: null },
        ])
        setStatusChangeEvents([
          { id: 'sc1', job_title: 'Senior Marketing Executive', company: 'Acme Corp', status: 'shortlisted', updated_at: new Date(Date.now() - 4 * 3600000).toISOString() },
          { id: 'sc2', job_title: 'Brand Manager', company: 'Bright Agency', status: 'interview', updated_at: new Date(Date.now() - 2 * 86400000).toISOString() },
        ])

        setLoading(false)
        return
      }

      // PRODUCTION MODE
      // Client and server share one cookie-backed session store, so
      // getSession() reads exactly what the server wrote — including the fresh
      // OAuth-redirect case that used to need a separate cookie hydration.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.user_metadata?.role === 'employer') { router.replace('/employer/dashboard'); return }

      setUser(session.user)
      const userId = session.user.id

      // Fetch candidate profile
      try {
        const { data: profileData } = await supabase
          .from('candidate_profiles')
          .select('*')
          .eq('user_id', userId)
          .single()

        if (profileData) {
          setCandidate(supabaseProfileToCandidate(profileData))
          setDashboardPhotoUrl(profileData.dashboard_photo_url || null)
          setIsDiscoverable(!!profileData.is_discoverable)
          const hold = parseHold(profileData.duplicate_hold)
          setHeldUntil(
            holdState(hold) === 'held' && hold.heldAt
              ? new Date(Date.parse(hold.heldAt) + HOLD_WINDOW_DAYS * 86_400_000).toISOString()
              : null,
          )
        } else {
          // Try employees table as fallback
          const { data: empData } = await supabase
            .from('employees')
            .select('*')
            .eq('user_id', userId)
            .single()
          if (empData) {
            setCandidate({
              id: userId,
              userId,
              fullName: session.user.user_metadata?.full_name || '',
              profilePictureUrl: empData.profile_photo_url || null,
              jobTitle: empData.position || '',
              location: empData.location || '',
              yearsExperience: empData.experience_years || 0,
              bio: empData.bio || '',
              skills: empData.skills || [],
              workHistory: [],
              cvUrl: empData.cv_url || null,
              availability: 'Available',
              email: session.user.email || '',
              phone: empData.phone || '',
              createdAt: empData.created_at || '',
              education: [],
              languages: [],
            })
          }
        }
      } catch {
        // Profile tables may not exist yet
      }

      // Fetch applications
      try {
        const { data: appData } = await supabase
          .from('job_applications')
          .select('id, job_id, job_title, company, status, created_at')
          .eq('candidate_id', userId)
          .neq('status', 'withdrawn')
          .order('created_at', { ascending: false })
          .limit(50)
        if (appData) setApplications(appData)
      } catch { /* table may not exist */ }

      // Fetch profile views
      try {
        const now = new Date()
        const d7 = new Date(now.getTime() - 7 * 86400000).toISOString()
        const d30 = new Date(now.getTime() - 30 * 86400000).toISOString()

        const [res7, res30] = await Promise.all([
          supabase.from('profile_views').select('*', { count: 'exact', head: true }).eq('profile_id', userId).gte('viewed_at', d7),
          supabase.from('profile_views').select('*', { count: 'exact', head: true }).eq('profile_id', userId).gte('viewed_at', d30),
        ])
        setProfileViews7d(res7.count || 0)
        setProfileViews30d(res30.count || 0)
      } catch { /* table may not exist */ }

      // Fetch active boost
      try {
        const { data: boostData } = await supabase
          .from('boosts')
          .select('*')
          .eq('user_id', userId)
          .eq('boost_type', 'profile')
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .order('expires_at', { ascending: false })
          .limit(1)
        if (boostData && boostData.length > 0) setActiveBoost(boostData[0])
      } catch { /* table may not exist */ }

      // Notifications now come from useNotifications() — no per-page fetch.

      // Fetch upcoming interviews for this candidate
      try {
        const todayStr = new Date().toISOString().slice(0, 10)
        const { data: interviewData } = await supabase
          .from('interviews')
          .select('id, interview_date, interview_time, interview_type, duration_minutes, status, location_or_link, jobs(title, company)')
          .eq('candidate_id', userId)
          .gte('interview_date', todayStr)
          .in('status', ['scheduled', 'confirmed', 'pending_selection'])
          .order('interview_date', { ascending: true })
          .limit(5)
        if (interviewData) setUpcomingInterviews(interviewData)
      } catch { /* table may not exist */ }

      // Fetch recent profile views with employer company names
      try {
        const d30view = new Date(Date.now() - 30 * 86400000).toISOString()
        const { data: viewsData } = await supabase
          .from('profile_views')
          .select('id, viewer_id, viewed_at, source')
          .eq('profile_id', userId)
          .gte('viewed_at', d30view)
          .order('viewed_at', { ascending: false })
          .limit(10)

        if (viewsData && viewsData.length > 0) {
          const viewerIds = Array.from(new Set(viewsData.map((v: any) => v.viewer_id)))
          try {
            const { data: employerData } = await supabase
              .from('employer_profiles')
              .select('user_id, company_name')
              .in('user_id', viewerIds)

            const companyMap: Record<string, string> = {}
            if (employerData) {
              employerData.forEach((ep: any) => { companyMap[ep.user_id] = ep.company_name })
            }
            setProfileViewEvents(viewsData.map((v: any) => ({
              ...v,
              company_name: companyMap[v.viewer_id] || null,
            })))
          } catch {
            setProfileViewEvents(viewsData.map((v: any) => ({ ...v, company_name: null })))
          }
        }
      } catch { /* table may not exist */ }

      // Fetch recent application status changes
      try {
        const { data: changedApps } = await supabase
          .from('job_applications')
          .select('id, job_title, company, status, updated_at')
          .eq('candidate_id', userId)
          .gt('updated_at', new Date(Date.now() - 30 * 86400000).toISOString())
          .neq('status', 'applied')
          .neq('status', 'pending')
          .order('updated_at', { ascending: false })
          .limit(5)
        if (changedApps) setStatusChangeEvents(changedApps)
      } catch { /* table may not exist */ }

      setLoading(false)
    }

    loadDashboard()
  }, [router])

  // ── Derived data ────────────────────────────────────────

  // Dashboard-only profile photo upload. Stores the storage PATH (rendered via
  // SignedImage) on candidate_profiles.dashboard_photo_url — a column read ONLY
  // here, never on any employer surface, so the hard constraint holds.
  const triggerPhotoUpload = () => photoInputRef.current?.click()
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user?.id) return
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return }
    setPhotoUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `photos/${user.id}/dashboard-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('profiles').upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('candidate_profiles').update({ dashboard_photo_url: path }).eq('user_id', user.id)
      if (dbErr) throw dbErr
      setDashboardPhotoUrl(path)
    } catch (err) {
      console.error('Dashboard photo upload failed:', err)
      alert('Could not upload your photo. Please try again.')
    } finally {
      setPhotoUploading(false)
    }
  }
  const handlePhotoRemove = async () => {
    if (!user?.id || !dashboardPhotoUrl) return
    if (!window.confirm('Remove your profile photo?')) return
    setPhotoUploading(true)
    try {
      const { error } = await supabase.from('candidate_profiles').update({ dashboard_photo_url: null }).eq('user_id', user.id)
      if (error) throw error
      setDashboardPhotoUrl(null)
    } catch (err) {
      console.error('Dashboard photo remove failed:', err)
      alert('Could not remove your photo. Please try again.')
    } finally {
      setPhotoUploading(false)
    }
  }
  // "Make my profile visible to employers" → writes is_discoverable (default
  // false). Optimistic; reverts on error.
  const handleToggleDiscoverable = async (next: boolean) => {
    if (!user?.id) return
    setIsDiscoverable(next)
    const { error } = await supabase.from('candidate_profiles').update({ is_discoverable: next }).eq('user_id', user.id)
    if (error) {
      console.error('Visibility toggle failed:', error)
      setIsDiscoverable(!next)
      alert('Could not update your visibility. Please try again.')
    }
  }

  // "Not interested" dismissals for the recommended row — persisted in
  // localStorage (per device), so dismissed jobs stay gone across visits.
  const DISMISSED_KEY = 'thrive_dismissed_jobs'
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY)
      if (raw) setDismissedJobIds(new Set(JSON.parse(raw)))
    } catch { /* ignore malformed/unavailable storage */ }
  }, [])
  const dismissJob = (id: string) => {
    setDismissedJobIds(prev => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
      return next
    })
  }

  // The photo a candidate signed in with (Google / LinkedIn OAuth) — the same
  // one already shown in the header avatar. Using it means someone who signed
  // up with Google is not asked for a photo they've effectively already given,
  // and never sees bare initials where their face should be.
  const oauthPhotoUrl: string | null =
    user?.user_metadata?.profile_photo || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null

  // What the card should actually display: an explicitly uploaded dashboard
  // photo wins, then the saved profile picture, then the OAuth avatar.
  const effectivePhotoUrl: string | null =
    dashboardPhotoUrl || candidate?.profilePictureUrl || oauthPhotoUrl

  // Profile completion. The "photo" field counts ANY of those sources — being
  // prompted to "add a photo" while your face is on screen is the bug.
  const { completionPct, missingFields } = useMemo(() => {
    const check = (f: typeof PROFILE_FIELDS[number]) =>
      f.key === 'photo' ? !!effectivePhotoUrl : (candidate ? f.check(candidate) : false)
    if (!candidate) return { completionPct: 0, missingFields: PROFILE_FIELDS }
    const pct = Math.round((PROFILE_FIELDS.filter(check).length / PROFILE_FIELDS.length) * 100)
    const missing = PROFILE_FIELDS.filter(f => !check(f))
    return { completionPct: pct, missingFields: missing }
  }, [candidate, effectivePhotoUrl])

  // Application counts by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    STATUS_ORDER.forEach(s => { counts[s] = 0 })
    applications.forEach(a => {
      const s = (a.status || 'pending').toLowerCase()
      if (counts[s] !== undefined) counts[s]++
      else counts['pending']++
    })
    return counts
  }, [applications])

  // Recent 5 applications
  const recentApps = useMemo(() => applications.slice(0, 5), [applications])

  // Recommended jobs (top 3)
  const recommendedJobs: RecommendedJob[] = useMemo(() => {
    if (!candidate || jobs.length === 0) return []
    const appliedIds = new Set(applications.map((a: any) => a.job_id).filter(Boolean))
    return scoreAndRankJobs(jobs, candidate, appliedIds, [])
      .filter(j => !dismissedJobIds.has(j.id))
      .slice(0, 10)
  }, [candidate, jobs, applications, dismissedJobIds])

  // ── THE ANSWER LINE ──────────────────────────────────────────────
  //
  // NO NEW QUERIES. Every input is already loaded for a panel further down:
  //   statusChangeEvents  the activity feed          -> row 1
  //   upcomingInterviews  the interviews panel       -> row 2
  //   totalUnreadCount    useMessages()              -> row 3
  //   applications        the applications panel     -> row 4
  //   jobs + candidate    the recommendations panel  -> row 4's match count
  //   completionPct       the profile card           -> rows 5 and 6
  //
  // ROW 4 THEREFORE COSTS NOTHING, which is why it is here rather than held
  // back the way the employer's rows 3 and 4 were. It is also the row most
  // candidates will actually see.
  const answerLine = useMemo(() => {
    const latest = statusChangeEvents[0]
    const next = upcomingInterviews[0]

    // "New this week" is a filter over the ALREADY-RANKED recommendations, not
    // a second matching pass — scoreAndRankJobs has done the work, and running
    // matching twice with two different definitions of "matches you" is how the
    // number in the sentence stops agreeing with the panel below it.
    //
    // postedDate, NOT posted_at. RecommendedJob extends the MAPPED Job type,
    // where the raw row's posted_at has already become `postedDate` (an ISO
    // yyyy-mm-dd) and `postedAt` (the human string "2 days ago"). The first
    // draft read j.posted_at, which is undefined on every mapped job — so the
    // count was silently always 0 and this clause could never render. Caught by
    // the screenshot: the Activity feed listed three new matches while the
    // sentence above it claimed none.
    const weekAgo = Date.now() - 7 * 86400000
    const newMatchesThisWeek = recommendedJobs.filter(j => {
      const t = new Date(j.postedDate).getTime()
      return Number.isFinite(t) && t >= weekAgo
    }).length

    return candidateAnswerLine({
      applicationCount: applications.length,
      lastStatusChange: latest
        ? { jobTitle: latest.job_title ?? null, company: latest.company ?? null, status: latest.status, at: latest.updated_at }
        : null,
      nextInterview: next
        ? { company: next.jobs?.company ?? null, jobTitle: next.jobs?.title ?? null, date: next.interview_date ?? null }
        : null,
      unreadMessages: totalUnreadCount || 0,
      profileCompletionPct: completionPct,
      newMatchesThisWeek,
    })
  }, [applications, statusChangeEvents, upcomingInterviews, totalUnreadCount, completionPct, recommendedJobs])

  // Recent conversations (top 3)
  const recentConversations = useMemo(() => {
    return [...conversations]
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 3)
  }, [conversations])

  // viewTrend, sectorJobs, salaryInsights, demandTrend, topSkillsInDemand,
  // competitionLevel and activityFeed lived here. They fed Career Insights,
  // Activity and Profile Views, which are now at /insights — the memos moved
  // with the panels rather than being left computing for nothing on every
  // dashboard load.

  // ── Notification icon helper ────────────────────────────
  // DEAD CODE \u2014 this function appears exactly once in the codebase, its own
  // definition, and is called from nowhere. Left in place on Paul's word (23
  // Aug 2026) rather than deleted in an emoji pass, and noted on the list.
  //
  // Its seven emoji were written as surrogate-pair escapes, which is why a text
  // search for emoji could not see them. They are icon names now so that if
  // this is ever wired up it returns something the icon table understands, and
  // IconName makes a typo a compile error rather than a blank slot.
  function notifIcon(type: string): IconName {
    switch (type) {
      case 'new_application': case 'application_update': return 'file-text'
      case 'job_match': return 'sparkles'
      case 'message_received': case 'employer_message': return 'message-square'
      case 'profile_view': case 'profile_viewed': return 'eye'
      case 'job_approved': return 'check'
      case 'job_saved': return 'tag'
      default: return 'bell'
    }
  }

  // ── Loading state ───────────────────────────────────────
  if (loading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.dashboardWrap}>
          <div className={styles.welcomeHeader}>
            <div className={`${styles.skeleton} ${styles.skeletonCircle}`} />
            <div style={{ flex: 1 }}>
              <div className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: '200px' }} />
              <div className={`${styles.skeleton} ${styles.skeletonLineShort}`} style={{ width: '140px' }} />
            </div>
          </div>

          <div className={styles.grid}>
            <div className={styles.colLeft}>
              <SkeletonCard height={180} />
              <SkeletonCard height={260} />
              <SkeletonCard height={200} />
              <SkeletonCard height={280} />
              <SkeletonCard height={220} />
            </div>
            <div className={styles.colRight}>
              <SkeletonCard height={100} />
              <SkeletonCard height={180} />
              <SkeletonCard height={120} />
              <SkeletonCard height={80} />
            </div>
          </div>
        </div>
      </main>
    )
  }

  // 'there' rather than a slice of their email address. A person reading
  // "Welcome back, x7f9k2p3q1" is being shown a database field, not greeted.
  const displayName = candidate?.fullName || greetingName(nameFromAuth(user))

  // Incomplete-field prompts for the dashboard card. Photo opens the inline
  // uploader; everything else deep-links to the right /profile section.
  // Job title is excluded here because the card renders its own prompt in the
  // role slot — otherwise one field would be asked for twice in one card.
  // The nudge and the card must not ask for the same field on the same screen.
  // The nudge wins the field it is currently asking about and the card drops
  // that row — but ONLY from the list. fieldsComplete/fieldsTotal below still
  // come from the full `missingFields`, so "12 of 14, 86%" cannot move just
  // because a nudge appeared; the candidate's completeness must never change
  // for a reason they didn't cause.
  const cardMissing = missingFields
    .filter(f => f.key !== 'jobTitle' && f.key !== nudgedKey)
    .map(f => ({
      key: f.key,
      label: f.label.replace(/\s*\(.*\)/, ''),
      benefit: f.benefit,
      onAdd: f.key === 'photo' ? triggerPhotoUpload : () => router.push(f.link),
    }))
    .slice(0, 6)

  const jobTitleField = PROFILE_FIELDS.find(f => f.key === 'jobTitle')!
  const needsJobTitle = missingFields.some(f => f.key === 'jobTitle')

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════
  return (
    <main className={styles.page}>
      <Header />

      <div className={styles.dashboardWrap}>
        {/* ── THE ANSWER LINE — FIRST, AND THE ONLY ACCENT ON THE PAGE ──
            "What do I do next", in one sentence generated from state. The
            employer side asks "what needs me today"; this is the same component
            and a different sentence table, which is what item 1 was built as a
            table plus a presentation component FOR.

            The greeting stays here, demoted below it: on the candidate side it
            is the only thing carrying the person's name, and unlike the
            employer's "Good morning, Test" banner it is one small line rather
            than the largest type on the page. ── */}
        <AnswerLine model={answerLine} />

        {/* ── 1. LIGHT GREETING (no boxed header band) ────────── */}
        <div className={styles.greetingRow}>
          <div>
            <h1 className={styles.greeting}>{getGreeting()}, {displayName.split(' ')[0]}</h1>
          </div>
        </div>
        <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />

        {/* At most one contextual nudge, in the flow rather than over it. Renders
            nothing unless the rules in lib/nudges.ts allow it. */}
        <ProfileNudge candidate={candidate} onNudge={setNudgedKey} />

        {/* The attribution question, moved OFF signup step one by the design
            handoff and re-homed here — asked once, after the account exists,
            never blocking anything. It renders nothing if already answered or
            dismissed. The pairing is deliberate: the dropdown was the only
            attribution layer that works, so it does not leave signup without
            this. */}
        {/* Only ever renders for someone whose CV we read and who has NOT
            already declared skills — so it cannot compete with HeardFromPrompt
            for the same person on the same visit in the common case, and it
            disappears for good once answered or dismissed. */}
        <ConfirmCvSkillsPrompt />
        <HeardFromPrompt />

        <div className={styles.grid}>
          {/* ════════════════════ LEFT COLUMN ═════════════════ */}
          <div className={styles.colLeft}>

            {/* ── 2. YOUR PROFILE — shared dual-mode card (dashboard) ── */}
            <div className={styles.mProfile}>
            {candidate ? (
              <CandidateCard
                candidate={candidate}
                mode="dashboard"
                dashboardPhotoUrl={effectivePhotoUrl}
                // Only an uploaded dashboard photo can be removed — there's
                // nothing of ours to delete when the picture came from Google.
                photoRemovable={!!dashboardPhotoUrl}
                photoUploading={photoUploading}
                onPhotoClick={triggerPhotoUpload}
                onPhotoRemove={handlePhotoRemove}
                completionPct={completionPct}
                fieldsComplete={PROFILE_FIELDS.length - missingFields.length}
                fieldsTotal={PROFILE_FIELDS.length}
                missingFields={cardMissing}
                onAddJobTitle={needsJobTitle ? () => router.push(jobTitleField.link) : undefined}
                isDiscoverable={isDiscoverable}
                onToggleDiscoverable={handleToggleDiscoverable}
                heldUntil={heldUntil}
              />
            ) : (
              <div className={`${styles.card} ${styles.aYellow}`}>
                <div className={styles.cardBody}>
                  <p>Set up your profile so employers can find you. <Link href="/profile" className={styles.cardLink}>Get started &rarr;</Link></p>
                </div>
              </div>
            )}
            </div>

            {/* ── 3. APPLICATION TRACKER ───────────────────── */}
            <div className={`${styles.card} ${styles.aBlue} ${styles.mApplications}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Applications</h2>
                <Link href="/applications" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {applications.length > 0 ? (
                  <>
                    {/* Pipeline */}
                    <div className={styles.pipeline}>
                      {STATUS_ORDER.map(s => (
                        <div key={s} className={styles.pipelineStage}>
                          <div className={styles.pipelineCount} style={funnelChipStyle(s)}>
                            {statusCounts[s]}
                          </div>
                          <span className={styles.pipelineLabel}>{STATUS_LABELS[s]}</span>
                        </div>
                      ))}
                    </div>

                    {/* Recent applications */}
                    <div className={styles.recentApps}>
                      {recentApps.map(app => (
                        <Link key={app.id} href="/applications" className={styles.appCard} style={{ textDecoration: 'none', color: 'inherit' }}>
                          <div className={styles.appCardInfo}>
                            <h4>{app.job_title || 'Untitled Position'}</h4>
                            <p>{app.company || 'Company'} &middot; {formatRelativeTime(app.created_at)}</p>
                          </div>
                          <span className={`${styles.statusBadge} ${styles[getStatusColor(app.status)]}`}>
                            {STATUS_LABELS[app.status] || app.status}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}><Ico name="file-text" size={24} /></div>
                    <p>No applications yet. Start browsing jobs!</p>
                    <Link href="/jobs" className={styles.cardLink}>Browse Jobs &rarr;</Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── 4. RECOMMENDED JOBS ─────────────────────── */}
            <div className={`${styles.card} ${styles.aViolet} ${styles.mRecommended}`}>
              <div className={styles.cardHeader}>
                {/* "Recommended for You" IS A CLAIM, and for 23 of 43 real
                    candidates it is false: they carry no title, no sector and
                    no skills, so nothing in the score comes from job fit,
                    nothing clears the 25-point threshold, and MIN_RESULTS hands
                    them the three most recently posted roles. That is a useful
                    thing to show — better than a form on a job board — but it
                    is not a recommendation, and saying so costs nothing.

                    The condition is RELEVANCE signals only. A candidate with a
                    salary expectation and nothing else is still someone we
                    cannot match. */}
                <h2 className={styles.cardTitle}>
                  {hasRelevanceSignal(candidate) ? 'Recommended for You' : 'Latest roles'}
                </h2>
                <Link href="/jobs?browse=all" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {recommendedJobs.length > 0 ? (
                  <div className={styles.recScrollWrap}>
                    <button
                      type="button"
                      className={`${styles.recNav} ${styles.recNavPrev}`}
                      aria-label="Scroll recommended jobs left"
                      onClick={() => scrollRec(-1)}
                    >
                      &lsaquo;
                    </button>
                    <div className={styles.recScroller} ref={recScrollerRef}>
                      {recommendedJobs.map(job => (
                        <JobCardLink key={job.id} job={job} className={styles.recItem}>
                          <button
                            type="button"
                            className={styles.recDismiss}
                            aria-label={`Not interested in ${job.title}`}
                            title="Not interested"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissJob(job.id) }}
                          >
                            &times;
                          </button>
                        </JobCardLink>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={`${styles.recNav} ${styles.recNavNext}`}
                      aria-label="Scroll recommended jobs right"
                      onClick={() => scrollRec(1)}
                    >
                      &rsaquo;
                    </button>
                  </div>
                ) : !candidate?.jobSector && !candidate?.jobTitle && (!candidate?.skills || candidate.skills.length === 0) ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}><Ico name="sparkles" size={24} /></div>
                    <p>Complete your profile to get personalised job recommendations.</p>
                    <Link href="/profile" className={styles.cardLink}>Complete Profile &rarr;</Link>
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}><Ico name="search" size={24} /></div>
                    <p>No matching jobs right now. We&apos;ll notify you when new opportunities match your profile.</p>
                    <Link href="/jobs" className={styles.cardLink}>Browse All Jobs &rarr;</Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── 5. CAREER INSIGHTS ─────────────────────── */}

          </div>

          {/* ════════════════════ RIGHT COLUMN ════════════════ */}
          <div className={styles.colRight}>



            {/* ── 7. BOOST STATUS ───────────────────────────
                GATED BEHIND profileViews > 0. "Stand out to employers — appear
                first in search results" sold next to two zeroes was the worst
                thing on this page: you cannot boost something that has not
                happened, and offering to amplify nothing reads as a charge for
                a problem we created.

                An ACTIVE boost always shows, whatever the view count — someone
                who has already paid must be able to see what they bought, and
                that state is exactly the one a naive `views > 0` gate would
                have hidden on a quiet week. The gate is on the OFFER, not on
                the panel.

                30 days rather than 7: a week of zero views is normal noise on a
                board this size, and hiding the offer on that basis would make
                it flicker in and out. */}
            {(profileViews30d > 0 || !!activeBoost) && (
            <div className={`${styles.card} ${styles.aYellow} ${styles.mBoost}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Profile Boost</h2>
              </div>
              <div className={styles.cardBody}>
                {activeBoost ? (
                  <>
                    <div className={styles.boostActive}>
                      <div className={styles.boostActiveLabel}><Ico name="zap" size={16} /> Profile Boosted</div>
                      <span className={styles.boostDays}>{getDaysRemaining(activeBoost.expires_at)} days remaining</span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-gray)', textAlign: 'center', margin: 0 }}>
                      Your profile appears first in employer searches with a Featured badge.
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-gray)', margin: '0 0 0.75rem' }}>
                      Stand out to employers — appear first in search results with a Featured badge.
                    </p>
                    {PAID_SURFACES_ENABLED && (<button className={styles.boostBtn} onClick={() => setBoostModalOpen(true)}>
                      <Ico name="zap" size={16} /> Boost Profile
                    </button>)}
                  </>
                )}
              </div>
            </div>
            )}

            {/* ── 8. SAVED JOBS ─────────────────────────────
                "View →" pointed at /jobs — the whole board — from a panel
                counting the jobs this person had SAVED. /saved-jobs exists, is
                candidate-only, and is what the link always meant. */}
            <div className={`${styles.card} ${styles.aGrey} ${styles.mSaved}`}>
              <div className={styles.cardBody} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--black)' }}>{savedCount}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-gray)', marginLeft: '0.5rem' }}>Saved Jobs</span>
                </div>
                <Link href="/saved-jobs" className={styles.cardLink}>View &rarr;</Link>
              </div>
            </div>

            {/* ── 9. UPCOMING INTERVIEWS ──────────────────── */}
            {upcomingInterviews.length > 0 && (
              <div className={`${styles.card} ${styles.aCyan} ${styles.mInterviews}`}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Upcoming Interviews</h2>
                  <Link href="/applications" className={styles.cardLink}>View all &rarr;</Link>
                </div>
                <div className={styles.cardBody}>
                  {upcomingInterviews.map((iv: any) => {
                    const job = Array.isArray(iv.jobs) ? iv.jobs[0] : iv.jobs
                    // The SELECT above filters via .gte('interview_date', todayStr)
                    // which excludes NULL rows, so iv.interview_date should be
                    // present here. Defensive in case the query changes — render
                    // "Awaiting scheduling" rather than "Invalid Date".
                    // See audit fix #1b.
                    const dateStr = iv.interview_date
                      ? new Date(iv.interview_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                      : 'Awaiting scheduling'
                    const [h, m] = (iv.interview_time || '').split(':').map(Number)
                    const timeStr = !isNaN(h) ? `${h % 12 || 12}:${String(m || 0).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}` : (iv.interview_time || '')
                    const needsAction = iv.status === 'scheduled'
                    return (
                      <div key={iv.id} style={{ padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.25rem' }}><Ico name="calendar" size={20} /></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>{job?.title || 'Interview'}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{dateStr} at {timeStr} · {job?.company || ''}</div>
                        </div>
                        {needsAction && (
                          <Link href="/applications" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#d97706', textDecoration: 'none', background: '#fffbeb', padding: '0.25rem 0.5rem', borderRadius: 4 }}>
                            Confirm
                          </Link>
                        )}
                        {iv.status === 'confirmed' && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a' }}>Confirmed</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Messages and Notifications were panels here. Both already had
                pages of their own, both are one tap away in the Also row, and
                the answer line already says "3 unread messages" when it
                matters — a panel repeating what the top of the page just told
                you is the repetition this whole item exists to remove. */}
          </div>
        </div>

        {/* ── ALSO ─────────────────────────────────────────────────
            THE RECEIPT THAT NOTHING WAS DELETED. Career Insights, Activity and
            Profile Views left this page for /insights; Saved Jobs, Messages and
            Notifications already had pages of their own. A panel that moves
            without a link is a panel that was removed, whatever the commit
            message says.

            EVERY ONE OF THESE ROUTES EXISTS. /insights is new and candidate-
            only; the other three were already live. The instruction that
            produced this row also named a "Shift availability" panel — there
            isn't one on this dashboard, and /settings/availability is the
            EMPLOYER's interview calendar, so it is deliberately not here rather
            than pointed at something plausible. ── */}
        <div className={styles.alsoRow}>
          <span className={styles.alsoLabel}>Also</span>
          <Link href="/insights" className={styles.alsoLink}>Insights</Link>
          <Link href="/saved-jobs" className={styles.alsoLink}>Saved jobs</Link>
          <Link href="/messages" className={styles.alsoLink}>Messages</Link>
          <Link href="/notifications" className={styles.alsoLink}>Notifications</Link>
        </div>
      </div>

      {/* Profile Boost Payment Modal — only mounted when the user opens it,
          so Stripe.js isn't fetched on every candidate dashboard load. */}
      {PAID_SURFACES_ENABLED && boostModalOpen && (
        <ProfileBoostPaymentModal
          isOpen={boostModalOpen}
          onClose={() => setBoostModalOpen(false)}
          onSuccess={async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              try {
                const { data } = await supabase
                  .from('boosts')
                  .select('*')
                  .eq('user_id', session.user.id)
                  .eq('boost_type', 'profile')
                  .eq('is_active', true)
                  .gt('expires_at', new Date().toISOString())
                  .order('expires_at', { ascending: false })
                  .limit(1)
                if (data && data.length > 0) setActiveBoost(data[0])
              } catch { /* ignore */ }
            }
          }}
          userId={user?.id || ''}
          userEmail={user?.email || ''}
          targetId={user?.id || ''}
        />
      )}
    </main>
  )
}
