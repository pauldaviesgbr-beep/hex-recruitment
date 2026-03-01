'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import styles from './page.module.css'

const SOURCE_COLORS: Record<string, string> = {
  search: '#3b82f6',
  direct: '#FFD700',
  recommendation: '#16a34a',
  saved: '#8b5cf6',
  external: '#f59e0b',
}

const CLICK_COLORS: Record<string, string> = {
  apply_click: '#16a34a',
  save_click: '#3b82f6',
  share_click: '#f59e0b',
}

const CLICK_LABELS: Record<string, string> = {
  apply_click: 'Apply Clicks',
  save_click: 'Save Clicks',
  share_click: 'Share Clicks',
}

const FUNNEL_COLORS = ['#64748b', '#3b82f6', '#FFD700', '#16a34a']

export default function JobAnalyticsPage() {
  return (
    <Suspense fallback={
      <main className={styles.page}>
        <Header />
        <div className={styles.container}>
          <JobAnalyticsSkeleton />
        </div>
      </main>
    }>
      <JobAnalyticsContent />
    </Suspense>
  )
}

function JobAnalyticsSkeleton() {
  return (
    <>
      <div className={styles.skeletonLine} style={{ width: '120px', height: '16px', marginBottom: '0.5rem' }} />
      <div className={styles.skeletonLine} style={{ width: '300px', height: '32px', marginBottom: '0.25rem' }} />
      <div className={styles.skeletonLine} style={{ width: '80px', height: '24px', marginBottom: '2rem' }} />
      <div className={styles.skeletonGrid}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className={styles.skeletonCard}>
            <div className={styles.skeletonLine} style={{ width: '50%', margin: '0 auto 0.5rem' }} />
            <div className={styles.skeletonLine} style={{ width: '70%', height: '14px', margin: '0 auto' }} />
          </div>
        ))}
      </div>
      <div className={styles.skeletonChartWrap}>
        <div className={styles.skeletonChart} />
      </div>
    </>
  )
}

function JobAnalyticsContent() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  const [job, setJob] = useState<any>(null)
  const [views, setViews] = useState<any[]>([])
  const [clickEvents, setClickEvents] = useState<any[]>([])
  const [impressions, setImpressions] = useState<any[]>([])
  const [applications, setApplications] = useState<any[]>([])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session || session.user.user_metadata?.role !== 'employer') {
        router.push('/login')
        return
      }

      // Fetch job details and verify ownership
      const { data: jobData } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('employer_id', session.user.id)
        .single()

      if (!jobData) {
        router.push('/dashboard/analytics')
        return
      }

      setJob(jobData)

      // Fetch all related data in parallel
      const [viewsResult, clicksResult, impressionsResult, appsResult] = await Promise.all([
        // Job views (with fallback for missing columns)
        supabase
          .from('job_views')
          .select('id, job_id, viewer_id, viewed_at, source, device_type')
          .eq('job_id', jobId)
          .order('viewed_at', { ascending: false }),
        // Click events
        supabase
          .from('job_click_events')
          .select('id, job_id, user_id, event_type, created_at')
          .eq('job_id', jobId)
          .order('created_at', { ascending: false }),
        // Impressions
        supabase
          .from('job_impressions')
          .select('id, job_id, user_id, search_query, position, created_at')
          .eq('job_id', jobId)
          .order('created_at', { ascending: false }),
        // Applications
        supabase
          .from('job_applications')
          .select('id, job_id, candidate_id, status, applied_at, viewed_at, status_updated_at')
          .eq('job_id', jobId)
          .order('applied_at', { ascending: false }),
      ])

      // Handle views — fallback if extended columns error
      if (viewsResult.error) {
        const { data: baseViews } = await supabase
          .from('job_views')
          .select('id, job_id, viewer_id, viewed_at')
          .eq('job_id', jobId)
          .order('viewed_at', { ascending: false })
        setViews(baseViews || [])
      } else {
        setViews(viewsResult.data || [])
      }

      // Click events and impressions may not have tables yet — handle gracefully
      setClickEvents(clicksResult.data || [])
      setImpressions(impressionsResult.data || [])
      setApplications(appsResult.data || [])

      setLoading(false)
    }

    loadData()
  }, [jobId, router])

  // Summary metrics
  const summary = useMemo(() => {
    const totalViews = views.length || (job?.view_count || 0)
    const uniqueViewers = new Map<string, boolean>()
    views.forEach(v => uniqueViewers.set(v.viewer_id, true))
    const uniqueViews = uniqueViewers.size || totalViews
    const totalApps = applications.length
    const totalImpressions = impressions.length
    const conversionRate = totalApps > 0 && totalViews > 0
      ? ((totalApps / totalViews) * 100).toFixed(1)
      : '0.0'
    const ctr = totalViews > 0 && totalImpressions > 0
      ? ((totalViews / totalImpressions) * 100).toFixed(1)
      : totalViews > 0 ? '-' : '0.0'

    return { totalViews, uniqueViews, totalApps, totalImpressions, conversionRate, ctr }
  }, [views, applications, impressions, job])

  // Daily views & applications line chart
  const dailyData = useMemo(() => {
    if (views.length === 0 && applications.length === 0) return []

    const viewsByDay: Record<string, number> = {}
    const appsByDay: Record<string, number> = {}

    views.forEach((v: any) => {
      const day = new Date(v.viewed_at).toISOString().split('T')[0]
      viewsByDay[day] = (viewsByDay[day] || 0) + 1
    })

    applications.forEach((a: any) => {
      const day = new Date(a.applied_at).toISOString().split('T')[0]
      appsByDay[day] = (appsByDay[day] || 0) + 1
    })

    const allDays = Object.keys(viewsByDay)
    Object.keys(appsByDay).forEach(k => {
      if (!allDays.includes(k)) allDays.push(k)
    })

    return allDays
      .sort((a, b) => a.localeCompare(b))
      .map(day => ({
        date: formatShortDate(day),
        views: viewsByDay[day] || 0,
        applications: appsByDay[day] || 0,
      }))
  }, [views, applications])

  // Click events breakdown
  const clickBreakdown = useMemo(() => {
    if (clickEvents.length === 0) return []

    const counts: Record<string, number> = {}
    clickEvents.forEach((e: any) => {
      const type = e.event_type || 'other'
      counts[type] = (counts[type] || 0) + 1
    })

    return Object.entries(counts)
      .map(([type, value]) => ({
        name: CLICK_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        value,
        fill: CLICK_COLORS[type] || '#64748b',
      }))
      .sort((a, b) => b.value - a.value)
  }, [clickEvents])

  // Recent views list
  const recentViews = useMemo(() => {
    return views.slice(0, 20)
  }, [views])

  // Funnel data: Impressions → Views → Apply Clicks → Applications
  const funnelData = useMemo(() => {
    const applyClicks = clickEvents.filter(e => e.event_type === 'apply_click').length

    return [
      { name: 'Impressions', value: impressions.length },
      { name: 'Views', value: views.length || (job?.view_count || 0) },
      { name: 'Apply Clicks', value: applyClicks },
      { name: 'Applications', value: applications.length },
    ]
  }, [impressions, views, clickEvents, applications, job])

  const maxFunnelValue = funnelData[0]?.value || funnelData[1]?.value || 1

  if (loading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.container}>
          <JobAnalyticsSkeleton />
        </div>
      </main>
    )
  }

  if (!job) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.container}>
          <div className={styles.emptyState}>
            <p>Job not found.</p>
            <Link href="/dashboard/analytics" className={styles.backLink}>Back to Dashboard</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Header />

      <div className={styles.container}>
        {/* Back link + Job header */}
        <Link href="/dashboard/analytics" className={styles.backLink}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Dashboard
        </Link>

        <div className={styles.jobHeader}>
          <div>
            <h1 className={styles.jobTitle}>{job.title}</h1>
            <p className={styles.jobMeta}>
              {job.company && <span>{job.company}</span>}
              {job.location && <span> &middot; {job.location}</span>}
              {job.posted_at && (
                <span> &middot; Posted {new Date(job.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              )}
            </p>
          </div>
          <span className={`${styles.statusBadge} ${getStatusClass(job.status)}`}>
            {job.status}
          </span>
        </div>

        {/* Summary Cards */}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{summary.totalViews.toLocaleString()}</div>
            <div className={styles.summaryLabel}>Total Views</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{summary.uniqueViews.toLocaleString()}</div>
            <div className={styles.summaryLabel}>Unique Views</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{summary.totalApps}</div>
            <div className={styles.summaryLabel}>Applications</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{summary.conversionRate}<span className={styles.summaryUnit}>%</span></div>
            <div className={styles.summaryLabel}>Conversion Rate</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{summary.totalImpressions.toLocaleString()}</div>
            <div className={styles.summaryLabel}>Impressions</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{summary.ctr}{summary.ctr !== '-' && <span className={styles.summaryUnit}>%</span>}</div>
            <div className={styles.summaryLabel}>Click-through Rate</div>
          </div>
        </div>

        {/* Views & Applications Over Time */}
        <div className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Views & Applications Over Time</h2>
          {mounted && dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  labelStyle={{ color: '#1e293b', fontWeight: 600 }}
                />
                <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} dot={false} name="Views" />
                <Line type="monotone" dataKey="applications" stroke="#FFD700" strokeWidth={2} dot={false} name="Applications" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.chartEmpty}>No view or application data yet</div>
          )}
        </div>

        {/* Row: Click Events + Funnel */}
        <div className={styles.twoColGrid}>
          <div className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Click Events</h2>
            {mounted && clickBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={clickBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} width={110} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: any) => [`${value} clicks`]}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {clickBreakdown.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.chartEmptySmall}>No click event data yet</div>
            )}
          </div>

          <div className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Conversion Funnel</h2>
            {funnelData.some(d => d.value > 0) ? (
              <div className={styles.funnelWrap}>
                {funnelData.map((stage, i) => (
                  <div key={stage.name} className={styles.funnelStage}>
                    <span className={styles.funnelLabel}>{stage.name}</span>
                    <div className={styles.funnelBarWrap}>
                      <div
                        className={styles.funnelBar}
                        style={{
                          width: `${maxFunnelValue > 0 ? (stage.value / maxFunnelValue) * 100 : 0}%`,
                          background: FUNNEL_COLORS[i],
                        }}
                      />
                    </div>
                    <span className={styles.funnelValue}>{stage.value}</span>
                    <span className={styles.funnelPercent}>
                      {maxFunnelValue > 0 ? `${Math.round((stage.value / maxFunnelValue) * 100)}%` : '0%'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.chartEmptySmall}>No funnel data yet</div>
            )}
          </div>
        </div>

        {/* Recent Views */}
        <div className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Recent Views</h2>
          {recentViews.length > 0 ? (
            <div className={styles.viewsList}>
              <div className={styles.viewsHeader}>
                <span>Time</span>
                <span>Source</span>
                <span>Device</span>
              </div>
              {recentViews.map((view, i) => (
                <div key={view.id || i} className={styles.viewsRow}>
                  <span className={styles.viewsTime}>{formatRelativeTime(view.viewed_at)}</span>
                  <span className={styles.viewsSource}>
                    {view.source ? (
                      <span className={styles.sourceTag} style={{ background: SOURCE_COLORS[view.source] || '#64748b' }}>
                        {view.source}
                      </span>
                    ) : (
                      <span className={styles.viewsMuted}>-</span>
                    )}
                  </span>
                  <span className={styles.viewsDevice}>
                    {view.device_type || <span className={styles.viewsMuted}>-</span>}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.chartEmptySmall}>No views recorded yet</div>
          )}
        </div>
      </div>
    </main>
  )
}

function getStatusClass(status: string) {
  switch (status) {
    case 'active': return styles.statusActive
    case 'filled': return styles.statusFilled
    case 'expired': return styles.statusExpired
    case 'draft': return styles.statusDraft
    default: return styles.statusDraft
  }
}

function formatRelativeTime(isoDate: string): string {
  const now = new Date()
  const date = new Date(isoDate)
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
