'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import { useMessages } from '@/lib/MessagesContext'
import Header from '@/components/Header'
import styles from './page.module.css'

// ── Helpers ─────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
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

function formatDate(): { day: string; full: string } {
  const now = new Date()
  const day = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const full = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return { day, full }
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Applied',
  reviewing: 'Reviewing',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Rejected',
}

const PIPELINE_STAGES = ['pending', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'] as const

function getStatusStyle(status: string): string {
  if (status === 'pending') return 'statusPending'
  if (status === 'reviewing' || status === 'shortlisted') return 'statusReviewing'
  if (status === 'interview' || status === 'offered' || status === 'hired') return 'statusInterview'
  if (status === 'rejected') return 'statusRejected'
  return 'statusPending'
}

function getPipelineStyle(status: string): string {
  if (status === 'pending') return 'pipelineCountYellow'
  if (status === 'reviewing' || status === 'shortlisted') return 'pipelineCountBlue'
  if (status === 'interview' || status === 'offered' || status === 'hired') return 'pipelineCountGreen'
  if (status === 'rejected') return 'pipelineCountRed'
  return 'pipelineCountYellow'
}

const QUICK_ACTIONS = [
  { href: '/post-job', icon: '\u2795', iconStyle: 'quickActionIconYellow', title: 'Post New Job', desc: 'Create a new job listing' },
  { href: '/candidates', icon: '\uD83D\uDC64', iconStyle: 'quickActionIconBlue', title: 'Browse Candidates', desc: 'Find the right talent' },
  { href: '/dashboard/analytics', icon: '\uD83D\uDCC8', iconStyle: 'quickActionIconGreen', title: 'View Analytics', desc: 'Track your performance' },
  { href: '/messages', icon: '\uD83D\uDCAC', iconStyle: 'quickActionIconPurple', title: 'Messages', desc: 'Chat with candidates' },
] as const

// ── Skeleton placeholder ────────────────────────────────
function SkeletonCard({ height = 120 }: { height?: number }) {
  return <div className={`${styles.skeleton} ${styles.skeletonCard}`} style={{ height }} />
}

// ═════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════

export default function EmployerDashboardPage() {
  const router = useRouter()
  const { conversations, totalUnreadCount } = useMessages()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)

  // Stats
  const [totalJobs, setTotalJobs] = useState(0)
  const [activeJobs, setActiveJobs] = useState(0)
  const [totalApplications, setTotalApplications] = useState(0)
  const [totalViews, setTotalViews] = useState(0)
  const [newJobsThisWeek, setNewJobsThisWeek] = useState(0)
  const [newAppsThisWeek, setNewAppsThisWeek] = useState(0)

  // Data
  const [applications, setApplications] = useState<any[]>([])
  const [jobsData, setJobsData] = useState<any[]>([])

  // ── Load data ───────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      // DEV MODE
      if (DEV_MODE) {
        const mockUser = getMockUser()
        const userType = getMockUserType()

        if (userType !== 'employer') {
          router.replace('/dashboard')
          return
        }

        setUser(mockUser)
        setCompanyName(mockUser?.user_metadata?.company_name || 'Your Company')

        // Load company logo from localStorage profile
        const savedProfile = localStorage.getItem('employerProfile')
        if (savedProfile) {
          const profile = JSON.parse(savedProfile)
          if (profile.logoUrl) setCompanyLogo(profile.logoUrl)
        }

        setTotalJobs(8)
        setActiveJobs(5)
        setTotalApplications(34)
        setTotalViews(287)
        setApplications([
          { id: '1', candidate_name: 'Sarah Johnson', job_title: 'Head Chef', status: 'pending', created_at: new Date(Date.now() - 3600000).toISOString() },
          { id: '2', candidate_name: 'Michael Brown', job_title: 'Sous Chef', status: 'shortlisted', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
          { id: '3', candidate_name: 'Emma Wilson', job_title: 'Pastry Chef', status: 'interview', created_at: new Date(Date.now() - 4 * 86400000).toISOString() },
          { id: '4', candidate_name: 'James Taylor', job_title: 'Kitchen Porter', status: 'hired', created_at: new Date(Date.now() - 6 * 86400000).toISOString() },
          { id: '5', candidate_name: 'Olivia Davis', job_title: 'Waitress', status: 'rejected', created_at: new Date(Date.now() - 8 * 86400000).toISOString() },
        ])
        setJobsData([
          { id: 'j1', title: 'Head Chef', status: 'active', view_count: 84, application_count: 12 },
          { id: 'j2', title: 'Sous Chef', status: 'active', view_count: 67, application_count: 9 },
          { id: 'j3', title: 'Pastry Chef', status: 'active', view_count: 52, application_count: 7 },
        ])
        setLoading(false)
        return
      }

      // PRODUCTION MODE
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.user_metadata?.role !== 'employer') { router.replace('/dashboard'); return }

      setUser(session.user)
      const userId = session.user.id
      setCompanyName(session.user.user_metadata?.company_name || 'Your Company')

      // Fetch company logo from employer_profiles, fallback to user_metadata
      try {
        const { data: empProfile } = await supabase
          .from('employer_profiles')
          .select('logo_url')
          .eq('user_id', userId)
          .maybeSingle()
        if (empProfile?.logo_url) {
          setCompanyLogo(empProfile.logo_url)
        } else if (session.user.user_metadata?.logo_url) {
          setCompanyLogo(session.user.user_metadata.logo_url)
        }
      } catch { /* employer_profiles may not exist */ }

      // Fetch employer's jobs
      try {
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, title, status, view_count, posted_at')
          .eq('employer_id', userId)
          .order('posted_at', { ascending: false })

        if (jobs) {
          setTotalJobs(jobs.length)
          setActiveJobs(jobs.filter(j => j.status === 'active').length)

          const views = jobs.reduce((sum: number, j: any) => sum + (j.view_count || 0), 0)
          setTotalViews(views)

          // Compute "new jobs this week" badge
          const now = new Date()
          const dayOfWeek = now.getDay() // 0=Sun
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
          const weekStart = new Date(now)
          weekStart.setHours(0, 0, 0, 0)
          weekStart.setDate(now.getDate() + mondayOffset)
          const jobsThisWeek = jobs.filter(j => j.posted_at && new Date(j.posted_at) >= weekStart).length
          setNewJobsThisWeek(jobsThisWeek)

          // Fetch ALL applications for these jobs (no limit — need accurate total count)
          const jobIds = jobs.map(j => j.id)
          if (jobIds.length > 0) {
            try {
              const { data: appData } = await supabase
                .from('job_applications')
                .select('id, job_id, job_title, company, status, created_at, candidate_id')
                .in('job_id', jobIds)
                .order('created_at', { ascending: false })

              if (appData) {
                setTotalApplications(appData.length)

                // Compute "new apps this week" badge
                const appsThisWeek = appData.filter(a => a.created_at && new Date(a.created_at) >= weekStart).length
                setNewAppsThisWeek(appsThisWeek)

                // Build per-job application count map for enriching jobsData
                const appCountByJob: Record<string, number> = {}
                appData.forEach((a: any) => {
                  appCountByJob[a.job_id] = (appCountByJob[a.job_id] || 0) + 1
                })

                // Enrich jobs with real application counts
                const enrichedJobs = jobs.map(j => ({
                  ...j,
                  application_count: appCountByJob[j.id] || 0,
                }))
                setJobsData(enrichedJobs)

                // Keep only the most recent 50 for the pipeline/recent apps display
                const recentApps = appData.slice(0, 50)
                setApplications(recentApps)

                // Enrich with candidate names
                const candidateIds = Array.from(new Set(recentApps.map((a: any) => a.candidate_id).filter(Boolean)))
                if (candidateIds.length > 0) {
                  try {
                    const { data: profiles } = await supabase
                      .from('candidate_profiles')
                      .select('user_id, full_name')
                      .in('user_id', candidateIds)

                    if (profiles) {
                      const nameMap: Record<string, string> = {}
                      profiles.forEach((p: any) => { nameMap[p.user_id] = p.full_name })
                      setApplications(prev => prev.map(a => ({
                        ...a,
                        candidate_name: nameMap[a.candidate_id] || 'Candidate',
                      })))
                    }
                  } catch { /* candidate_profiles may not exist */ }
                }
              } else {
                // No applications — still set jobsData with zero counts
                setJobsData(jobs.map(j => ({ ...j, application_count: 0 })))
              }
            } catch {
              // job_applications table may not exist — set jobsData with zero counts
              setJobsData(jobs.map(j => ({ ...j, application_count: 0 })))
            }
          } else {
            setJobsData([])
          }
        }
      } catch { /* jobs table query failed */ }

      setLoading(false)
    }

    load()
  }, [router])

  // ── Derived data ────────────────────────────────────────

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    PIPELINE_STAGES.forEach(s => { counts[s] = 0 })
    applications.forEach(a => {
      const s = (a.status || 'pending').toLowerCase()
      if (counts[s] !== undefined) counts[s]++
      else counts['pending']++
    })
    return counts
  }, [applications])

  const recentApps = useMemo(() => applications.slice(0, 5), [applications])

  const activeJobsList = useMemo(() =>
    jobsData.filter(j => j.status === 'active').slice(0, 5)
  , [jobsData])

  const recentConversations = useMemo(() =>
    [...conversations]
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 3)
  , [conversations])

  const dateInfo = formatDate()

  // ── Loading state ───────────────────────────────────────
  if (loading) {
    return (
      <main className={styles.pageBackground}>
        <Header />
        <div className={styles.dashboardWrap}>
          <div className={styles.welcomeHeader}>
            <div className={styles.welcomeLeft}>
              <div className={`${styles.skeleton} ${styles.skeletonCircle}`} />
              <div style={{ flex: 1 }}>
                <div className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: '220px' }} />
                <div className={`${styles.skeleton} ${styles.skeletonLineShort}`} style={{ width: '150px' }} />
              </div>
            </div>
          </div>
          <div className={styles.statsRow}>
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={100} />)}
          </div>
          <div className={styles.grid}>
            <div className={styles.colLeft}>
              <SkeletonCard height={260} />
              <SkeletonCard height={200} />
            </div>
            <div className={styles.colRight}>
              <SkeletonCard height={200} />
              <SkeletonCard height={180} />
            </div>
          </div>
        </div>
      </main>
    )
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'

  return (
    <main className={styles.pageBackground}>
      <Header />

      <div className={styles.dashboardWrap}>
        {/* ── WELCOME HEADER ─────────────────────────────── */}
        <div className={styles.welcomeHeader}>
          <div className={styles.welcomeLeft}>
            <div className={styles.avatarPlaceholder}>
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} className={styles.avatarImage} />
              ) : (
                getInitials(companyName || displayName)
              )}
            </div>
            <div className={styles.welcomeText}>
              <h1>{getGreeting()}, {displayName.split(' ')[0]}</h1>
              <p className={styles.companyLabel}>{companyName}</p>
              <p className={styles.welcomeSub}>Here&apos;s what&apos;s happening with your jobs today</p>
            </div>
          </div>
          <div className={styles.welcomeDate}>
            <span className={styles.welcomeDateDay}>{dateInfo.day}</span>
            {dateInfo.full}
          </div>
        </div>

        {/* ── STATS ROW ──────────────────────────────────── */}
        <div className={styles.statsRow}>
          <div className={`${styles.statCard} ${styles.statCardGold}`} data-watermark="&#128188;">
            <div className={styles.statTop}>
              <span className={styles.statLabel}>Total Jobs</span>
              {newJobsThisWeek > 0 && (
                <span className={`${styles.statTrend} ${styles.statTrendUp}`}>+{newJobsThisWeek} this week</span>
              )}
            </div>
            <span className={styles.statNumber}>{totalJobs}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statCardGreen}`} data-watermark="&#9889;">
            <div className={styles.statTop}>
              <span className={styles.statLabel}>Active Jobs</span>
            </div>
            <span className={styles.statNumber}>{activeJobs}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statCardBlue}`} data-watermark="&#128196;">
            <div className={styles.statTop}>
              <span className={styles.statLabel}>Applications</span>
              {newAppsThisWeek > 0 && (
                <span className={`${styles.statTrend} ${styles.statTrendUp}`}>+{newAppsThisWeek} this week</span>
              )}
            </div>
            <span className={styles.statNumber}>{totalApplications}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statCardPurple}`} data-watermark="&#128065;">
            <div className={styles.statTop}>
              <span className={styles.statLabel}>Job Views</span>
            </div>
            <span className={styles.statNumber}>{totalViews}</span>
          </div>
        </div>

        <div className={styles.grid}>
          {/* ════════════════ LEFT COLUMN ═════════════════ */}
          <div className={styles.colLeft}>

            {/* ── APPLICATION PIPELINE ──────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Application Pipeline</h2>
                <Link href="/my-jobs" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {/* Pipeline always renders all 7 stages */}
                <div className={styles.pipelineWrap}>
                  <div className={styles.pipelineTrack} />
                  <div className={styles.pipeline}>
                    {PIPELINE_STAGES.map(s => {
                      const count = statusCounts[s]
                      const isActive = count > 0
                      return (
                        <div key={s} className={styles.pipelineStage}>
                          <div
                            className={`${styles.pipelineCount} ${styles[getPipelineStyle(s)]} ${isActive ? styles.pipelineCountActive : styles.pipelineCountMuted}`}
                          >
                            {count}
                          </div>
                          <span className={styles.pipelineLabel}>
                            {STATUS_LABELS[s]}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {applications.length > 0 ? (
                  <div className={styles.recentApps}>
                    {recentApps.map(app => (
                      <Link href={`/my-jobs/${app.job_id}/applications`} key={app.id} className={styles.appCard}>
                        <div className={styles.appCardInfo}>
                          <h4>{app.candidate_name || 'Candidate'}</h4>
                          <p>{app.job_title || 'Position'} &middot; {formatRelativeTime(app.created_at)}</p>
                        </div>
                        <div className={styles.appCardRight}>
                          <span className={`${styles.statusBadge} ${styles[getStatusStyle(app.status)]}`}>
                            {STATUS_LABELS[app.status] || app.status}
                          </span>
                          <span className={styles.appChevron}>&rsaquo;</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128196;</div>
                    <p>No applications yet. Post a job to start receiving applications!</p>
                    <Link href="/post-job" className={styles.cardLink}>Post a Job &rarr;</Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── ACTIVE JOBS ──────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Active Jobs</h2>
                <Link href="/my-jobs" className={styles.cardLink}>Manage Jobs</Link>
              </div>
              <div className={styles.cardBody}>
                {activeJobsList.length > 0 ? (
                  <div className={styles.jobList}>
                    {activeJobsList.map(job => {
                      const appCount = job.application_count || 0
                      const maxApps = 20
                      const fillPct = Math.min((appCount / maxApps) * 100, 100)
                      return (
                        <Link href="/my-jobs" key={job.id} className={styles.jobItem}>
                          <div className={styles.jobItemInfo}>
                            <h4>{job.title}</h4>
                            <div className={styles.jobItemMeta}>
                              <div className={styles.jobProgressWrap}>
                                <div className={styles.jobProgressLabel}>{appCount} apps</div>
                                <div className={styles.jobProgressBar}>
                                  <div className={styles.jobProgressFill} style={{ width: `${fillPct}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className={styles.jobItemStats}>
                            <div className={styles.jobItemStat}>
                              <span className={styles.jobItemStatNum}>{job.view_count || 0}</span>
                              <span className={styles.jobItemStatLabel}>Views</span>
                            </div>
                            <div className={styles.jobItemStat}>
                              <span className={styles.jobItemStatNum}>{appCount}</span>
                              <span className={styles.jobItemStatLabel}>Apps</span>
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128188;</div>
                    <p>No active jobs. Post your first listing!</p>
                    <Link href="/post-job" className={styles.cardLink}>Post a Job &rarr;</Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ════════════════ RIGHT COLUMN ════════════════ */}
          <div className={styles.colRight}>

            {/* ── QUICK ACTIONS ─────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Quick Actions</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.quickActions}>
                  {QUICK_ACTIONS.map(action => (
                    <Link key={action.href} href={action.href} className={styles.quickAction}>
                      <div className={`${styles.quickActionIcon} ${styles[action.iconStyle]}`}>{action.icon}</div>
                      <div className={styles.quickActionText}>
                        <span className={styles.quickActionTitle}>
                          {action.title === 'Messages' && totalUnreadCount > 0
                            ? `${action.title} (${totalUnreadCount})`
                            : action.title}
                        </span>
                        <span className={styles.quickActionDesc}>{action.desc}</span>
                      </div>
                      <span className={styles.quickActionArrow}>&rarr;</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* ── MESSAGES ───────────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recent Messages</h2>
                <Link href="/messages" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {recentConversations.length > 0 ? (
                  <div className={styles.msgList}>
                    {recentConversations.map(conv => (
                      <Link href="/messages" key={conv.id} className={styles.msgItem}>
                        <div className={styles.msgAvatarWrap}>
                          <div className={styles.msgAvatar}>
                            {conv.participantName ? getInitials(conv.participantName) : '?'}
                          </div>
                          <span className={conv.unreadCount > 0 ? styles.msgOnline : styles.msgOffline} />
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
          </div>
        </div>
      </div>
    </main>
  )
}
