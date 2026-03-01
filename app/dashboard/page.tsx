'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import { supabaseProfileToCandidate } from '@/lib/types'
import { Candidate } from '@/lib/mockCandidates'
import { useJobs } from '@/lib/JobsContext'
import { useMessages } from '@/lib/MessagesContext'
import { useSavedJobs } from '@/lib/useSavedJobs'
import { scoreAndRankJobs, RecommendedJob } from '@/lib/recommendations'
import { Boost, PROFILE_BOOST_TIERS, getDaysRemaining } from '@/lib/boostTypes'
import { Notification, formatNotificationTime } from '@/lib/mockNotifications'
import Header from '@/components/Header'
import BoostModal from '@/components/BoostModal'
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

function getPipelineColor(status: string): string {
  if (status === 'pending') return 'pipelineCountYellow'
  if (status === 'reviewing' || status === 'shortlisted') return 'pipelineCountBlue'
  if (status === 'interview' || status === 'offered' || status === 'hired') return 'pipelineCountGreen'
  if (status === 'rejected') return 'pipelineCountRed'
  return 'pipelineCountYellow'
}

// Profile completion fields
interface ProfileField {
  key: string
  label: string
  check: (c: Candidate) => boolean
  link: string
}

const PROFILE_FIELDS: ProfileField[] = [
  { key: 'fullName', label: 'Full name', check: c => !!c.fullName, link: '/settings/profile' },
  { key: 'phone', label: 'Phone number', check: c => !!c.phone, link: '/settings/profile' },
  { key: 'location', label: 'Location', check: c => !!c.location, link: '/settings/profile' },
  { key: 'jobTitle', label: 'Job title', check: c => !!c.jobTitle, link: '/settings/profile' },
  { key: 'experience', label: 'Years of experience', check: c => c.yearsExperience > 0, link: '/settings/profile' },
  { key: 'skills', label: 'Skills (at least 3)', check: c => (c.skills || []).length >= 3, link: '/settings/profile' },
  { key: 'bio', label: 'About me bio', check: c => !!(c.bio || c.personalBio), link: '/settings/profile' },
  { key: 'cvUrl', label: 'Upload CV', check: c => !!c.cvUrl, link: '/settings/profile' },
  { key: 'photo', label: 'Profile photo', check: c => !!c.profilePictureUrl, link: '/settings/profile' },
]

// Sector display labels
const JOB_SECTOR_LABELS: Record<string, string> = {
  hospitality: 'Hospitality Tourism & Sport',
  accountancy: 'Accountancy Banking & Finance',
  business: 'Business Consulting & Management',
  charity: 'Charity & Voluntary Work',
  creative: 'Creative Arts & Design',
  digital: 'Digital & Information Technology',
  energy: 'Energy & Utilities',
  engineering: 'Engineering & Manufacturing',
  environment: 'Environment & Agriculture',
  healthcare: 'Healthcare & Social Care',
  law: 'Law & Legal Services',
  marketing: 'Marketing Advertising & PR',
  media: 'Media & Internet',
  property: 'Property & Construction',
  public: 'Public Services & Administration',
  recruitment: 'Recruitment & HR',
  retail: 'Retail & Sales',
  science: 'Science & Pharmaceuticals',
  teaching: 'Teaching & Education',
  transport: 'Transport & Logistics',
}

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

  // Application data
  const [applications, setApplications] = useState<any[]>([])

  // Profile views
  const [profileViews7d, setProfileViews7d] = useState(0)
  const [profileViews30d, setProfileViews30d] = useState(0)

  // Boost
  const [activeBoost, setActiveBoost] = useState<Boost | null>(null)
  const [boostModalOpen, setBoostModalOpen] = useState(false)

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([])

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
          jobTitle: 'Senior Chef',
          jobSector: 'hospitality',
          location: 'Manchester',
          yearsExperience: 5,
          bio: 'Passionate chef with 5 years of experience.',
          skills: ['Cooking', 'Menu Planning', 'Food Safety'],
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
          { id: '1', job_title: 'Head Chef', company: 'The Grand Hotel', status: 'shortlisted', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
          { id: '2', job_title: 'Sous Chef', company: "Claridge's", status: 'pending', created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
          { id: '3', job_title: 'Pastry Chef', company: 'The Ritz', status: 'interview', created_at: new Date(Date.now() - 7 * 86400000).toISOString() },
        ])

        setProfileViews7d(12)
        setProfileViews30d(47)

        // Mock activity feed data
        setProfileViewEvents([
          { id: 'pv1', viewed_at: new Date(Date.now() - 2 * 3600000).toISOString(), company_name: 'The Savoy Hotel', source: 'search' },
          { id: 'pv2', viewed_at: new Date(Date.now() - 8 * 3600000).toISOString(), company_name: 'Hilton London', source: 'recommendation' },
          { id: 'pv3', viewed_at: new Date(Date.now() - 26 * 3600000).toISOString(), company_name: null, source: 'search' },
          { id: 'pv4', viewed_at: new Date(Date.now() - 3 * 86400000).toISOString(), company_name: "Claridge's", source: null },
        ])
        setStatusChangeEvents([
          { id: 'sc1', job_title: 'Head Chef', company: 'The Grand Hotel', status: 'shortlisted', updated_at: new Date(Date.now() - 4 * 3600000).toISOString() },
          { id: 'sc2', job_title: 'Pastry Chef', company: 'The Ritz', status: 'interview', updated_at: new Date(Date.now() - 2 * 86400000).toISOString() },
        ])

        setLoading(false)
        return
      }

      // PRODUCTION MODE
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

      // Fetch notifications
      try {
        const { data: notifData } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5)
        if (notifData) setNotifications(notifData)
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

  // Profile completion
  const { completionPct, missingFields } = useMemo(() => {
    if (!candidate) return { completionPct: 0, missingFields: PROFILE_FIELDS }
    const completed = PROFILE_FIELDS.filter(f => f.check(candidate))
    const pct = Math.round((completed.length / PROFILE_FIELDS.length) * 100)
    const missing = PROFILE_FIELDS.filter(f => !f.check(candidate))
    return { completionPct: pct, missingFields: missing }
  }, [candidate])

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
    return scoreAndRankJobs(jobs, candidate, appliedIds, []).slice(0, 3)
  }, [candidate, jobs, applications])

  // Recent conversations (top 3)
  const recentConversations = useMemo(() => {
    return [...conversations]
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 3)
  }, [conversations])

  // Profile view trend
  const viewTrend = useMemo(() => {
    const weeklyRate = profileViews7d
    const prevWeeklyRate = Math.max(0, profileViews30d - profileViews7d) / 3
    if (weeklyRate > prevWeeklyRate) return 'up'
    if (weeklyRate < prevWeeklyRate) return 'down'
    return 'neutral'
  }, [profileViews7d, profileViews30d])

  // ── Career insights (derived from already-loaded jobs) ──

  const sectorJobs = useMemo(() => {
    if (!candidate?.jobSector || jobs.length === 0) return []
    const sector = candidate.jobSector.toLowerCase()
    return jobs.filter(job => {
      const cat = (job.category || '').toLowerCase()
      return cat === sector || cat.includes(sector) || sector.includes(cat)
    })
  }, [candidate, jobs])

  const salaryInsights = useMemo(() => {
    if (sectorJobs.length === 0) return null
    const candPeriod = candidate?.salaryPeriod || 'year'
    const yearlyJobs = sectorJobs.filter(j => j.salaryPeriod === 'year')
    const hourlyJobs = sectorJobs.filter(j => j.salaryPeriod === 'hour')
    const targetJobs = candPeriod === 'hour'
      ? (hourlyJobs.length > 0 ? hourlyJobs : yearlyJobs)
      : (yearlyJobs.length > 0 ? yearlyJobs : hourlyJobs)
    if (targetJobs.length === 0) return null
    const period = targetJobs[0].salaryPeriod
    const avgMin = Math.round(targetJobs.reduce((s, j) => s + j.salaryMin, 0) / targetJobs.length)
    const avgMax = Math.round(targetJobs.reduce((s, j) => s + j.salaryMax, 0) / targetJobs.length)
    const candMin = candidate?.salaryMin ? Number(candidate.salaryMin) : null
    const candMax = candidate?.salaryMax ? Number(candidate.salaryMax) : null
    return { avgMin, avgMax, period, candMin, candMax, jobCount: targetJobs.length }
  }, [sectorJobs, candidate])

  const demandTrend = useMemo(() => {
    if (sectorJobs.length === 0) return null
    const now = Date.now()
    const d30 = now - 30 * 86400000
    const d60 = now - 60 * 86400000
    let last30 = 0
    let prev30 = 0
    sectorJobs.forEach(job => {
      const posted = new Date(job.postedDate || job.postedAt).getTime()
      if (isNaN(posted)) return
      if (posted >= d30) last30++
      else if (posted >= d60) prev30++
    })
    const pctChange = prev30 === 0
      ? (last30 > 0 ? 100 : 0)
      : Math.round(((last30 - prev30) / prev30) * 100)
    return { last30, prev30, pctChange }
  }, [sectorJobs])

  const topSkillsInDemand = useMemo(() => {
    if (sectorJobs.length === 0) return []
    const skillFreq: Record<string, number> = {}
    sectorJobs.forEach(job => {
      (job.skillsRequired || []).forEach((skill: string) => {
        const normalized = skill.trim()
        if (normalized) skillFreq[normalized] = (skillFreq[normalized] || 0) + 1
      })
    })
    const sorted = Object.entries(skillFreq).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const candidateSkillsLower = (candidate?.skills || []).map(s => s.toLowerCase().trim())
    return sorted.map(([skill, count]) => ({
      skill,
      count,
      matched: candidateSkillsLower.some(cs => cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs)),
    }))
  }, [sectorJobs, candidate])

  const competitionLevel = useMemo(() => {
    if (sectorJobs.length === 0) return null
    const totalApps = sectorJobs.reduce((s, j) => s + (j.applicationCount || 0), 0)
    const avg = totalApps / sectorJobs.length
    let level: 'Low' | 'Medium' | 'High'
    let color: string
    if (avg < 5) { level = 'Low'; color = '#22c55e' }
    else if (avg <= 15) { level = 'Medium'; color = '#f59e0b' }
    else { level = 'High'; color = '#ef4444' }
    return { level, color, avgAppsPerJob: Math.round(avg), totalJobs: sectorJobs.length }
  }, [sectorJobs])

  const activityFeed = useMemo(() => {
    const events: Array<{ id: string; type: string; icon: string; title: string; subtitle: string; timestamp: string }> = []

    profileViewEvents.forEach(pv => {
      events.push({
        id: `pv-${pv.id}`, type: 'profile_view', icon: '\uD83D\uDC41',
        title: pv.company_name ? `${pv.company_name} viewed your profile` : 'An employer viewed your profile',
        subtitle: pv.source ? `via ${pv.source}` : '',
        timestamp: pv.viewed_at,
      })
    })

    statusChangeEvents.forEach(app => {
      events.push({
        id: `sc-${app.id}`, type: 'status_change', icon: '\uD83D\uDCCB',
        title: `${app.company || 'Employer'} updated your application`,
        subtitle: `${app.job_title || 'Position'} \u2014 now ${STATUS_LABELS[app.status] || app.status}`,
        timestamp: app.updated_at,
      })
    })

    const d7ago = Date.now() - 7 * 86400000
    sectorJobs
      .filter(j => new Date(j.postedDate || j.postedAt).getTime() >= d7ago)
      .slice(0, 3)
      .forEach(job => {
        events.push({
          id: `jm-${job.id}`, type: 'job_match', icon: '\uD83C\uDFAF',
          title: `New match: ${job.title}`,
          subtitle: `${job.company} \u00B7 ${job.location}`,
          timestamp: new Date(job.postedDate || job.postedAt).toISOString(),
        })
      })

    if (activeBoost) {
      const boostStart = new Date(activeBoost.starts_at).getTime()
      const boostedViews = profileViewEvents.filter(pv => new Date(pv.viewed_at).getTime() >= boostStart)
      if (boostedViews.length > 0) {
        events.push({
          id: 'boost-summary', type: 'boost_view', icon: '\u26A1',
          title: `Boost attracted ${boostedViews.length} profile view${boostedViews.length !== 1 ? 's' : ''}`,
          subtitle: `Since ${new Date(activeBoost.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
          timestamp: activeBoost.starts_at,
        })
      }
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return events.slice(0, 8)
  }, [profileViewEvents, statusChangeEvents, sectorJobs, activeBoost])

  // ── Notification icon helper ────────────────────────────
  function notifIcon(type: string): string {
    switch (type) {
      case 'new_application': case 'application_update': return '\uD83D\uDCCB'
      case 'job_match': return '\uD83C\uDFAF'
      case 'message_received': case 'employer_message': return '\uD83D\uDCAC'
      case 'profile_view': case 'profile_viewed': return '\uD83D\uDC41'
      case 'job_approved': return '\u2705'
      case 'job_saved': return '\uD83D\uDD16'
      default: return '\uD83D\uDD14'
    }
  }

  // ── Loading state ───────────────────────────────────────
  if (loading) {
    return (
      <main>
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

  const displayName = candidate?.fullName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════
  return (
    <main>
      <Header />

      <div className={styles.dashboardWrap}>
        {/* ── 1. WELCOME HEADER ──────────────────────────────── */}
        <div className={styles.welcomeHeader}>
          {candidate?.profilePictureUrl ? (
            <img src={candidate.profilePictureUrl} alt={displayName} className={styles.avatar} />
          ) : (
            <div className={styles.avatarPlaceholder}>{getInitials(displayName)}</div>
          )}
          <div className={styles.welcomeText}>
            <h1>{getGreeting()}, {displayName.split(' ')[0]}</h1>
            <p>{candidate?.jobTitle || 'Job Seeker'} {candidate?.location ? `in ${candidate.location}` : ''}</p>
          </div>
        </div>

        <div className={styles.grid}>
          {/* ════════════════════ LEFT COLUMN ═════════════════ */}
          <div className={styles.colLeft}>

            {/* ── 2. PROFILE COMPLETION ────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Profile Completion</h2>
                <Link href="/settings/profile" className={styles.cardLink}>Edit Profile</Link>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.progressRow}>
                  <CircleProgress pct={completionPct} />
                  <div className={styles.progressInfo}>
                    <h3>{completionPct === 100 ? 'Profile complete!' : 'Complete your profile'}</h3>
                    <p>
                      {completionPct === 100
                        ? 'Your profile is fully complete. You stand out to employers!'
                        : `${PROFILE_FIELDS.length - missingFields.length} of ${PROFILE_FIELDS.length} fields completed`}
                    </p>
                  </div>
                </div>

                {missingFields.length > 0 && (
                  <div className={styles.missingFields}>
                    {missingFields.slice(0, 4).map(f => (
                      <div key={f.key} className={styles.missingItem}>
                        <span>{f.label}</span>
                        <Link href={f.link}>Add &rarr;</Link>
                      </div>
                    ))}
                    {missingFields.length > 4 && (
                      <div className={styles.missingItem}>
                        <span>+ {missingFields.length - 4} more fields</span>
                        <Link href="/settings/profile">Complete &rarr;</Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── 3. APPLICATION TRACKER ───────────────────── */}
            <div className={styles.card}>
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
                          <div className={`${styles.pipelineCount} ${styles[getPipelineColor(s)]}`}>
                            {statusCounts[s]}
                          </div>
                          <span className={styles.pipelineLabel}>{STATUS_LABELS[s]}</span>
                        </div>
                      ))}
                    </div>

                    {/* Recent applications */}
                    <div className={styles.recentApps}>
                      {recentApps.map(app => (
                        <div key={app.id} className={styles.appCard}>
                          <div className={styles.appCardInfo}>
                            <h4>{app.job_title || 'Untitled Position'}</h4>
                            <p>{app.company || 'Company'} &middot; {formatRelativeTime(app.created_at)}</p>
                          </div>
                          <span className={`${styles.statusBadge} ${styles[getStatusColor(app.status)]}`}>
                            {STATUS_LABELS[app.status] || app.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128196;</div>
                    <p>No applications yet. Start browsing jobs!</p>
                    <Link href="/jobs" className={styles.cardLink}>Browse Jobs &rarr;</Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── 4. RECOMMENDED JOBS ─────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recommended for You</h2>
                <Link href="/jobs" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {recommendedJobs.length > 0 ? (
                  <div className={styles.recCards}>
                    {recommendedJobs.map(job => {
                      const matchClass = job.matchPercentage >= 70 ? 'recMatchHigh' : job.matchPercentage >= 40 ? 'recMatchMed' : 'recMatchLow'
                      const salary = job.salaryPeriod === 'hour'
                        ? `\u00A3${job.salaryMin}-${job.salaryMax}/hr`
                        : `\u00A3${(job.salaryMin / 1000).toFixed(0)}k-${(job.salaryMax / 1000).toFixed(0)}k`
                      return (
                        <Link href={`/jobs?id=${job.id}`} key={job.id} className={styles.recCard}>
                          <div className={`${styles.recMatch} ${styles[matchClass]}`}>
                            {job.matchPercentage}%
                          </div>
                          <div className={styles.recCardInfo}>
                            <h4>{job.title}</h4>
                            <p className={styles.recCardMeta}>{job.company} &middot; {salary} &middot; {job.location}</p>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                ) : !candidate?.jobSector && !candidate?.jobTitle && (!candidate?.skills || candidate.skills.length === 0) ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#127919;</div>
                    <p>Complete your profile to get personalised job recommendations.</p>
                    <Link href="/settings/profile" className={styles.cardLink}>Complete Profile &rarr;</Link>
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128269;</div>
                    <p>No matching jobs right now. We&apos;ll notify you when new opportunities match your profile.</p>
                    <Link href="/jobs" className={styles.cardLink}>Browse All Jobs &rarr;</Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── 5. CAREER INSIGHTS ─────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Career Insights</h2>
                {candidate?.jobSector && (
                  <span className={styles.insightsSectorBadge}>
                    {JOB_SECTOR_LABELS[candidate.jobSector] || candidate.jobSector}
                  </span>
                )}
              </div>
              <div className={styles.cardBody}>
                {!candidate?.jobSector ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128202;</div>
                    <p>Set your job sector to see career insights tailored to your industry.</p>
                    <Link href="/settings/profile" className={styles.cardLink}>Complete Profile &rarr;</Link>
                  </div>
                ) : (
                  <>
                    {/* Salary Range Bar */}
                    {salaryInsights && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>
                          Average Salary Range
                          <span className={styles.insightMeta}>
                            Based on {salaryInsights.jobCount} job{salaryInsights.jobCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className={styles.salaryBar}>
                          <div className={styles.salaryBarTrack}>
                            {salaryInsights.candMin != null && salaryInsights.avgMax > salaryInsights.avgMin && (
                              <div
                                className={styles.salaryBarMarker}
                                style={{
                                  left: `${Math.max(0, Math.min(100,
                                    ((salaryInsights.candMin - salaryInsights.avgMin) /
                                    (salaryInsights.avgMax - salaryInsights.avgMin)) * 100
                                  ))}%`,
                                }}
                              />
                            )}
                          </div>
                          <div className={styles.salaryBarLabels}>
                            <span>
                              {salaryInsights.period === 'hour'
                                ? `\u00A3${salaryInsights.avgMin}/hr`
                                : `\u00A3${Math.round(salaryInsights.avgMin / 1000)}k`}
                            </span>
                            <span>
                              {salaryInsights.period === 'hour'
                                ? `\u00A3${salaryInsights.avgMax}/hr`
                                : `\u00A3${Math.round(salaryInsights.avgMax / 1000)}k`}
                            </span>
                          </div>
                        </div>
                        {salaryInsights.candMin != null && (
                          <p className={styles.salaryYouLabel}>
                            &#9650; Your range: {salaryInsights.period === 'hour'
                              ? `\u00A3${salaryInsights.candMin}-\u00A3${salaryInsights.candMax}/hr`
                              : `\u00A3${Math.round(salaryInsights.candMin / 1000)}k-\u00A3${Math.round((salaryInsights.candMax || salaryInsights.candMin) / 1000)}k`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Demand Trend */}
                    {demandTrend && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>Sector Demand</div>
                        <div className={styles.demandRow}>
                          <span className={styles.demandCount}>{demandTrend.last30}</span>
                          <span className={styles.demandText}>jobs posted in last 30 days</span>
                          <span className={
                            demandTrend.pctChange > 0 ? styles.trendUp
                            : demandTrend.pctChange < 0 ? styles.trendDown
                            : styles.trendNeutral
                          }>
                            {demandTrend.pctChange > 0 ? '\u25B2' : demandTrend.pctChange < 0 ? '\u25BC' : '\u2014'}
                            {' '}{Math.abs(demandTrend.pctChange)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Top Skills in Demand */}
                    {topSkillsInDemand.length > 0 && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>Top Skills in Demand</div>
                        <div className={styles.skillPills}>
                          {topSkillsInDemand.map(({ skill, count, matched }) => (
                            <span
                              key={skill}
                              className={`${styles.skillPill} ${matched ? styles.skillPillGold : styles.skillPillGrey}`}
                            >
                              {skill}
                              <span className={styles.skillPillCount}>{count}</span>
                              {!matched && (
                                <Link href="/settings/profile" className={styles.skillPillAdd} onClick={(e) => e.stopPropagation()}>
                                  +Add
                                </Link>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Competition Level */}
                    {competitionLevel && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>Competition Level</div>
                        <div className={styles.competitionRow}>
                          <span
                            className={styles.competitionBadge}
                            style={{ background: competitionLevel.color + '18', color: competitionLevel.color }}
                          >
                            {competitionLevel.level}
                          </span>
                          <span className={styles.competitionMeta}>
                            ~{competitionLevel.avgAppsPerJob} applicants per job across {competitionLevel.totalJobs} listings
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Fallback if no data */}
                    {!salaryInsights && !demandTrend && topSkillsInDemand.length === 0 && !competitionLevel && (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>&#128202;</div>
                        <p>Not enough job data in your sector yet. Check back soon!</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── 6. ACTIVITY FEED ───────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Activity</h2>
              </div>
              <div className={styles.cardBody}>
                {activityFeed.length > 0 ? (
                  <div className={styles.timeline}>
                    {activityFeed.map((event, idx) => (
                      <div key={event.id} className={styles.timelineItem}>
                        {idx < activityFeed.length - 1 && <div className={styles.timelineLine} />}
                        <div className={styles.timelineDot}>
                          <span className={styles.timelineIcon}>{event.icon}</span>
                        </div>
                        <div className={styles.timelineContent}>
                          <p className={styles.timelineTitle}>{event.title}</p>
                          {event.subtitle && <p className={styles.timelineSubtitle}>{event.subtitle}</p>}
                          <span className={styles.timelineTime}>{formatRelativeTime(event.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128340;</div>
                    <p>No recent activity. Apply to jobs to see updates here!</p>
                    <Link href="/jobs" className={styles.cardLink}>Browse Jobs &rarr;</Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ════════════════════ RIGHT COLUMN ════════════════ */}
          <div className={styles.colRight}>

            {/* ── 5. PROFILE VIEWS ────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Profile Views</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.statRow}>
                  <div className={styles.stat}>
                    <span className={styles.statNumber}>{profileViews7d}</span>
                    <span className={styles.statLabel}>Last 7 days</span>
                    {viewTrend === 'up' && <span className={styles.trendUp}>&#9650; Trending up</span>}
                    {viewTrend === 'down' && <span className={styles.trendDown}>&#9660; Trending down</span>}
                    {viewTrend === 'neutral' && <span className={styles.trendNeutral}>&#8212; Steady</span>}
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statNumber}>{profileViews30d}</span>
                    <span className={styles.statLabel}>Last 30 days</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 6. MESSAGES ─────────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  Messages
                  {totalUnreadCount > 0 && (
                    <span style={{
                      background: '#6366f1',
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.1rem 0.45rem',
                      borderRadius: '10px',
                      marginLeft: '0.35rem',
                    }}>
                      {totalUnreadCount}
                    </span>
                  )}
                </h2>
                <Link href="/messages" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {recentConversations.length > 0 ? (
                  <div className={styles.msgList}>
                    {recentConversations.map(conv => (
                      <Link href="/messages" key={conv.id} className={styles.msgItem}>
                        <div className={styles.msgAvatar}>
                          {conv.participantName ? getInitials(conv.participantName) : '?'}
                        </div>
                        <div className={styles.msgContent}>
                          <p className={styles.msgSender}>
                            {conv.unreadCount > 0 && <span className={styles.unreadDot} />}
                            {conv.participantName}
                          </p>
                          <p className={styles.msgPreview}>{conv.lastMessage}</p>
                        </div>
                        <span className={styles.msgTime}>{formatRelativeTime(conv.lastMessageAt)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128172;</div>
                    <p>No messages yet.</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── 7. BOOST STATUS ─────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Profile Boost</h2>
              </div>
              <div className={styles.cardBody}>
                {activeBoost ? (
                  <>
                    <div className={styles.boostActive}>
                      <div className={styles.boostActiveLabel}>&#9889; Profile Boosted</div>
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
                    <button className={styles.boostBtn} onClick={() => setBoostModalOpen(true)}>
                      &#9889; Boost Profile
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── 8. SAVED JOBS ───────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardBody} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--black)' }}>{savedCount}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-gray)', marginLeft: '0.5rem' }}>Saved Jobs</span>
                </div>
                <Link href="/jobs" className={styles.cardLink}>View &rarr;</Link>
              </div>
            </div>

            {/* ── 9. NOTIFICATIONS ────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Notifications</h2>
              </div>
              <div className={styles.cardBody}>
                {notifications.length > 0 ? (
                  <div className={styles.notifList}>
                    {notifications.slice(0, 3).map(n => (
                      <Link href={n.link || '#'} key={n.id} className={styles.notifItem}>
                        <span className={styles.notifIcon}>{notifIcon(n.type)}</span>
                        <div className={styles.notifContent}>
                          <p className={styles.notifTitle}>{n.title}</p>
                          {n.message && <p className={styles.notifMsg}>{n.message}</p>}
                        </div>
                        <span className={styles.notifTime}>{formatNotificationTime(n.created_at)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128276;</div>
                    <p>No notifications yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Boost Modal */}
      <BoostModal
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
        boostType="profile"
        targetId={user?.id || ''}
        targetLabel="Your Profile"
        tiers={PROFILE_BOOST_TIERS}
      />
    </main>
  )
}
