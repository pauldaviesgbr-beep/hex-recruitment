'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { getCategoryLabel } from '@/lib/categories'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import styles from './page.module.css'

const PIE_COLORS = ['#FFD700', '#1e293b', '#3b82f6', '#16a34a', '#f59e0b', '#8b5cf6', '#dc2626', '#64748b']

const DEVICE_COLORS: Record<string, string> = {
  desktop: '#3b82f6',
  tablet: '#FFD700',
  mobile: '#16a34a',
}

const SOURCE_COLORS: Record<string, string> = {
  search: '#3b82f6',
  direct: '#FFD700',
  recommendation: '#16a34a',
  saved: '#8b5cf6',
  external: '#f59e0b',
}

const FUNNEL_COLORS = [
  '#3b82f6', // Applied
  '#8b5cf6', // Viewed
  '#FFD700', // Shortlisted
  '#f59e0b', // Interviewed
  '#16a34a', // Offered
  '#059669', // Hired
]

const EXTENDED_FUNNEL_COLORS = [
  '#64748b', // Impressions
  '#3b82f6', // Views
  '#16a34a', // Apply Clicks
  '#FFD700', // Applications
  '#f59e0b', // Shortlisted
  '#8b5cf6', // Interviews
  '#059669', // Offers
  '#0d9488', // Hired
]

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  direct: 'Direct',
  search: 'Search',
  recommendation: 'Shared Link',
  saved: 'Browse',
  external: 'External',
}

type DateRange = '7d' | '30d' | '90d' | '12m' | 'all' | 'custom'
type AnalyticsTab = 'overview' | 'traffic' | 'applications' | 'jobs' | 'market'

const TABS: { key: AnalyticsTab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '\u{1F4CA}' },
  { key: 'traffic', label: 'Traffic & Sources', icon: '\u{1F310}' },
  { key: 'applications', label: 'Applications', icon: '\u{1F4CB}' },
  { key: 'jobs', label: 'Jobs', icon: '\u{1F4BC}' },
  { key: 'market', label: 'Market & Candidates', icon: '\u{1F465}' },
]

export default function AnalyticsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialTab = (searchParams.get('tab') as AnalyticsTab) || 'overview'
  const [activeTab, setActiveTabState] = useState<AnalyticsTab>(
    TABS.some(t => t.key === initialTab) ? initialTab : 'overview'
  )
  const setActiveTab = useCallback((tab: AnalyticsTab) => {
    setActiveTabState(tab)
    const url = tab === 'overview' ? '/dashboard/analytics' : `/dashboard/analytics?tab=${tab}`
    router.replace(url, { scroll: false })
  }, [router])

  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [mounted, setMounted] = useState(false)
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null)
  const [hasSubscription, setHasSubscription] = useState(true)

  // Raw data
  const [jobs, setJobs] = useState<any[]>([])
  const [applications, setApplications] = useState<any[]>([])
  const [interviews, setInterviews] = useState<any[]>([])
  const [offers, setOffers] = useState<any[]>([])
  const [jobViews, setJobViews] = useState<any[]>([])
  const [clickEvents, setClickEvents] = useState<any[]>([])
  const [impressions, setImpressions] = useState<any[]>([])
  const [recentNotifications, setRecentNotifications] = useState<any[]>([])
  const [candidateProfiles, setCandidateProfiles] = useState<any[]>([])

  // Platform-wide data for benchmarking
  const [platformJobs, setPlatformJobs] = useState<any[]>([])
  const [platformApps, setPlatformApps] = useState<any[]>([])
  const [platformViews, setPlatformViews] = useState<any[]>([])
  const [employerCreatedAt, setEmployerCreatedAt] = useState<string | null>(null)

  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const [sortField, setSortField] = useState('applicationCount')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Chart controls
  const [trafficGrouping, setTrafficGrouping] = useState<'day' | 'week' | 'month'>('week')
  const [activityGrouping, setActivityGrouping] = useState<'day' | 'week' | 'month'>('week')
  const [hiddenTrafficSeries, setHiddenTrafficSeries] = useState<Set<string>>(new Set())
  const [hiddenActivitySeries, setHiddenActivitySeries] = useState<Set<string>>(new Set())
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)


  // Close export menu on outside click
  useEffect(() => {
    if (!exportMenuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportMenuOpen])




  const renderInfoIcon = (tooltipText: string) => (
    <span className={styles.infoIconWrap}>
      <svg className={styles.infoIcon} width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className={styles.infoTooltip}>{tooltipText}</span>
    </span>
  )

  // For Recharts SSR guard
  useEffect(() => { setMounted(true) }, [])

  // Sync default chart grouping when date range changes
  useEffect(() => {
    const defaults: Record<DateRange, 'day' | 'week' | 'month'> = {
      '7d': 'day',
      '30d': 'week',
      '90d': 'month',
      '12m': 'month',
      'all': 'month',
      'custom': 'week',
    }
    setTrafficGrouping(defaults[dateRange])
    setActivityGrouping(defaults[dateRange])
  }, [dateRange])

  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session || session.user.user_metadata?.role !== 'employer') {
        router.push('/login')
        return
      }

      const employerId = session.user.id
      setCompanyName(session.user.user_metadata?.company_name || 'Your Company')
      setEmployerCreatedAt(session.user.created_at || null)

      // Check subscription status and tier
      const { data: subData } = await supabase
        .from('employer_subscriptions')
        .select('subscription_status, subscription_tier')
        .eq('user_id', employerId)
        .single()

      if (subData && (subData.subscription_status === 'active' || subData.subscription_status === 'trialing')) {
        setHasSubscription(true)
        setSubscriptionTier(subData.subscription_tier)
      } else {
        setHasSubscription(false)
        setSubscriptionTier(null)
      }

      // Step 1: Fetch employer's jobs
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('*')
        .eq('employer_id', employerId)
        .order('posted_at', { ascending: false })

      const fetchedJobs = jobsData || []
      setJobs(fetchedJobs)

      const jobIds = fetchedJobs.map((j: any) => j.id)

      if (jobIds.length > 0) {
        // Step 2: Fetch related data in parallel
        const [appsResult, interviewsResult, offersResult, notifsResult] = await Promise.all([
          supabase
            .from('job_applications')
            .select('id, job_id, candidate_id, status, applied_at, viewed_at, shortlisted_at, status_updated_at, created_at')
            .in('job_id', jobIds)
            .order('applied_at', { ascending: false }),
          supabase
            .from('interviews')
            .select('id, application_id, job_id, candidate_id, interview_date, status, created_at')
            .eq('employer_id', employerId)
            .order('created_at', { ascending: false }),
          supabase
            .from('job_offers')
            .select('id, application_id, job_id, candidate_id, status, created_at')
            .eq('employer_id', employerId)
            .order('created_at', { ascending: false }),
          supabase
            .from('notifications')
            .select('id, type, title, message, created_at, related_type')
            .eq('user_id', employerId)
            .order('created_at', { ascending: false })
            .limit(20),
        ])

        setApplications(appsResult.data || [])
        setInterviews(interviewsResult.data || [])
        setOffers(offersResult.data || [])
        setRecentNotifications(notifsResult.data || [])

        // Step 3: Fetch job views (with fallback for missing columns)
        const { data: viewsData, error: viewsError } = await supabase
          .from('job_views')
          .select('id, job_id, viewer_id, viewed_at, source, device_type')
          .in('job_id', jobIds)
          .order('viewed_at', { ascending: false })

        if (viewsError) {
          // Fallback: fetch only base columns
          const { data: baseViewsData } = await supabase
            .from('job_views')
            .select('id, job_id, viewer_id, viewed_at')
            .in('job_id', jobIds)
            .order('viewed_at', { ascending: false })
          setJobViews(baseViewsData || [])
        } else {
          setJobViews(viewsData || [])
        }

        // Step 4: Fetch click events and impressions (with fallback if tables don't exist)
        const [clickResult, impressionResult] = await Promise.all([
          supabase
            .from('job_click_events')
            .select('id, job_id, user_id, event_type, created_at')
            .in('job_id', jobIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('job_impressions')
            .select('id, job_id, user_id, created_at')
            .in('job_id', jobIds)
            .order('created_at', { ascending: false }),
        ])

        setClickEvents(clickResult.data || [])
        setImpressions(impressionResult.data || [])

        // Step 5: Fetch candidate profiles for applicants
        const candidateIds = Array.from(new Set((appsResult.data || []).map((a: any) => a.candidate_id).filter(Boolean)))
        if (candidateIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('candidate_profiles')
            .select('user_id, full_name, location, city, county, years_experience, skills, cv_url, profile_picture_url, work_history, job_sector, date_of_birth, nationality')
            .in('user_id', candidateIds)
          setCandidateProfiles(profilesData || [])
        }
      }

      // Step 6: Fetch platform-wide data for market benchmarking
      // Get all jobs (not just this employer's) with key fields
      const { data: allJobsData } = await supabase
        .from('jobs')
        .select('id, employer_id, title, category, salary_min, salary_max, salary_type, salary_period, location, area, status, posted_at, view_count, application_count')
        .in('status', ['active', 'filled', 'expired'])

      const allJobs = allJobsData || []
      setPlatformJobs(allJobs)

      // Get platform-wide views and applications for those jobs
      const allJobIds = allJobs.filter((j: any) => j.employer_id !== employerId).map((j: any) => j.id)
      if (allJobIds.length > 0) {
        const [platViewsResult, platAppsResult] = await Promise.all([
          supabase
            .from('job_views')
            .select('id, job_id, viewed_at')
            .in('job_id', allJobIds.slice(0, 500)),
          supabase
            .from('job_applications')
            .select('id, job_id, applied_at')
            .in('job_id', allJobIds.slice(0, 500)),
        ])
        setPlatformViews(platViewsResult.data || [])
        setPlatformApps(platAppsResult.data || [])
      }

      setLoading(false)
    }

    loadData()
  }, [router])

  // Date threshold helper
  const getDateThreshold = (range: DateRange): Date => {
    const now = new Date()
    switch (range) {
      case '7d': return new Date(now.getTime() - 7 * 86400000)
      case '30d': return new Date(now.getTime() - 30 * 86400000)
      case '90d': return new Date(now.getTime() - 90 * 86400000)
      case '12m': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      case 'custom': return customStartDate ? new Date(customStartDate + 'T00:00:00') : new Date(0)
      default: return new Date(0)
    }
  }

  // Get previous period threshold (for percentage change)
  const getPreviousPeriodThreshold = (range: DateRange): { start: Date; end: Date } => {
    const now = new Date()
    const currentThreshold = getDateThreshold(range)
    const endDate = range === 'custom' && customEndDate ? new Date(customEndDate + 'T23:59:59') : now
    const periodMs = endDate.getTime() - currentThreshold.getTime()
    return {
      start: new Date(currentThreshold.getTime() - periodMs),
      end: currentThreshold,
    }
  }

  // Custom end date for filtering
  const customEndDateObj = useMemo(() => {
    return dateRange === 'custom' && customEndDate ? new Date(customEndDate + 'T23:59:59') : null
  }, [dateRange, customEndDate])

  // Filtered applications by date range
  const filteredApps = useMemo(() => {
    const threshold = getDateThreshold(dateRange)
    return applications.filter(a => {
      const d = new Date(a.applied_at)
      return d >= threshold && (!customEndDateObj || d <= customEndDateObj)
    })
  }, [applications, dateRange, customStartDate, customEndDate])

  // Filtered job views by date range
  const filteredViews = useMemo(() => {
    const threshold = getDateThreshold(dateRange)
    return jobViews.filter(v => {
      const d = new Date(v.viewed_at)
      return d >= threshold && (!customEndDateObj || d <= customEndDateObj)
    })
  }, [jobViews, dateRange, customStartDate, customEndDate])

  // Filtered click events by date range
  const filteredClicks = useMemo(() => {
    const threshold = getDateThreshold(dateRange)
    return clickEvents.filter(c => {
      const d = new Date(c.created_at)
      return d >= threshold && (!customEndDateObj || d <= customEndDateObj)
    })
  }, [clickEvents, dateRange, customStartDate, customEndDate])

  // Filtered impressions by date range
  const filteredImpressions = useMemo(() => {
    const threshold = getDateThreshold(dateRange)
    return impressions.filter(imp => {
      const d = new Date(imp.created_at)
      return d >= threshold && (!customEndDateObj || d <= customEndDateObj)
    })
  }, [impressions, dateRange, customStartDate, customEndDate])

  // Previous period applications
  const prevPeriodApps = useMemo(() => {
    if (dateRange === 'all') return []
    const { start, end } = getPreviousPeriodThreshold(dateRange)
    return applications.filter(a => {
      const d = new Date(a.applied_at)
      return d >= start && d < end
    })
  }, [applications, dateRange, customStartDate, customEndDate])

  // Previous period views
  const prevPeriodViews = useMemo(() => {
    if (dateRange === 'all') return []
    const { start, end } = getPreviousPeriodThreshold(dateRange)
    return jobViews.filter(v => {
      const d = new Date(v.viewed_at)
      return d >= start && d < end
    })
  }, [jobViews, dateRange])

  // Overview metrics with percentage changes
  const metrics = useMemo(() => {
    const activeJobs = jobs.filter(j => j.status === 'active').length
    const totalApplications = filteredApps.length
    const HIRED_STATUSES = ['hired', 'retained', 'left']
    const hires = filteredApps.filter(a => HIRED_STATUSES.includes(a.status)).length
    const totalViewsFromTable = filteredViews.length
    const totalViewsFromJobs = jobs.reduce((sum: number, j: any) => sum + (j.view_count || 0), 0)
    const totalViews = totalViewsFromTable > 0 ? totalViewsFromTable : totalViewsFromJobs

    const hiredApps = filteredApps.filter(a => HIRED_STATUSES.includes(a.status) && a.status_updated_at)
    const avgTimeToHireMs = hiredApps.length > 0
      ? hiredApps.reduce((sum: number, a: any) => {
          const applied = new Date(a.applied_at).getTime()
          const hired = new Date(a.status_updated_at).getTime()
          return sum + (hired - applied)
        }, 0) / hiredApps.length
      : null

    const conversionRate = totalApplications > 0
      ? ((hires / totalApplications) * 100).toFixed(1)
      : '0.0'

    // Previous period metrics for percentage change
    const prevApps = prevPeriodApps.length
    const prevHires = prevPeriodApps.filter(a => ['hired', 'retained', 'left'].includes(a.status)).length
    const prevViews = prevPeriodViews.length
    const prevConversion = prevApps > 0 ? (prevHires / prevApps) * 100 : 0

    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0
      return ((current - previous) / previous) * 100
    }

    return {
      activeJobs,
      totalApplications,
      hires,
      avgTimeToHireMs,
      conversionRate,
      totalViews,
      changes: dateRange !== 'all' ? {
        applications: calcChange(totalApplications, prevApps),
        hires: calcChange(hires, prevHires),
        views: calcChange(totalViews, prevViews > 0 ? prevViews : totalViews),
        conversion: calcChange(parseFloat(conversionRate), prevConversion),
      } : null,
    }
  }, [jobs, filteredApps, filteredViews, prevPeriodApps, prevPeriodViews, dateRange])

  // Traffic Overview chart data (Views + Impressions)
  const trafficChartData = useMemo(() => {
    if (filteredViews.length === 0 && filteredImpressions.length === 0) return []

    const getDateKey = (date: Date): string => {
      if (trafficGrouping === 'day') {
        return date.toISOString().split('T')[0]
      } else if (trafficGrouping === 'week') {
        const weekStart = new Date(date)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
        return weekStart.toISOString().split('T')[0]
      } else {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      }
    }

    const groups: Record<string, { views: number; impressions: number }> = {}
    const ensureKey = (key: string) => {
      if (!groups[key]) groups[key] = { views: 0, impressions: 0 }
    }

    filteredViews.forEach((v: any) => {
      const key = getDateKey(new Date(v.viewed_at))
      ensureKey(key)
      groups[key].views++
    })

    filteredImpressions.forEach((imp: any) => {
      const key = getDateKey(new Date(imp.created_at))
      ensureKey(key)
      groups[key].impressions++
    })

    return Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .map(dateStr => ({
        date: formatChartDate(dateStr, trafficGrouping),
        ...groups[dateStr],
      }))
  }, [filteredViews, filteredImpressions, trafficGrouping])

  // Application Activity chart data (Applications + Apply Clicks + Save Clicks)
  const activityChartData = useMemo(() => {
    if (filteredApps.length === 0 && filteredClicks.length === 0) return []

    const getDateKey = (date: Date): string => {
      if (activityGrouping === 'day') {
        return date.toISOString().split('T')[0]
      } else if (activityGrouping === 'week') {
        const weekStart = new Date(date)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
        return weekStart.toISOString().split('T')[0]
      } else {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      }
    }

    const groups: Record<string, { applications: number; applyClicks: number; saveClicks: number }> = {}
    const ensureKey = (key: string) => {
      if (!groups[key]) groups[key] = { applications: 0, applyClicks: 0, saveClicks: 0 }
    }

    filteredApps.forEach((a: any) => {
      const key = getDateKey(new Date(a.applied_at))
      ensureKey(key)
      groups[key].applications++
    })

    filteredClicks.forEach((c: any) => {
      const key = getDateKey(new Date(c.created_at))
      ensureKey(key)
      if (c.event_type === 'apply') groups[key].applyClicks++
      else if (c.event_type === 'save') groups[key].saveClicks++
    })

    return Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .map(dateStr => ({
        date: formatChartDate(dateStr, activityGrouping),
        ...groups[dateStr],
      }))
  }, [filteredApps, filteredClicks, activityGrouping])

  // Views by source data
  const sourceData = useMemo(() => {
    const hasSourceData = filteredViews.some(v => v.source)
    if (!hasSourceData) return []

    const sourceCounts: Record<string, number> = {}
    filteredViews.forEach((v: any) => {
      const src = v.source || 'unknown'
      if (src === 'unknown') return
      sourceCounts[src] = (sourceCounts[src] || 0) + 1
    })

    return Object.entries(sourceCounts)
      .map(([key, value]) => {
        const displayName = SOURCE_DISPLAY_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1)
        return {
          name: displayName,
          value,
          fill: SOURCE_COLORS[key] || '#64748b',
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [filteredViews])

  // Device breakdown data
  const deviceData = useMemo(() => {
    const hasDeviceData = filteredViews.some(v => v.device_type)
    if (!hasDeviceData) return []

    const deviceCounts: Record<string, number> = {}
    filteredViews.forEach((v: any) => {
      const device = v.device_type || 'unknown'
      deviceCounts[device] = (deviceCounts[device] || 0) + 1
    })

    return Object.entries(deviceCounts)
      .filter(([name]) => name !== 'unknown')
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        fill: DEVICE_COLORS[name] || '#64748b',
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredViews])

  // Conversion funnel data (8 stages)
  const funnelData = useMemo(() => {
    const impressions = filteredImpressions.length
    const views = filteredViews.length
    const applyClicks = filteredClicks.filter((c: any) => c.event_type === 'apply').length
    const applications = filteredApps.length
    const shortlisted = filteredApps.filter((a: any) =>
      ['shortlisted', 'interview', 'interviewing', 'offered', 'hired', 'retained', 'left'].includes(a.status)
    ).length
    const interviewed = filteredApps.filter((a: any) =>
      ['interview', 'interviewing', 'offered', 'hired', 'retained', 'left'].includes(a.status)
    ).length
    const offered = filteredApps.filter((a: any) =>
      ['offered', 'hired', 'retained', 'left'].includes(a.status)
    ).length
    const hired = filteredApps.filter((a: any) => ['hired', 'retained', 'left'].includes(a.status)).length

    return [
      { name: 'Impressions', value: impressions },
      { name: 'Views', value: views },
      { name: 'Apply Clicks', value: applyClicks },
      { name: 'Applications', value: applications },
      { name: 'Shortlisted', value: shortlisted },
      { name: 'Interviews', value: interviewed },
      { name: 'Offers', value: offered },
      { name: 'Hired', value: hired },
    ]
  }, [filteredApps, filteredViews, filteredClicks, filteredImpressions])

  // Job performance table data (enhanced with unique views, CTR, posted date)
  const jobPerformanceData = useMemo(() => {
    return jobs.map((job: any) => {
      const jobApps = applications.filter((a: any) => a.job_id === job.id)
      const jobInterviews = interviews.filter((i: any) => i.job_id === job.id)
      const hiredCount = jobApps.filter((a: any) => ['hired', 'retained', 'left'].includes(a.status)).length
      const viewCount = job.view_count || 0

      // Unique views from job_views table
      const jobViewRecords = jobViews.filter((v: any) => v.job_id === job.id)
      const uniqueViewers = new Set(jobViewRecords.map((v: any) => v.viewer_id))
      const uniqueViewCount = uniqueViewers.size

      // CTR: applications / views
      const ctr = viewCount > 0
        ? ((jobApps.length / viewCount) * 100).toFixed(1)
        : '0.0'

      return {
        id: job.id,
        title: job.title,
        status: job.status,
        category: job.category,
        postedAt: job.posted_at,
        viewCount,
        uniqueViewCount,
        applicationCount: jobApps.length,
        interviewCount: jobInterviews.length,
        hiredCount,
        conversionRate: jobApps.length > 0
          ? ((hiredCount / jobApps.length) * 100).toFixed(1)
          : '0.0',
        ctr,
      }
    }).sort((a: any, b: any) => {
      const aVal = a[sortField as keyof typeof a]
      const bVal = b[sortField as keyof typeof b]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }, [jobs, applications, interviews, jobViews, sortField, sortDirection])

  // Sector breakdown for pie chart
  const sectorData = useMemo(() => {
    const categoryCounts: Record<string, number> = {}
    jobs.forEach((job: any) => {
      const label = job.category ? getCategoryLabel(job.category) : 'Uncategorised'
      categoryCounts[label] = (categoryCounts[label] || 0) + 1
    })
    return Object.entries(categoryCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [jobs])

  // Top converting jobs (top 3 by views-to-applications rate, min 1 application)
  const topConvertingJobs = useMemo(() => {
    return [...jobPerformanceData]
      .filter(j => j.applicationCount >= 1)
      .sort((a, b) => parseFloat(b.ctr) - parseFloat(a.ctr))
      .slice(0, 3)
  }, [jobPerformanceData])

  // Salary insights data
  const salaryInsights = useMemo(() => {
    const BRACKETS = [
      { label: '£0-20k', min: 0, max: 20000 },
      { label: '£20-30k', min: 20000, max: 30000 },
      { label: '£30-40k', min: 30000, max: 40000 },
      { label: '£40-50k', min: 40000, max: 50000 },
      { label: '£50-75k', min: 50000, max: 75000 },
      { label: '£75-100k', min: 75000, max: 100000 },
      { label: '£100k+', min: 100000, max: Infinity },
    ]

    const getAnnualSalary = (job: any): number | null => {
      const salMin = parseFloat(job.salary_min)
      if (isNaN(salMin) || salMin <= 0) return null
      const salMax = parseFloat(job.salary_max || job.salary_min)
      const mid = (salMin + salMax) / 2
      const type = job.salary_type || job.salary_period || 'annual'
      if (type === 'hourly' || type === 'hour') return mid * 2080
      return mid
    }

    const getBracket = (annual: number) => {
      return BRACKETS.find(b => annual >= b.min && annual < b.max) || BRACKETS[BRACKETS.length - 1]
    }

    // Map each job to a bracket
    const jobBrackets: { job: any; bracket: string; annual: number }[] = []
    jobs.forEach((job: any) => {
      const annual = getAnnualSalary(job)
      if (annual === null) return
      const bracket = getBracket(annual)
      jobBrackets.push({ job, bracket: bracket.label, annual })
    })

    if (jobBrackets.length === 0) return null

    // Group by bracket
    const bracketData = BRACKETS.map(b => {
      const bracketJobs = jobBrackets.filter(jb => jb.bracket === b.label)
      const jobIds = bracketJobs.map(jb => jb.job.id)
      const views = jobViews.filter(v => jobIds.includes(v.job_id)).length
      const apps = applications.filter(a => jobIds.includes(a.job_id)).length
      const ctr = views > 0 ? (apps / views) * 100 : 0
      return { name: b.label, views, applications: apps, ctr, jobCount: bracketJobs.length }
    }).filter(b => b.jobCount > 0)

    // Most popular (highest views)
    const mostPopular = bracketData.length > 0
      ? bracketData.reduce((best, b) => b.views > best.views ? b : best, bracketData[0])
      : null

    // Best converting (highest CTR, with at least 1 view)
    const withViews = bracketData.filter(b => b.views > 0)
    const bestConverting = withViews.length > 0
      ? withViews.reduce((best, b) => b.ctr > best.ctr ? b : best, withViews[0])
      : null

    // Per-job salary table data (sorted by CTR desc)
    const jobTable = jobBrackets.map(({ job, bracket, annual }) => {
      const views = job.view_count || 0
      const apps = applications.filter((a: any) => a.job_id === job.id).length
      const ctr = views > 0 ? ((apps / views) * 100).toFixed(1) : '0.0'
      const salMin = parseFloat(job.salary_min)
      const salMax = parseFloat(job.salary_max || job.salary_min)
      const type = job.salary_type || job.salary_period || 'annual'
      const isHourly = type === 'hourly' || type === 'hour'
      const salaryRange = isHourly
        ? `£${salMin.toFixed(0)}-£${salMax.toFixed(0)}/hr`
        : `£${(salMin / 1000).toFixed(0)}k-£${(salMax / 1000).toFixed(0)}k`
      return { id: job.id, title: job.title, salaryRange, bracket, views, apps, ctr: parseFloat(ctr) }
    }).sort((a, b) => b.ctr - a.ctr)

    return { bracketData, mostPopular, bestConverting, jobTable }
  }, [jobs, applications, jobViews])

  // Candidate demographics data
  const demographics = useMemo(() => {
    if (candidateProfiles.length === 0) return null

    // --- UK Region mapping ---
    const REGION_MAP: Record<string, string> = {
      // London
      london: 'London', 'city of london': 'London', westminster: 'London', camden: 'London',
      islington: 'London', hackney: 'London', 'tower hamlets': 'London', greenwich: 'London',
      lewisham: 'London', southwark: 'London', lambeth: 'London', wandsworth: 'London',
      hammersmith: 'London', kensington: 'London', chelsea: 'London', fulham: 'London',
      brent: 'London', ealing: 'London', hounslow: 'London', richmond: 'London',
      kingston: 'London', merton: 'London', sutton: 'London', croydon: 'London',
      bromley: 'London', bexley: 'London', havering: 'London', barking: 'London',
      redbridge: 'London', newham: 'London', 'waltham forest': 'London', haringey: 'London',
      enfield: 'London', barnet: 'London', harrow: 'London', hillingdon: 'London',
      // South East
      surrey: 'South East', kent: 'South East', sussex: 'South East', hampshire: 'South East',
      berkshire: 'South East', oxfordshire: 'South East', buckinghamshire: 'South East',
      brighton: 'South East', reading: 'South East', oxford: 'South East', canterbury: 'South East',
      guildford: 'South East', portsmouth: 'South East', southampton: 'South East',
      'milton keynes': 'South East', slough: 'South East', 'isle of wight': 'South East',
      // South West
      bristol: 'South West', bath: 'South West', devon: 'South West', cornwall: 'South West',
      somerset: 'South West', dorset: 'South West', wiltshire: 'South West', gloucester: 'South West',
      gloucestershire: 'South West', exeter: 'South West', plymouth: 'South West',
      bournemouth: 'South West', swindon: 'South West', cheltenham: 'South West',
      // Midlands
      birmingham: 'Midlands', coventry: 'Midlands', leicester: 'Midlands', nottingham: 'Midlands',
      derby: 'Midlands', stoke: 'Midlands', wolverhampton: 'Midlands', worcester: 'Midlands',
      'west midlands': 'Midlands', 'east midlands': 'Midlands', warwickshire: 'Midlands',
      staffordshire: 'Midlands', shropshire: 'Midlands', herefordshire: 'Midlands',
      northamptonshire: 'Midlands', leicestershire: 'Midlands', nottinghamshire: 'Midlands',
      derbyshire: 'Midlands', lincolnshire: 'Midlands', rutland: 'Midlands',
      // North West
      manchester: 'North West', liverpool: 'North West', chester: 'North West',
      preston: 'North West', blackpool: 'North West', bolton: 'North West',
      wigan: 'North West', warrington: 'North West', cheshire: 'North West',
      lancashire: 'North West', cumbria: 'North West', merseyside: 'North West',
      'greater manchester': 'North West', carlisle: 'North West',
      // North East
      newcastle: 'North East', sunderland: 'North East', durham: 'North East',
      middlesbrough: 'North East', darlington: 'North East', hartlepool: 'North East',
      'tyne and wear': 'North East', northumberland: 'North East',
      // Yorkshire
      leeds: 'Yorkshire', sheffield: 'Yorkshire', bradford: 'Yorkshire', york: 'Yorkshire',
      hull: 'Yorkshire', doncaster: 'Yorkshire', wakefield: 'Yorkshire', barnsley: 'Yorkshire',
      huddersfield: 'Yorkshire', halifax: 'Yorkshire', harrogate: 'Yorkshire',
      'south yorkshire': 'Yorkshire', 'west yorkshire': 'Yorkshire', 'north yorkshire': 'Yorkshire',
      'east yorkshire': 'Yorkshire', 'east riding': 'Yorkshire',
      // East Anglia
      norwich: 'East Anglia', cambridge: 'East Anglia', ipswich: 'East Anglia',
      norfolk: 'East Anglia', suffolk: 'East Anglia', cambridgeshire: 'East Anglia',
      essex: 'East Anglia', hertfordshire: 'East Anglia', bedfordshire: 'East Anglia',
      peterborough: 'East Anglia', colchester: 'East Anglia', luton: 'East Anglia',
      // Scotland
      edinburgh: 'Scotland', glasgow: 'Scotland', aberdeen: 'Scotland', dundee: 'Scotland',
      inverness: 'Scotland', stirling: 'Scotland', perth: 'Scotland', scotland: 'Scotland',
      'scottish highlands': 'Scotland', fife: 'Scotland',
      // Wales
      cardiff: 'Wales', swansea: 'Wales', newport: 'Wales', bangor: 'Wales',
      wales: 'Wales', wrexham: 'Wales', carmarthen: 'Wales',
      // Northern Ireland
      belfast: 'Northern Ireland', derry: 'Northern Ireland', lisburn: 'Northern Ireland',
      'northern ireland': 'Northern Ireland',
    }

    const getRegion = (profile: any): string | null => {
      const text = [profile.city, profile.county, profile.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      for (const [key, region] of Object.entries(REGION_MAP)) {
        if (text.includes(key)) return region
      }
      return null
    }

    // Region counts
    const regionCounts: Record<string, number> = {}
    candidateProfiles.forEach(p => {
      const region = getRegion(p)
      if (region) regionCounts[region] = (regionCounts[region] || 0) + 1
    })
    const regionData = Object.entries(regionCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    // --- Experience level breakdown ---
    const EXP_LEVELS = [
      { label: 'Entry Level', min: 0, max: 1 },
      { label: 'Junior (1-2 yrs)', min: 1, max: 3 },
      { label: 'Mid-Level (3-5 yrs)', min: 3, max: 6 },
      { label: 'Senior (5-10 yrs)', min: 5, max: 11 },
      { label: 'Lead/Manager (10+)', min: 10, max: Infinity },
    ]

    // Use non-overlapping ranges for bucketing
    const getExpLevel = (years: number): string => {
      if (years < 1) return 'Entry Level'
      if (years < 3) return 'Junior (1-2 yrs)'
      if (years < 6) return 'Mid-Level (3-5 yrs)'
      if (years < 11) return 'Senior (5-10 yrs)'
      return 'Lead/Manager (10+)'
    }

    const expCounts: Record<string, number> = {}
    let hasExpData = false
    candidateProfiles.forEach(p => {
      const years = p.years_experience
      if (years !== null && years !== undefined) {
        hasExpData = true
        const level = getExpLevel(years)
        expCounts[level] = (expCounts[level] || 0) + 1
      }
    })

    const expColors = ['#3b82f6', '#FFD700', '#16a34a', '#8b5cf6', '#f59e0b']
    const experienceData = hasExpData
      ? EXP_LEVELS.map((lvl, i) => ({
          name: lvl.label,
          value: expCounts[lvl.label] || 0,
          fill: expColors[i],
        })).filter(d => d.value > 0)
      : []

    // --- Top skills ---
    const skillCounts: Record<string, number> = {}
    candidateProfiles.forEach(p => {
      const skills = p.skills
      if (Array.isArray(skills)) {
        skills.forEach((s: string) => {
          const normalized = s.trim()
          if (normalized) skillCounts[normalized] = (skillCounts[normalized] || 0) + 1
        })
      }
    })
    const topSkills = Object.entries(skillCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    // --- Profile completeness ---
    let complete = 0
    candidateProfiles.forEach(p => {
      const hasCv = !!p.cv_url
      const hasPhoto = !!p.profile_picture_url
      const hasSkills = Array.isArray(p.skills) && p.skills.length > 0
      const hasWorkHistory = Array.isArray(p.work_history) ? p.work_history.length > 0
        : (typeof p.work_history === 'string' ? p.work_history !== '[]' && p.work_history !== '' : !!p.work_history)
      if (hasCv && hasPhoto && hasSkills && hasWorkHistory) complete++
    })
    const completenessPercent = candidateProfiles.length > 0
      ? Math.round((complete / candidateProfiles.length) * 100)
      : 0

    // --- Age distribution ---
    const AGE_BRACKETS = [
      { label: '18-24', min: 18, max: 24 },
      { label: '25-34', min: 25, max: 34 },
      { label: '35-44', min: 35, max: 44 },
      { label: '45-54', min: 45, max: 54 },
      { label: '55-64', min: 55, max: 64 },
      { label: '65+', min: 65, max: 200 },
    ]

    const now = new Date()
    let ageProvidedCount = 0
    const ageCounts: Record<string, number> = {}
    candidateProfiles.forEach(p => {
      if (!p.date_of_birth) return
      const dob = new Date(p.date_of_birth)
      if (isNaN(dob.getTime())) return
      ageProvidedCount++
      let age = now.getFullYear() - dob.getFullYear()
      const m = now.getMonth() - dob.getMonth()
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
      const bracket = AGE_BRACKETS.find(b => age >= b.min && age <= b.max)
      if (bracket) ageCounts[bracket.label] = (ageCounts[bracket.label] || 0) + 1
    })
    const ageData = AGE_BRACKETS.map(b => ({
      name: b.label,
      value: ageCounts[b.label] || 0,
    })).filter(d => d.value > 0)

    // --- Nationality breakdown ---
    let nationalityProvidedCount = 0
    const natCounts: Record<string, number> = {}
    candidateProfiles.forEach(p => {
      if (!p.nationality) return
      const nat = p.nationality.trim()
      if (!nat) return
      nationalityProvidedCount++
      natCounts[nat] = (natCounts[nat] || 0) + 1
    })
    const nationalityData = Object.entries(natCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    return {
      regionData,
      experienceData,
      topSkills,
      completenessPercent,
      totalApplicants: candidateProfiles.length,
      completeProfiles: complete,
      ageData,
      ageProvidedCount,
      nationalityData,
      nationalityProvidedCount,
    }
  }, [candidateProfiles])

  // Best Time to Post analysis
  const bestTimeToPost = useMemo(() => {
    const MIN_VIEWS = 50
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const HOURS_START = 6
    const HOURS_END = 23 // 6am to 11pm

    // Build heatmap grid: day (0=Mon..6=Sun) × hour (6..22)
    const heatmap: number[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: HOURS_END - HOURS_START }, () => 0)
    )

    // Applications by day of week
    const appsByDay: number[] = Array(7).fill(0)

    // Populate heatmap from job views
    jobViews.forEach((v: any) => {
      const d = new Date(v.viewed_at)
      if (isNaN(d.getTime())) return
      const jsDay = d.getDay() // 0=Sun, 1=Mon...6=Sat
      const dayIdx = jsDay === 0 ? 6 : jsDay - 1 // convert to 0=Mon..6=Sun
      const hour = d.getHours()
      if (hour >= HOURS_START && hour < HOURS_END) {
        heatmap[dayIdx][hour - HOURS_START]++
      }
    })

    // Populate applications by day
    applications.forEach((a: any) => {
      const d = new Date(a.applied_at)
      if (isNaN(d.getTime())) return
      const jsDay = d.getDay()
      const dayIdx = jsDay === 0 ? 6 : jsDay - 1
      appsByDay[dayIdx]++
    })

    const totalViews = jobViews.length

    if (totalViews < MIN_VIEWS) {
      return { hasEnoughData: false, totalViews, minViews: MIN_VIEWS } as const
    }

    // Find max value for color scaling
    let maxCell = 0
    heatmap.forEach(row => row.forEach(v => { if (v > maxCell) maxCell = v }))

    // Build heatmap data for rendering
    const heatmapData = DAYS.map((day, dayIdx) => ({
      day,
      cells: heatmap[dayIdx].map((count, hourIdx) => ({
        hour: HOURS_START + hourIdx,
        count,
        intensity: maxCell > 0 ? count / maxCell : 0,
      })),
    }))

    // Find top 3 peak hours
    const allSlots: { dayIdx: number; hour: number; count: number }[] = []
    heatmap.forEach((row, dayIdx) => {
      row.forEach((count, hourIdx) => {
        allSlots.push({ dayIdx, hour: HOURS_START + hourIdx, count })
      })
    })
    allSlots.sort((a, b) => b.count - a.count)

    const peakHours = allSlots.slice(0, 3).map(slot => {
      const h = slot.hour
      const nextH = h + 1
      const fmt = (hr: number) => {
        if (hr === 0 || hr === 24) return '12am'
        if (hr === 12) return '12pm'
        return hr > 12 ? `${hr - 12}pm` : `${hr}am`
      }
      return {
        label: `${DAY_FULL[slot.dayIdx]} ${fmt(h)}-${fmt(nextH)}`,
        count: slot.count,
      }
    })

    // Best day overall
    const viewsByDay = Array(7).fill(0)
    heatmap.forEach((row, dayIdx) => {
      viewsByDay[dayIdx] = row.reduce((sum, v) => sum + v, 0)
    })
    const bestDayIdx = viewsByDay.indexOf(Math.max(...viewsByDay))

    // Applications by day chart data
    const appsByDayData = DAYS.map((day, i) => ({ day, applications: appsByDay[i] }))

    return {
      hasEnoughData: true,
      totalViews,
      heatmapData,
      maxCell,
      peakHours,
      bestDay: DAY_FULL[bestDayIdx],
      bestDayViews: viewsByDay[bestDayIdx],
      appsByDayData,
      hoursStart: HOURS_START,
      hoursEnd: HOURS_END,
    } as const
  }, [jobViews, applications])

  // Market Benchmarking
  const marketBenchmark = useMemo(() => {
    if (jobs.length === 0) return null

    const MIN_SECTOR_JOBS = 5

    const getAnnualSalary = (job: any): number | null => {
      const salMin = parseFloat(job.salary_min)
      if (isNaN(salMin) || salMin <= 0) return null
      const salMax = parseFloat(job.salary_max || job.salary_min)
      const mid = (salMin + salMax) / 2
      const type = job.salary_type || job.salary_period || 'annual'
      if (type === 'hourly' || type === 'hour') return mid * 2080
      return mid
    }

    // Get the employer's ID from the first job
    const employerId = jobs[0]?.employer_id

    // Other employers' jobs by sector
    const otherJobs = platformJobs.filter((j: any) => j.employer_id !== employerId)

    // Group other jobs by category
    const otherBySector: Record<string, any[]> = {}
    otherJobs.forEach((j: any) => {
      const cat = j.category || 'uncategorised'
      if (!otherBySector[cat]) otherBySector[cat] = []
      otherBySector[cat].push(j)
    })

    // Check which of employer's sectors have enough platform data
    const employerSectors = Array.from(new Set(jobs.map((j: any) => j.category || 'uncategorised')))
    const hasSufficientData = employerSectors.some(s => (otherBySector[s] || []).length >= MIN_SECTOR_JOBS)

    if (!hasSufficientData) {
      const maxSectorCount = employerSectors.reduce((max, s) => Math.max(max, (otherBySector[s] || []).length), 0)
      return { hasEnoughData: false, minRequired: MIN_SECTOR_JOBS, currentMax: maxSectorCount } as const
    }

    // Platform averages by sector
    const sectorAverages: Record<string, { avgSalary: number; avgViews: number; avgApps: number; avgConversion: number; avgTimeToFirstApp: number | null; jobCount: number }> = {}

    Object.entries(otherBySector).forEach(([sector, sectorJobs]) => {
      if (sectorJobs.length < MIN_SECTOR_JOBS) return

      const salaries = sectorJobs.map(getAnnualSalary).filter((s): s is number => s !== null)
      const avgSalary = salaries.length > 0 ? salaries.reduce((a, b) => a + b, 0) / salaries.length : 0

      let totalViews = 0
      let totalApps = 0
      const sectorJobIds = sectorJobs.map((j: any) => j.id)

      // Use view_count/application_count from job records + supplement with platform views/apps
      sectorJobs.forEach((j: any) => {
        totalViews += j.view_count || 0
        totalApps += j.application_count || 0
      })

      // Also count from platformViews/platformApps for more accurate data
      const viewsFromTable = platformViews.filter((v: any) => sectorJobIds.includes(v.job_id)).length
      const appsFromTable = platformApps.filter((a: any) => sectorJobIds.includes(a.job_id)).length

      // Use whichever is higher (view_count field or actual views table)
      const effectiveViews = Math.max(totalViews, viewsFromTable)
      const effectiveApps = Math.max(totalApps, appsFromTable)

      const avgViews = effectiveViews / sectorJobs.length
      const avgApps = effectiveApps / sectorJobs.length
      const avgConversion = effectiveViews > 0 ? (effectiveApps / effectiveViews) * 100 : 0

      // Time to first application (for platform jobs)
      const timesToFirstApp: number[] = []
      sectorJobs.forEach((j: any) => {
        if (!j.posted_at) return
        const firstApp = platformApps
          .filter((a: any) => a.job_id === j.id)
          .sort((a: any, b: any) => new Date(a.applied_at).getTime() - new Date(b.applied_at).getTime())[0]
        if (firstApp) {
          const diff = new Date(firstApp.applied_at).getTime() - new Date(j.posted_at).getTime()
          if (diff > 0) timesToFirstApp.push(diff)
        }
      })
      const avgTimeToFirstApp = timesToFirstApp.length > 0
        ? timesToFirstApp.reduce((a, b) => a + b, 0) / timesToFirstApp.length
        : null

      sectorAverages[sector] = { avgSalary, avgViews, avgApps, avgConversion, avgTimeToFirstApp, jobCount: sectorJobs.length }
    })

    // Per-job comparison table
    const jobComparisons = jobs.map((job: any) => {
      const sector = job.category || 'uncategorised'
      const avg = sectorAverages[sector]
      const hasSectorData = !!avg && avg.jobCount >= MIN_SECTOR_JOBS

      const myViews = jobViews.filter((v: any) => v.job_id === job.id).length || (job.view_count || 0)
      const myApps = applications.filter((a: any) => a.job_id === job.id).length
      const mySalary = getAnnualSalary(job)
      const myConversion = myViews > 0 ? (myApps / myViews) * 100 : 0

      // Time to first app for this job
      let myTimeToFirstApp: number | null = null
      if (job.posted_at) {
        const firstApp = applications
          .filter((a: any) => a.job_id === job.id)
          .sort((a: any, b: any) => new Date(a.applied_at).getTime() - new Date(b.applied_at).getTime())[0]
        if (firstApp) {
          const diff = new Date(firstApp.applied_at).getTime() - new Date(job.posted_at).getTime()
          if (diff > 0) myTimeToFirstApp = diff
        }
      }

      // Salary competitiveness
      let salaryBadge: 'below' | 'at' | 'above' = 'at'
      if (hasSectorData && mySalary !== null && avg.avgSalary > 0) {
        const ratio = mySalary / avg.avgSalary
        if (ratio < 0.9) salaryBadge = 'below'
        else if (ratio > 1.1) salaryBadge = 'above'
      }

      // Format salary range
      const salMin = parseFloat(job.salary_min)
      const salMax = parseFloat(job.salary_max || job.salary_min)
      const type = job.salary_type || job.salary_period || 'annual'
      const isHourly = type === 'hourly' || type === 'hour'
      const salaryDisplay = !isNaN(salMin) && salMin > 0
        ? (isHourly ? `£${salMin.toFixed(0)}-£${salMax.toFixed(0)}/hr` : `£${(salMin / 1000).toFixed(0)}k-£${(salMax / 1000).toFixed(0)}k`)
        : 'Not set'

      return {
        id: job.id,
        title: job.title,
        sector: getCategoryLabel(sector),
        sectorKey: sector,
        hasSectorData,
        mySalary,
        mySalaryDisplay: salaryDisplay,
        avgSalary: avg?.avgSalary || 0,
        myViews,
        avgViews: avg?.avgViews || 0,
        myApps,
        avgApps: avg?.avgApps || 0,
        myConversion,
        avgConversion: avg?.avgConversion || 0,
        salaryBadge,
        myTimeToFirstApp,
        avgTimeToFirstApp: avg?.avgTimeToFirstApp || null,
      }
    })

    // Employer-wide averages for the grouped bar chart
    const myJobsWithSalary = jobs.map(getAnnualSalary).filter((s): s is number => s !== null)
    const myAvgSalary = myJobsWithSalary.length > 0 ? myJobsWithSalary.reduce((a, b) => a + b, 0) / myJobsWithSalary.length : 0

    const totalMyViews = jobs.reduce((sum, j: any) => {
      const v = jobViews.filter((v: any) => v.job_id === j.id).length
      return sum + (v || j.view_count || 0)
    }, 0)
    const myAvgViews = jobs.length > 0 ? totalMyViews / jobs.length : 0

    const totalMyApps = applications.length
    const myAvgApps = jobs.length > 0 ? totalMyApps / jobs.length : 0

    const myAvgConversion = totalMyViews > 0 ? (totalMyApps / totalMyViews) * 100 : 0

    // Calculate platform-wide averages across all sectors that have enough data
    const allSectorAvgs = Object.values(sectorAverages)
    const platAvgSalary = allSectorAvgs.length > 0 ? allSectorAvgs.reduce((s, a) => s + a.avgSalary, 0) / allSectorAvgs.length : 0
    const platAvgViews = allSectorAvgs.length > 0 ? allSectorAvgs.reduce((s, a) => s + a.avgViews, 0) / allSectorAvgs.length : 0
    const platAvgApps = allSectorAvgs.length > 0 ? allSectorAvgs.reduce((s, a) => s + a.avgApps, 0) / allSectorAvgs.length : 0
    const platAvgConversion = allSectorAvgs.length > 0 ? allSectorAvgs.reduce((s, a) => s + a.avgConversion, 0) / allSectorAvgs.length : 0

    const comparisonChart = [
      { metric: 'Avg Salary (£k)', yours: Math.round(myAvgSalary / 1000), platform: Math.round(platAvgSalary / 1000) },
      { metric: 'Avg Views', yours: Math.round(myAvgViews), platform: Math.round(platAvgViews) },
      { metric: 'Avg Applications', yours: Math.round(myAvgApps * 10) / 10, platform: Math.round(platAvgApps * 10) / 10 },
      { metric: 'Conversion Rate %', yours: Math.round(myAvgConversion * 10) / 10, platform: Math.round(platAvgConversion * 10) / 10 },
    ]

    // Time to fill comparison
    const myTimesToFirst: number[] = []
    jobs.forEach((j: any) => {
      if (!j.posted_at) return
      const firstApp = applications
        .filter((a: any) => a.job_id === j.id)
        .sort((a: any, b: any) => new Date(a.applied_at).getTime() - new Date(b.applied_at).getTime())[0]
      if (firstApp) {
        const diff = new Date(firstApp.applied_at).getTime() - new Date(j.posted_at).getTime()
        if (diff > 0) myTimesToFirst.push(diff)
      }
    })
    const myAvgTimeToFirst = myTimesToFirst.length > 0
      ? myTimesToFirst.reduce((a, b) => a + b, 0) / myTimesToFirst.length
      : null

    const platTimesToFirst = allSectorAvgs.map(a => a.avgTimeToFirstApp).filter((t): t is number => t !== null)
    const platAvgTimeToFirst = platTimesToFirst.length > 0
      ? platTimesToFirst.reduce((a, b) => a + b, 0) / platTimesToFirst.length
      : null

    return {
      hasEnoughData: true,
      jobComparisons,
      comparisonChart,
      myAvgTimeToFirst,
      platAvgTimeToFirst,
    } as const
  }, [jobs, applications, jobViews, platformJobs, platformApps, platformViews])

  // Application Quality Score
  const applicationQuality = useMemo(() => {
    if (applications.length === 0 || candidateProfiles.length === 0) return null

    // Build a profile lookup
    const profileMap = new Map<string, any>()
    candidateProfiles.forEach(p => profileMap.set(p.user_id, p))

    // Parse experience requirement from job's free text into a numeric range
    const parseExpRange = (text: string | null | undefined): { min: number; max: number } | null => {
      if (!text) return null
      const t = text.toLowerCase()
      // patterns like "3+ years", "3-5 years", "at least 2 years", "minimum 1 year"
      const plusMatch = t.match(/(\d+)\s*\+?\s*year/)
      const rangeMatch = t.match(/(\d+)\s*[-–to]+\s*(\d+)\s*year/)
      if (rangeMatch) return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) }
      if (plusMatch) return { min: parseInt(plusMatch[1]), max: parseInt(plusMatch[1]) + 5 }
      if (t.includes('entry') || t.includes('no experience') || t.includes('none')) return { min: 0, max: 1 }
      if (t.includes('junior')) return { min: 0, max: 2 }
      if (t.includes('mid')) return { min: 2, max: 5 }
      if (t.includes('senior')) return { min: 5, max: 10 }
      return null
    }

    // Location match: simple check if candidate location contains the job's city/location
    const scoreLocation = (profile: any, job: any): number => {
      const candLoc = [profile.city, profile.county, profile.location].filter(Boolean).join(' ').toLowerCase()
      if (!candLoc) return 0.3 // no data — neutral-low

      const jobLoc = (job.location || '').toLowerCase()
      const jobArea = (job.area || '').toLowerCase()

      // Exact city match
      if (jobLoc && candLoc.includes(jobLoc)) return 1.0
      if (jobArea && candLoc.includes(jobArea)) return 0.8

      // Check if any word from jobLoc appears in candidate location (partial match)
      const jobWords = jobLoc.split(/[\s,]+/).filter((w: string) => w.length > 3)
      if (jobWords.some((w: string) => candLoc.includes(w))) return 0.6

      return 0.2 // no match
    }

    // Skills match: percentage of job's required skills found in candidate's skills
    const scoreSkills = (profile: any, job: any): number => {
      const jobSkills: string[] = Array.isArray(job.skills_required) ? job.skills_required : []
      if (jobSkills.length === 0) return 0.5 // no requirements — neutral

      const candSkills: string[] = Array.isArray(profile.skills) ? profile.skills.map((s: string) => s.toLowerCase().trim()) : []
      if (candSkills.length === 0) return 0.1 // candidate has no skills listed

      let matched = 0
      jobSkills.forEach((js: string) => {
        const jsLower = js.toLowerCase().trim()
        if (candSkills.some((cs: string) => cs.includes(jsLower) || jsLower.includes(cs))) {
          matched++
        }
      })
      return matched / jobSkills.length
    }

    // Experience match: how well candidate's years match the requirement
    const scoreExperience = (profile: any, job: any): number => {
      const candYears = profile.years_experience
      if (candYears === null || candYears === undefined) return 0.3 // no data

      const expRange = parseExpRange(job.experience_required)
      if (!expRange) return 0.5 // job has no requirement — neutral

      if (candYears >= expRange.min && candYears <= expRange.max) return 1.0
      if (candYears >= expRange.min - 1 && candYears <= expRange.max + 2) return 0.7
      if (candYears > expRange.max) return 0.5 // overqualified
      return 0.2 // underqualified
    }

    // Sector match
    const scoreSector = (profile: any, job: any): number => {
      const candSector = (profile.job_sector || '').toLowerCase().trim()
      const jobCategory = (job.category || '').toLowerCase().trim()
      if (!candSector || !jobCategory) return 0.3 // no data
      if (candSector === jobCategory) return 1.0
      if (candSector.includes(jobCategory) || jobCategory.includes(candSector)) return 0.7
      return 0.1
    }

    // Score each application
    const scoredApps: {
      applicationId: string
      jobId: string
      candidateId: string
      candidateName: string
      jobTitle: string
      locationScore: number
      skillsScore: number
      experienceScore: number
      sectorScore: number
      overallScore: number
    }[] = []

    applications.forEach((app: any) => {
      const profile = profileMap.get(app.candidate_id)
      if (!profile) return
      const job = jobs.find((j: any) => j.id === app.job_id)
      if (!job) return

      const locationScore = scoreLocation(profile, job)
      const skillsScore = scoreSkills(profile, job)
      const experienceScore = scoreExperience(profile, job)
      const sectorScore = scoreSector(profile, job)

      // Weighted average: skills 40%, experience 30%, location 20%, sector 10%
      const overallScore = skillsScore * 0.4 + experienceScore * 0.3 + locationScore * 0.2 + sectorScore * 0.1

      scoredApps.push({
        applicationId: app.id,
        jobId: app.job_id,
        candidateId: app.candidate_id,
        candidateName: profile.full_name || 'Unknown',
        jobTitle: job.title,
        locationScore,
        skillsScore,
        experienceScore,
        sectorScore,
        overallScore,
      })
    })

    if (scoredApps.length === 0) return null

    // Overall average
    const avgScore = scoredApps.reduce((sum, a) => sum + a.overallScore, 0) / scoredApps.length
    const avgPercent = Math.round(avgScore * 100)

    // Per-job averages
    const jobScores = jobs.map((job: any) => {
      const jobApps = scoredApps.filter(a => a.jobId === job.id)
      if (jobApps.length === 0) return null
      const avg = jobApps.reduce((sum, a) => sum + a.overallScore, 0) / jobApps.length
      return {
        id: job.id,
        title: job.title,
        avgPercent: Math.round(avg * 100),
        applicantCount: jobApps.length,
      }
    }).filter(Boolean).sort((a: any, b: any) => b.avgPercent - a.avgPercent)

    // Top 3 highest-quality applicants
    const topApplicants = [...scoredApps]
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 3)
      .map(a => ({
        name: a.candidateName,
        matchPercent: Math.round(a.overallScore * 100),
        jobTitle: a.jobTitle,
        skills: Math.round(a.skillsScore * 100),
        experience: Math.round(a.experienceScore * 100),
        location: Math.round(a.locationScore * 100),
        sector: Math.round(a.sectorScore * 100),
      }))

    return {
      avgPercent,
      totalScored: scoredApps.length,
      jobScores,
      topApplicants,
    }
  }, [applications, candidateProfiles, jobs])

  // Cost Per Hire
  const costPerHire = useMemo(() => {
    const MONTHLY_COST = 29.99

    if (!employerCreatedAt) return null

    const createdDate = new Date(employerCreatedAt)
    const now = new Date()

    // Calculate total months subscribed (minimum 1)
    const diffMs = now.getTime() - createdDate.getTime()
    const totalMonths = Math.max(1, Math.ceil(diffMs / (30.44 * 86400000))) // avg days per month
    const totalCost = totalMonths * MONTHLY_COST

    // Total hires
    const hiredApps = applications.filter((a: any) => ['hired', 'retained', 'left'].includes(a.status))
    const totalHires = hiredApps.length
    const cph = totalHires > 0 ? totalCost / totalHires : null

    // Build cumulative chart data: month by month from creation to now
    const chartData: { month: string; cost: number; hires: number }[] = []
    const startYear = createdDate.getFullYear()
    const startMonth = createdDate.getMonth()
    let cumulativeCost = 0
    let cumulativeHires = 0

    const iter = new Date(startYear, startMonth, 1)
    while (iter <= now) {
      const y = iter.getFullYear()
      const m = iter.getMonth()
      cumulativeCost += MONTHLY_COST

      // Count hires made in this month
      const hiresThisMonth = hiredApps.filter((a: any) => {
        const hiredDate = new Date(a.status_updated_at || a.applied_at)
        return hiredDate.getFullYear() === y && hiredDate.getMonth() === m
      }).length
      cumulativeHires += hiresThisMonth

      const monthLabel = iter.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      chartData.push({
        month: monthLabel,
        cost: Math.round(cumulativeCost * 100) / 100,
        hires: cumulativeHires,
      })

      iter.setMonth(iter.getMonth() + 1)
    }

    return {
      totalMonths,
      totalCost,
      totalHires,
      costPerHire: cph,
      chartData,
      memberSince: createdDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    }
  }, [applications, employerCreatedAt])

  // Job Description Performance
  const descriptionPerformance = useMemo(() => {
    if (jobs.length < 2) return null

    const STOP_WORDS = new Set([
      'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are',
      'was','were','be','been','being','have','has','had','do','does','did','will','would','shall',
      'should','may','might','can','could','not','no','nor','so','if','then','than','that','this',
      'these','those','it','its','we','you','they','he','she','i','me','my','our','your','their',
      'his','her','us','them','who','what','which','when','where','how','all','each','every','both',
      'few','more','most','other','some','such','any','only','very','also','just','about','over',
      'after','before','between','under','again','further','once','here','there','up','down','out',
      'off','into','through','during','above','below','own','same','as','until','while','per','via',
    ])

    // Get full text from each job
    const getDescriptionText = (job: any): string => {
      return [job.full_description, job.description].filter(Boolean).join(' ')
    }

    const countWords = (text: string): number => {
      return text.split(/\s+/).filter(w => w.length > 0).length
    }

    const avgWordLength = (text: string): number => {
      const words = text.split(/\s+/).filter(w => w.length > 0)
      if (words.length === 0) return 0
      return words.reduce((sum, w) => sum + w.replace(/[^a-zA-Z]/g, '').length, 0) / words.length
    }

    // Per-job data
    const jobData = jobs.map((job: any) => {
      const text = getDescriptionText(job)
      const wordCount = countWords(text)
      const avgWL = avgWordLength(text)
      const readability = avgWL < 4.5 ? 'Simple' : avgWL < 6 ? 'Moderate' : 'Complex'
      const views = jobViews.filter((v: any) => v.job_id === job.id).length || (job.view_count || 0)
      const apps = applications.filter((a: any) => a.job_id === job.id).length
      const lengthGroup = wordCount < 200 ? 'Short' : wordCount <= 500 ? 'Medium' : 'Long'

      return {
        id: job.id,
        title: job.title,
        wordCount,
        readability,
        views,
        apps,
        lengthGroup,
        text,
      }
    })

    // Group by description length
    const groups: Record<string, { views: number[]; apps: number[] }> = {
      'Short (<200)': { views: [], apps: [] },
      'Medium (200-500)': { views: [], apps: [] },
      'Long (500+)': { views: [], apps: [] },
    }
    const groupKeyMap: Record<string, string> = {
      Short: 'Short (<200)',
      Medium: 'Medium (200-500)',
      Long: 'Long (500+)',
    }

    jobData.forEach(j => {
      const gk = groupKeyMap[j.lengthGroup]
      groups[gk].views.push(j.views)
      groups[gk].apps.push(j.apps)
    })

    const lengthChartData = Object.entries(groups)
      .filter(([, g]) => g.views.length > 0)
      .map(([name, g]) => ({
        name,
        avgViews: Math.round(g.views.reduce((a, b) => a + b, 0) / g.views.length),
        avgApps: Math.round(g.apps.reduce((a, b) => a + b, 0) / g.apps.length * 10) / 10,
        jobCount: g.views.length,
      }))

    // Best performing length group
    const bestGroup = lengthChartData.length > 0
      ? lengthChartData.reduce((best, g) => g.avgApps > best.avgApps ? g : best, lengthChartData[0])
      : null

    // Keyword analysis: extract meaningful words, count frequency, correlate with app rate
    const wordFreq: Record<string, { count: number; totalApps: number; totalViews: number; jobCount: number }> = {}

    jobData.forEach(j => {
      const words = j.text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/)
      const uniqueWords = new Set(words.filter(w => w.length > 3 && !STOP_WORDS.has(w)))

      uniqueWords.forEach(word => {
        if (!wordFreq[word]) wordFreq[word] = { count: 0, totalApps: 0, totalViews: 0, jobCount: 0 }
        wordFreq[word].count++
        wordFreq[word].totalApps += j.apps
        wordFreq[word].totalViews += j.views
        wordFreq[word].jobCount++
      })
    })

    // Only consider words that appear in at least 2 jobs (to avoid noise)
    const avgAppRate = jobData.length > 0
      ? jobData.reduce((sum, j) => sum + j.apps, 0) / jobData.length
      : 0

    const keywords = Object.entries(wordFreq)
      .filter(([, data]) => data.jobCount >= 2)
      .map(([word, data]) => {
        const avgAppsWithWord = data.totalApps / data.jobCount
        const correlation = avgAppRate > 0 ? (avgAppsWithWord - avgAppRate) / avgAppRate : 0
        return {
          word,
          count: data.count,
          avgApps: Math.round(avgAppsWithWord * 10) / 10,
          correlation, // positive = above average, negative = below
          sentiment: correlation > 0.15 ? 'positive' as const : correlation < -0.15 ? 'negative' as const : 'neutral' as const,
        }
      })
      .sort((a, b) => b.correlation - a.correlation)
      .slice(0, 10)

    // Generate tip
    let tip = ''
    if (bestGroup && lengthChartData.length > 1) {
      const wordRange = bestGroup.name === 'Short (<200)' ? 'under 200 words'
        : bestGroup.name === 'Medium (200-500)' ? 'between 200-500 words'
        : 'over 500 words'
      tip = `Your best performing jobs have descriptions ${wordRange} (avg ${bestGroup.avgApps} applications).`
    }

    // Check if any keyword has strong positive correlation
    const topKeyword = keywords.find(k => k.sentiment === 'positive')
    if (topKeyword && topKeyword.correlation > 0.3) {
      const multiplier = (1 + topKeyword.correlation).toFixed(1)
      tip += tip ? ' ' : ''
      tip += `Jobs mentioning "${topKeyword.word}" get ${multiplier}x more applications.`
    }

    if (!tip) {
      tip = 'Keep posting to build up enough data for personalised recommendations.'
    }

    // Sort table by apps desc
    const tableData = [...jobData].sort((a, b) => b.apps - a.apps)

    return {
      lengthChartData,
      bestGroup,
      keywords,
      tip,
      tableData,
    }
  }, [jobs, applications, jobViews])

  // Retention Funnel
  const retentionData = useMemo(() => {
    const allApps = applications
    const totalApps = allApps.length
    if (totalApps === 0) return null

    const interviewed = allApps.filter((a: any) =>
      ['interview', 'interviewing', 'offered', 'hired', 'retained', 'left'].includes(a.status)
    ).length
    const offered = allApps.filter((a: any) =>
      ['offered', 'hired', 'retained', 'left'].includes(a.status)
    ).length
    const hired = allApps.filter((a: any) =>
      ['hired', 'retained', 'left'].includes(a.status)
    ).length
    const retained = allApps.filter((a: any) => a.status === 'retained').length
    const left = allApps.filter((a: any) => a.status === 'left').length

    const funnel = [
      { name: 'Applied', value: totalApps, color: '#3b82f6' },
      { name: 'Interviewed', value: interviewed, color: '#8b5cf6' },
      { name: 'Offered', value: offered, color: '#f59e0b' },
      { name: 'Hired', value: hired, color: '#16a34a' },
      { name: 'Retained', value: retained, color: '#059669' },
    ]

    // Retention rate: of those hired, how many are retained
    const retentionRate = hired > 0 ? Math.round((retained / hired) * 100) : null
    const hasRetentionData = retained > 0 || left > 0

    // Build profile map for names
    const profileMap = new Map<string, any>()
    candidateProfiles.forEach(p => profileMap.set(p.user_id, p))

    // Hire timeline
    const hiredApps = allApps
      .filter((a: any) => ['hired', 'retained', 'left'].includes(a.status))
      .map((a: any) => {
        const job = jobs.find((j: any) => j.id === a.job_id)
        const profile = profileMap.get(a.candidate_id)
        const hireDate = a.status_updated_at || a.applied_at
        const now = new Date()
        const retentionMs = now.getTime() - new Date(hireDate).getTime()

        let currentStatus: 'retained' | 'left' | 'unknown' = 'unknown'
        if (a.status === 'retained') currentStatus = 'retained'
        else if (a.status === 'left') currentStatus = 'left'

        return {
          applicationId: a.id,
          candidateName: profile?.full_name || 'Unknown',
          jobTitle: job?.title || 'Unknown Position',
          hireDate,
          currentStatus,
          retentionDays: Math.floor(retentionMs / 86400000),
        }
      })
      .sort((a, b) => new Date(b.hireDate).getTime() - new Date(a.hireDate).getTime())

    // Average retention period for those marked retained
    const retainedApps = hiredApps.filter(a => a.currentStatus === 'retained')
    const avgRetentionDays = retainedApps.length > 0
      ? Math.round(retainedApps.reduce((sum, a) => sum + a.retentionDays, 0) / retainedApps.length)
      : null

    return {
      funnel,
      retentionRate,
      hasRetentionData,
      hiredApps,
      avgRetentionDays,
      totalHired: hired,
      totalRetained: retained,
      totalLeft: left,
    }
  }, [applications, candidateProfiles, jobs])

  // Handler to update retention status
  const handleRetentionUpdate = useCallback(async (applicationId: string, newStatus: 'retained' | 'left') => {
    const { error } = await supabase
      .from('job_applications')
      .update({ status: newStatus, status_updated_at: new Date().toISOString() })
      .eq('id', applicationId)

    if (error) {
      console.error('[Analytics] Retention update failed:', error.message)
      return
    }

    // Optimistically update local state
    setApplications(prev =>
      prev.map(a => a.id === applicationId ? { ...a, status: newStatus, status_updated_at: new Date().toISOString() } : a)
    )
  }, [])

  // Activity feed
  const activityFeed = useMemo(() => {
    const activities: { type: string; title: string; description: string; time: string; color: string }[] = []

    applications.slice(0, 15).forEach((app: any) => {
      const job = jobs.find((j: any) => j.id === app.job_id)
      activities.push({
        type: 'application',
        title: 'New Application',
        description: `Application received for ${job?.title || 'a position'}`,
        time: app.applied_at,
        color: '#3b82f6',
      })
    })

    interviews.slice(0, 10).forEach((interview: any) => {
      const job = jobs.find((j: any) => j.id === interview.job_id)
      activities.push({
        type: 'interview',
        title: interview.status === 'completed' ? 'Interview Completed' : 'Interview Scheduled',
        description: `${job?.title || 'a position'}`,
        time: interview.created_at,
        color: interview.status === 'completed' ? '#16a34a' : '#f59e0b',
      })
    })

    offers.slice(0, 10).forEach((offer: any) => {
      const job = jobs.find((j: any) => j.id === offer.job_id)
      const statusLabel = offer.status === 'accepted' ? 'Offer Accepted'
        : offer.status === 'declined' ? 'Offer Declined'
        : 'Offer Sent'
      activities.push({
        type: 'offer',
        title: statusLabel,
        description: `${job?.title || 'a position'}`,
        time: offer.created_at,
        color: offer.status === 'accepted' ? '#059669' : offer.status === 'declined' ? '#dc2626' : '#8b5cf6',
      })
    })

    return activities
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 15)
  }, [applications, interviews, offers, jobs])

  // KPI Sparkline data — buckets filtered data into 7 time segments
  const sparklineData = useMemo(() => {
    if (filteredViews.length === 0 && filteredApps.length === 0) return null
    const threshold = getDateThreshold(dateRange)
    const now = dateRange === 'custom' && customEndDate ? new Date(customEndDate + 'T23:59:59') : new Date()
    const range = now.getTime() - threshold.getTime()
    const bucketSize = range / 7

    const buckets = Array.from({ length: 7 }, (_, i) => {
      const start = threshold.getTime() + i * bucketSize
      const end = start + bucketSize
      const views = filteredViews.filter(v => { const t = new Date(v.viewed_at).getTime(); return t >= start && t < end }).length
      const apps = filteredApps.filter(a => { const t = new Date(a.applied_at).getTime(); return t >= start && t < end }).length
      const hires = filteredApps.filter(a => ['hired', 'retained', 'left'].includes(a.status) && (() => { const t = new Date(a.applied_at).getTime(); return t >= start && t < end })()).length
      const conv = views > 0 ? (apps / views) * 100 : 0
      return { views, apps, hires, conv }
    })
    return buckets
  }, [filteredViews, filteredApps, dateRange, customStartDate, customEndDate])

  // AI Insights Summary — generates plain-English bullet points
  const aiInsightsSummary = useMemo(() => {
    const insights: string[] = []

    // Application trend
    if (metrics.changes && metrics.changes.applications !== 0) {
      const dir = metrics.changes.applications > 0 ? 'up' : 'down'
      const pct = Math.abs(metrics.changes.applications).toFixed(0)
      insights.push(
        dir === 'up'
          ? `Applications are up ${pct}% compared to the previous period. Keep your listings fresh to maintain momentum.`
          : `Applications are down ${pct}% compared to the previous period. Consider refreshing job descriptions or adjusting salary ranges.`
      )
    }

    // Conversion rate vs benchmark
    const convRate = parseFloat(metrics.conversionRate)
    if (convRate > 0) {
      if (convRate >= 10) {
        insights.push(`Your conversion rate of ${metrics.conversionRate}% is excellent — well above the typical 5-8% range.`)
      } else if (convRate >= 5) {
        insights.push(`Your conversion rate of ${metrics.conversionRate}% is healthy and in line with industry averages.`)
      } else {
        insights.push(`Your conversion rate is ${metrics.conversionRate}%. Improving job descriptions and salary transparency could help.`)
      }
    }

    // Top performing job
    if (jobPerformanceData.length > 0) {
      const topJob = [...jobPerformanceData].sort((a, b) => b.applicationCount - a.applicationCount)[0]
      if (topJob && topJob.applicationCount > 0) {
        insights.push(`"${topJob.title}" is your top performer with ${topJob.applicationCount} application${topJob.applicationCount !== 1 ? 's' : ''}.`)
      }
    }

    // Time to hire
    if (metrics.avgTimeToHireMs !== null) {
      const days = metrics.avgTimeToHireMs / 86400000
      if (days < 14) {
        insights.push(`Average time to hire is ${formatTimeToHire(metrics.avgTimeToHireMs)} — faster than the industry average of 23 days.`)
      } else if (days < 30) {
        insights.push(`Average time to hire is ${formatTimeToHire(metrics.avgTimeToHireMs)}. Streamlining your interview process could speed this up.`)
      } else {
        insights.push(`Average time to hire is ${formatTimeToHire(metrics.avgTimeToHireMs)}. Consider reducing interview rounds to fill roles faster.`)
      }
    }

    // Top source
    if (sourceData.length > 0) {
      const topSource = sourceData[0]
      insights.push(`${topSource.name} is your top traffic source with ${topSource.value} view${topSource.value !== 1 ? 's' : ''}.`)
    }

    return insights.length > 0 ? insights : null
  }, [metrics, jobPerformanceData, sourceData])

  // Conversion Rate Over Time chart data
  const conversionRateOverTimeData = useMemo(() => {
    if (filteredViews.length === 0 && filteredApps.length === 0) return []

    const getDateKey = (date: Date): string => {
      if (trafficGrouping === 'day') {
        return date.toISOString().split('T')[0]
      } else if (trafficGrouping === 'week') {
        const weekStart = new Date(date)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
        return weekStart.toISOString().split('T')[0]
      } else {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      }
    }

    const groups: Record<string, { views: number; apps: number }> = {}
    filteredViews.forEach((v: any) => {
      const key = getDateKey(new Date(v.viewed_at))
      if (!groups[key]) groups[key] = { views: 0, apps: 0 }
      groups[key].views++
    })
    filteredApps.forEach((a: any) => {
      const key = getDateKey(new Date(a.applied_at))
      if (!groups[key]) groups[key] = { views: 0, apps: 0 }
      groups[key].apps++
    })

    return Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .map(dateStr => ({
        date: formatChartDate(dateStr, trafficGrouping),
        rate: groups[dateStr].views > 0
          ? Math.round((groups[dateStr].apps / groups[dateStr].views) * 1000) / 10
          : 0,
      }))
  }, [filteredViews, filteredApps, trafficGrouping])

  // Applications by sector (job category) — for donut chart
  const applicationBySectorData = useMemo(() => {
    if (filteredApps.length === 0) return []
    const counts: Record<string, number> = {}
    filteredApps.forEach((app: any) => {
      const job = jobs.find((j: any) => j.id === app.job_id)
      const label = job?.category ? getCategoryLabel(job.category) : 'Uncategorised'
      counts[label] = (counts[label] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredApps, jobs])

  // Applications by job type (employment type) — for donut chart
  const applicationByJobTypeData = useMemo(() => {
    if (filteredApps.length === 0) return []
    const counts: Record<string, number> = {}
    filteredApps.forEach((app: any) => {
      const job = jobs.find((j: any) => j.id === app.job_id)
      const type = String(job?.employment_type || job?.job_type || 'Unknown')
      const label = type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')
      counts[label] = (counts[label] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredApps, jobs])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'active': return styles.statusActive
      case 'filled': return styles.statusFilled
      case 'expired': return styles.statusExpired
      case 'draft': return styles.statusDraft
      default: return styles.statusDraft
    }
  }

  // PDF Export
  const handleExportPdf = useCallback(async () => {
    setExporting(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')

      const pdf = new jsPDF('p', 'mm', 'a4')
      const W = 210 // A4 width
      const MARGIN = 15
      const CONTENT_W = W - MARGIN * 2
      let y = MARGIN

      const NAVY = '#1e293b'
      const YELLOW = '#FFD700'
      const GREY = '#64748b'
      const LIGHT_GREY = '#f1f5f9'

      const dateLabel = dateRange === '7d' ? 'Last 7 Days' : dateRange === '30d' ? 'Last 30 Days'
        : dateRange === '90d' ? 'Last 90 Days' : dateRange === '12m' ? 'Last 12 Months'
        : dateRange === 'custom' ? `${customStartDate} to ${customEndDate}` : 'All Time'
      const reportDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

      // --- Header ---
      pdf.setFillColor(30, 41, 59) // navy
      pdf.rect(0, 0, W, 36, 'F')

      // Honeycomb icon (simplified hexagon shapes)
      const drawHex = (cx: number, cy: number, r: number) => {
        const pts: [number, number][] = []
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6
          pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
        }
        pdf.setDrawColor(255, 215, 0)
        pdf.setLineWidth(0.5)
        pdf.setFillColor(255, 215, 0)
        pdf.triangle(pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1], 'F')
        pdf.triangle(pts[0][0], pts[0][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1], 'F')
        pdf.triangle(pts[0][0], pts[0][1], pts[3][0], pts[3][1], pts[4][0], pts[4][1], 'F')
        pdf.triangle(pts[0][0], pts[0][1], pts[4][0], pts[4][1], pts[5][0], pts[5][1], 'F')
      }
      drawHex(MARGIN + 5, 12, 4)
      drawHex(MARGIN + 12, 12, 4)
      drawHex(MARGIN + 8.5, 19, 4)

      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Hex', MARGIN + 20, 15)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Analytics Report', MARGIN + 20, 21)

      pdf.setFontSize(9)
      pdf.text(companyName, W - MARGIN, 13, { align: 'right' })
      pdf.setTextColor(200, 200, 200)
      pdf.text(`${dateLabel}  •  ${reportDate}`, W - MARGIN, 19, { align: 'right' })

      y = 44

      // --- Helper functions ---
      const addSectionHeader = (title: string) => {
        if (y > 265) { pdf.addPage(); y = MARGIN }
        pdf.setFillColor(30, 41, 59)
        pdf.rect(MARGIN, y, CONTENT_W, 8, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.text(title, MARGIN + 3, y + 5.5)
        y += 12
      }

      const addText = (text: string, size: number = 9, color: string = NAVY, bold: boolean = false) => {
        if (y > 280) { pdf.addPage(); y = MARGIN }
        pdf.setTextColor(color)
        pdf.setFontSize(size)
        pdf.setFont('helvetica', bold ? 'bold' : 'normal')
        const lines = pdf.splitTextToSize(text, CONTENT_W)
        pdf.text(lines, MARGIN, y)
        y += lines.length * (size * 0.45) + 2
      }

      const addKeyValue = (label: string, value: string, x: number, width: number) => {
        pdf.setTextColor(GREY)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'normal')
        pdf.text(label, x, y)
        pdf.setTextColor(NAVY)
        pdf.setFontSize(14)
        pdf.setFont('helvetica', 'bold')
        pdf.text(value, x, y + 6)
      }

      // --- 1. Executive Summary ---
      addSectionHeader('Executive Summary')

      const summaryText = `${companyName} currently has ${metrics.activeJobs} active job${metrics.activeJobs !== 1 ? 's' : ''} `
        + `and has received ${metrics.totalViews.toLocaleString()} views and ${metrics.totalApplications.toLocaleString()} applications `
        + `during the selected period (${dateLabel}). The overall conversion rate is ${metrics.conversionRate}% with `
        + `${metrics.hires} hire${metrics.hires !== 1 ? 's' : ''} made. `
        + `Average time to hire: ${formatTimeToHire(metrics.avgTimeToHireMs)}.`
      addText(summaryText)

      // Stat cards row
      y += 2
      const statsStartY = y
      const cardW = CONTENT_W / 3
      const statItems = [
        { label: 'Active Jobs', value: String(metrics.activeJobs) },
        { label: 'Total Views', value: metrics.totalViews.toLocaleString() },
        { label: 'Total Applications', value: String(metrics.totalApplications) },
        { label: 'Conversion Rate', value: `${metrics.conversionRate}%` },
        { label: 'Hires', value: String(metrics.hires) },
        { label: 'Avg Time to Hire', value: formatTimeToHire(metrics.avgTimeToHireMs) },
      ]
      statItems.forEach((item, i) => {
        const col = i % 3
        const row = Math.floor(i / 3)
        const x = MARGIN + col * cardW
        const cellY = statsStartY + row * 16
        pdf.setFillColor(241, 245, 249)
        pdf.roundedRect(x + 1, cellY - 2, cardW - 2, 14, 2, 2, 'F')
        pdf.setTextColor(GREY)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'normal')
        pdf.text(item.label, x + 4, cellY + 2)
        pdf.setTextColor(NAVY)
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'bold')
        pdf.text(item.value, x + 4, cellY + 9)
      })
      y = statsStartY + 34

      // --- 2. Views & Applications Chart (capture from DOM) ---
      if (chartRef.current) {
        addSectionHeader('Traffic Overview')
        try {
          const canvas = await html2canvas(chartRef.current, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
          })
          const imgData = canvas.toDataURL('image/png')
          const imgW = CONTENT_W
          const imgH = (canvas.height / canvas.width) * imgW
          if (y + imgH > 280) { pdf.addPage(); y = MARGIN }
          pdf.addImage(imgData, 'PNG', MARGIN, y, imgW, Math.min(imgH, 80))
          y += Math.min(imgH, 80) + 4
        } catch {
          addText('Chart could not be rendered.', 8, GREY)
        }
      }

      // --- 3. Conversion Funnel ---
      addSectionHeader('Conversion Funnel')
      const pipelineMaxVal = funnelData[0]?.value || 1
      funnelData.forEach((stage, i) => {
        if (y > 275) { pdf.addPage(); y = MARGIN }
        const barW = pipelineMaxVal > 0 ? (stage.value / pipelineMaxVal) * (CONTENT_W - 50) : 0
        pdf.setTextColor(NAVY)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.text(stage.name, MARGIN, y + 3)

        // Bar
        const hex = EXTENDED_FUNNEL_COLORS[i] || '#3b82f6'
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        pdf.setFillColor(r, g, b)
        pdf.roundedRect(MARGIN + 28, y - 1, Math.max(barW, 1), 5, 1, 1, 'F')

        pdf.setTextColor(GREY)
        pdf.text(`${stage.value}`, MARGIN + 30 + barW, y + 3)
        y += 8
      })
      y += 2

      // --- 4. Job Performance Table ---
      addSectionHeader('Job Performance')
      if (jobPerformanceData.length > 0) {
        const cols = ['Job Title', 'Status', 'Views', 'Applications', 'Interviews', 'Hired', 'Conversion %', 'CTR']
        const colWidths = [52, 16, 18, 16, 22, 16, 18, 16]
        const tableX = MARGIN

        // Header row
        pdf.setFillColor(30, 41, 59)
        pdf.rect(tableX, y, CONTENT_W, 6, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(6.5)
        pdf.setFont('helvetica', 'bold')
        let cx = tableX + 2
        cols.forEach((col, i) => {
          pdf.text(col, cx, y + 4)
          cx += colWidths[i]
        })
        y += 7

        // Data rows
        jobPerformanceData.slice(0, 20).forEach((job: any, rowIdx: number) => {
          if (y > 278) { pdf.addPage(); y = MARGIN }
          if (rowIdx % 2 === 0) {
            pdf.setFillColor(248, 250, 252)
            pdf.rect(tableX, y - 1.5, CONTENT_W, 5.5, 'F')
          }
          pdf.setTextColor(NAVY)
          pdf.setFontSize(6.5)
          pdf.setFont('helvetica', 'normal')
          cx = tableX + 2
          const title = job.title.length > 30 ? job.title.slice(0, 28) + '…' : job.title
          const vals = [title, job.status, String(job.viewCount), String(job.applicationCount), String(job.interviewCount), String(job.hiredCount), `${job.conversionRate}%`, `${job.ctr}%`]
          vals.forEach((val, i) => {
            pdf.text(val, cx, y + 2)
            cx += colWidths[i]
          })
          y += 5.5
        })
        if (jobPerformanceData.length > 20) {
          addText(`... and ${jobPerformanceData.length - 20} more jobs`, 7, GREY)
        }
        y += 4
      }

      // --- 5. Salary Insights ---
      if (salaryInsights) {
        addSectionHeader('Salary Insights')
        if (salaryInsights.mostPopular) {
          addText(`Most Popular Salary Range: ${salaryInsights.mostPopular.name} (${salaryInsights.mostPopular.views} views)`, 9, NAVY, true)
        }
        if (salaryInsights.bestConverting) {
          addText(`Best Converting Range: ${salaryInsights.bestConverting.name} (${salaryInsights.bestConverting.ctr.toFixed(1)}% CTR)`, 9, NAVY, true)
        }

        // Bracket bars
        y += 1
        salaryInsights.bracketData.forEach((bracket: any) => {
          if (y > 278) { pdf.addPage(); y = MARGIN }
          pdf.setTextColor(GREY)
          pdf.setFontSize(7)
          pdf.text(bracket.name, MARGIN, y + 3)
          const maxViews = Math.max(...salaryInsights.bracketData.map((b: any) => b.views), 1)
          const barW = (bracket.views / maxViews) * (CONTENT_W - 45)
          pdf.setFillColor(255, 215, 0)
          pdf.roundedRect(MARGIN + 22, y, Math.max(barW, 1), 4, 1, 1, 'F')
          pdf.setTextColor(NAVY)
          pdf.text(`${bracket.views}v / ${bracket.applications}a`, MARGIN + 24 + barW, y + 3)
          y += 6.5
        })
        y += 2
      }

      // --- 6. Candidate Demographics ---
      if (demographics) {
        addSectionHeader('Candidate Demographics')
        addText(`Based on ${demographics.totalApplicants} applicant profiles.`, 8, GREY)

        // Top regions
        if (demographics.regionData.length > 0) {
          addText('Top Regions:', 8, NAVY, true)
          demographics.regionData.slice(0, 5).forEach((r: any) => {
            addText(`  ${r.name}: ${r.value} applicant${r.value !== 1 ? 's' : ''}`, 8, GREY)
          })
        }

        // Experience levels
        if (demographics.experienceData.length > 0) {
          y += 1
          addText('Experience Levels:', 8, NAVY, true)
          demographics.experienceData.forEach((e: any) => {
            addText(`  ${e.name}: ${e.value} applicant${e.value !== 1 ? 's' : ''}`, 8, GREY)
          })
        }

        // Top skills
        if (demographics.topSkills.length > 0) {
          y += 1
          addText('Top Skills:', 8, NAVY, true)
          const skillList = demographics.topSkills.slice(0, 10).map((s: any) => `${s.name} (${s.value})`).join(', ')
          addText(`  ${skillList}`, 8, GREY)
        }

        // Completeness
        addText(`Profile Completeness: ${demographics.completenessPercent}% (${demographics.completeProfiles} of ${demographics.totalApplicants} fully complete)`, 8, NAVY, true)
        y += 2
      }

      // --- 7. Market Benchmarking ---
      if (marketBenchmark && marketBenchmark.hasEnoughData) {
        addSectionHeader('Market Benchmarking')
        addText('Your averages vs platform averages:', 8, GREY)
        y += 1

        // Comparison summary
        const mbCols = ['Metric', 'Yours', 'Platform']
        const mbColWidths = [40, 30, 30]
        pdf.setFillColor(30, 41, 59)
        pdf.rect(MARGIN, y, 100, 6, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'bold')
        let mx = MARGIN + 2
        mbCols.forEach((col, i) => {
          pdf.text(col, mx, y + 4)
          mx += mbColWidths[i]
        })
        y += 7

        marketBenchmark.comparisonChart.forEach((row: any, rowIdx: number) => {
          if (y > 278) { pdf.addPage(); y = MARGIN }
          if (rowIdx % 2 === 0) {
            pdf.setFillColor(248, 250, 252)
            pdf.rect(MARGIN, y - 1.5, 100, 5.5, 'F')
          }
          pdf.setTextColor(NAVY)
          pdf.setFontSize(7)
          pdf.setFont('helvetica', 'normal')
          mx = MARGIN + 2
          pdf.text(row.metric, mx, y + 2)
          mx += mbColWidths[0]
          pdf.setFont('helvetica', 'bold')
          pdf.text(String(row.yours), mx, y + 2)
          mx += mbColWidths[1]
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(GREY)
          pdf.text(String(row.platform), mx, y + 2)
          y += 5.5
        })

        // Time to first app
        if (marketBenchmark.myAvgTimeToFirst !== null || marketBenchmark.platAvgTimeToFirst !== null) {
          y += 2
          addText(`Time to First Application — Yours: ${formatTimeToHire(marketBenchmark.myAvgTimeToFirst)} | Platform: ${formatTimeToHire(marketBenchmark.platAvgTimeToFirst)}`, 8, NAVY, true)
        }

        // Salary badges
        const jobsWithBadge = marketBenchmark.jobComparisons.filter((j: any) => j.hasSectorData && j.mySalary !== null)
        if (jobsWithBadge.length > 0) {
          y += 2
          addText('Salary Competitiveness:', 8, NAVY, true)
          jobsWithBadge.slice(0, 10).forEach((j: any) => {
            const badge = j.salaryBadge === 'above' ? '▲ Above Market' : j.salaryBadge === 'below' ? '▼ Below Market' : '● At Market'
            addText(`  ${j.title}: ${j.mySalaryDisplay} — ${badge}`, 7, j.salaryBadge === 'above' ? '#16a34a' : j.salaryBadge === 'below' ? '#dc2626' : GREY)
          })
        }
        y += 2
      }

      // --- Footer ---
      const totalPages = pdf.getNumberOfPages()
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p)
        pdf.setFillColor(30, 41, 59)
        pdf.rect(0, 287, W, 10, 'F')
        pdf.setTextColor(200, 200, 200)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'normal')
        pdf.text('Generated by Hex', MARGIN, 292.5)
        pdf.text(`${reportDate}  •  Page ${p} of ${totalPages}`, W - MARGIN, 292.5, { align: 'right' })
      }

      // Save
      const filename = `Hex-Analytics-${companyName.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(filename)
    } catch (err) {
      console.error('[Analytics] PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [
    dateRange, companyName, metrics, trafficChartData, funnelData,
    jobPerformanceData, salaryInsights, demographics, marketBenchmark,
  ])

  // CSV Export
  const handleExportCsv = useCallback(() => {
    setExporting(true)
    setExportMenuOpen(false)
    try {
      const dateLabel = dateRange === '7d' ? 'Last 7 Days' : dateRange === '30d' ? 'Last 30 Days' : dateRange === '90d' ? 'Last 90 Days' : dateRange === '12m' ? 'Last 12 Months' : dateRange === 'custom' ? `${customStartDate} to ${customEndDate}` : 'All Time'
      const escapeCsv = (val: any) => {
        const s = String(val ?? '')
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
      }
      const rows: string[] = []
      rows.push(`Hex Analytics Report — ${companyName} — ${dateLabel}`)
      rows.push('')

      // Executive Summary
      rows.push('EXECUTIVE SUMMARY')
      rows.push('Metric,Value')
      rows.push(`Active Jobs,${metrics.activeJobs}`)
      rows.push(`Total Views,${metrics.totalViews}`)
      rows.push(`Applications,${metrics.totalApplications}`)
      rows.push(`Hires,${metrics.hires}`)
      rows.push(`Conversion Rate,${metrics.conversionRate}%`)
      rows.push(`Avg Time to Hire,${formatTimeToHire(metrics.avgTimeToHireMs)}`)
      rows.push('')

      // Conversion Funnel
      if (funnelData.length > 0) {
        rows.push('CONVERSION FUNNEL')
        rows.push('Stage,Count')
        funnelData.forEach((d: any) => rows.push(`${escapeCsv(d.name)},${d.value}`))
        rows.push('')
      }

      // Job Performance
      if (jobPerformanceData.length > 0) {
        rows.push('JOB PERFORMANCE')
        rows.push('Job Title,Status,Views,Applications,Interviews,Hired,Conversion %,CTR')
        jobPerformanceData.forEach((j: any) => {
          rows.push(`${escapeCsv(j.title)},${j.status},${j.views},${j.applicationCount},${j.interviewCount},${j.hiredCount},${j.conversionRate},${j.ctr}`)
        })
        rows.push('')
      }

      // Salary Insights
      if (salaryInsights && salaryInsights.bracketData && salaryInsights.bracketData.length > 0) {
        rows.push('SALARY INSIGHTS')
        rows.push('Range,Job Count,Views')
        salaryInsights.bracketData.forEach((r: any) => rows.push(`${escapeCsv(r.name)},${r.jobCount},${r.views}`))
        rows.push('')
      }

      // Source Breakdown
      if (sourceData.length > 0) {
        const sourceTotal = sourceData.reduce((s: number, d: any) => s + d.value, 0) || 1
        rows.push('SOURCE BREAKDOWN')
        rows.push('Source,Views,Percentage')
        sourceData.forEach((s: any) => rows.push(`${escapeCsv(s.name)},${s.value},${((s.value / sourceTotal) * 100).toFixed(1)}%`))
        rows.push('')
      }

      // Device Breakdown
      if (deviceData.length > 0) {
        const deviceTotal = deviceData.reduce((s: number, d: any) => s + d.value, 0) || 1
        rows.push('DEVICE BREAKDOWN')
        rows.push('Device,Views,Percentage')
        deviceData.forEach((d: any) => rows.push(`${escapeCsv(d.name)},${d.value},${((d.value / deviceTotal) * 100).toFixed(1)}%`))
        rows.push('')
      }

      // Market Benchmarking
      if (marketBenchmark && marketBenchmark.comparisonChart && marketBenchmark.comparisonChart.length > 0) {
        rows.push('MARKET BENCHMARKING')
        rows.push('Metric,Yours,Platform Average')
        marketBenchmark.comparisonChart.forEach((r: any) => rows.push(`${escapeCsv(r.metric)},${r.yours},${r.platform}`))
        rows.push('')
      }

      // Application Quality
      if (applicationQuality && applicationQuality.topApplicants && applicationQuality.topApplicants.length > 0) {
        rows.push('APPLICATION QUALITY — TOP APPLICANTS')
        rows.push('Name,Score,Job Applied')
        applicationQuality.topApplicants.slice(0, 20).forEach((a: any) => rows.push(`${escapeCsv(a.name)},${a.score},${escapeCsv(a.jobTitle)}`))
        rows.push('')
      }

      // Traffic Over Time
      if (trafficChartData.length > 0) {
        rows.push('TRAFFIC OVER TIME')
        rows.push('Period,Views,Impressions')
        trafficChartData.forEach((d: any) => rows.push(`${escapeCsv(d.name)},${d.views ?? 0},${d.impressions ?? 0}`))
        rows.push('')
      }

      const csv = rows.join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Hex-Analytics-${companyName.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[Analytics] CSV export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [dateRange, companyName, metrics, funnelData, jobPerformanceData, salaryInsights, sourceData, deviceData, marketBenchmark, applicationQuality, trafficChartData])

  // Excel (XLSX) Export
  const handleExportXlsx = useCallback(async () => {
    setExporting(true)
    setExportMenuOpen(false)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const dateLabel = dateRange === '7d' ? 'Last 7 Days' : dateRange === '30d' ? 'Last 30 Days' : dateRange === '90d' ? 'Last 90 Days' : dateRange === '12m' ? 'Last 12 Months' : dateRange === 'custom' ? `${customStartDate} to ${customEndDate}` : 'All Time'

      // 1. Executive Summary sheet
      const summaryData = [
        ['Hex Analytics Report', '', ''],
        ['Company', companyName, ''],
        ['Period', dateLabel, ''],
        ['Generated', new Date().toLocaleDateString('en-GB'), ''],
        [],
        ['Metric', 'Value', ''],
        ['Active Jobs', metrics.activeJobs, ''],
        ['Total Views', metrics.totalViews, ''],
        ['Applications', metrics.totalApplications, ''],
        ['Hires', metrics.hires, ''],
        ['Conversion Rate', `${metrics.conversionRate}%`, ''],
        ['Avg Time to Hire', formatTimeToHire(metrics.avgTimeToHireMs), ''],
      ]
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
      wsSummary['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

      // 2. Job Performance sheet
      if (jobPerformanceData.length > 0) {
        const jpData = [
          ['Job Title', 'Status', 'Views', 'Applications', 'Interviews', 'Hired', 'Conversion %', 'CTR'],
          ...jobPerformanceData.map((j: any) => [j.title, j.status, j.views, j.applicationCount, j.interviewCount, j.hiredCount, j.conversionRate, j.ctr])
        ]
        const wsJP = XLSX.utils.aoa_to_sheet(jpData)
        wsJP['!cols'] = [{ wch: 35 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 8 }]
        XLSX.utils.book_append_sheet(wb, wsJP, 'Job Performance')
      }

      // 3. Conversion Funnel sheet
      if (funnelData.length > 0) {
        const fData = [
          ['Stage', 'Count'],
          ...funnelData.map((d: any) => [d.name, d.value])
        ]
        const wsFunnel = XLSX.utils.aoa_to_sheet(fData)
        wsFunnel['!cols'] = [{ wch: 20 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, wsFunnel, 'Conversion Funnel')
      }

      // 4. Traffic Over Time sheet
      if (trafficChartData.length > 0) {
        const tData = [
          ['Period', 'Views', 'Impressions'],
          ...trafficChartData.map((d: any) => [d.name, d.views ?? 0, d.impressions ?? 0])
        ]
        const wsTraffic = XLSX.utils.aoa_to_sheet(tData)
        wsTraffic['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, wsTraffic, 'Traffic')
      }

      // 5. Sources & Devices sheet
      if (sourceData.length > 0 || deviceData.length > 0) {
        const sdRows: any[][] = []
        if (sourceData.length > 0) {
          const srcTotal = sourceData.reduce((s: number, d: any) => s + d.value, 0) || 1
          sdRows.push(['SOURCE BREAKDOWN', '', ''])
          sdRows.push(['Source', 'Views', 'Percentage'])
          sourceData.forEach((s: any) => sdRows.push([s.name, s.value, `${((s.value / srcTotal) * 100).toFixed(1)}%`]))
          sdRows.push([])
        }
        if (deviceData.length > 0) {
          const devTotal = deviceData.reduce((s: number, d: any) => s + d.value, 0) || 1
          sdRows.push(['DEVICE BREAKDOWN', '', ''])
          sdRows.push(['Device', 'Views', 'Percentage'])
          deviceData.forEach((d: any) => sdRows.push([d.name, d.value, `${((d.value / devTotal) * 100).toFixed(1)}%`]))
        }
        const wsSD = XLSX.utils.aoa_to_sheet(sdRows)
        wsSD['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, wsSD, 'Sources & Devices')
      }

      // 6. Salary Insights sheet
      if (salaryInsights && salaryInsights.bracketData && salaryInsights.bracketData.length > 0) {
        const salData = [
          ['Salary Range', 'Job Count', 'Views'],
          ...salaryInsights.bracketData.map((r: any) => [r.name, r.jobCount, r.views])
        ]
        const wsSalary = XLSX.utils.aoa_to_sheet(salData)
        wsSalary['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 10 }]
        XLSX.utils.book_append_sheet(wb, wsSalary, 'Salary Insights')
      }

      // 7. Market Benchmarking sheet
      if (marketBenchmark && marketBenchmark.comparisonChart && marketBenchmark.comparisonChart.length > 0) {
        const mbRows: any[][] = [['Metric', 'Yours', 'Platform Average']]
        marketBenchmark.comparisonChart.forEach((r: any) => mbRows.push([r.metric, r.yours, r.platform]))
        if (marketBenchmark.jobComparisons && marketBenchmark.jobComparisons.length > 0) {
          mbRows.push([])
          mbRows.push(['JOB-BY-JOB COMPARISON', '', '', '', ''])
          mbRows.push(['Job Title', 'Your Salary', 'Avg Salary', 'Your Conv.%', 'Avg Conv.%', 'Salary Badge'])
          marketBenchmark.jobComparisons.filter((j: any) => j.hasSectorData).forEach((j: any) => {
            mbRows.push([j.title, j.mySalaryDisplay || 'N/A', j.avgSalary ? `£${Math.round(j.avgSalary / 1000)}k` : 'N/A', `${j.myConversion?.toFixed(1)}%`, `${j.avgConversion?.toFixed(1)}%`, j.salaryBadge || 'N/A'])
          })
        }
        const wsMB = XLSX.utils.aoa_to_sheet(mbRows)
        wsMB['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
        XLSX.utils.book_append_sheet(wb, wsMB, 'Market Benchmarking')
      }

      // 8. Application Quality sheet
      if (applicationQuality && applicationQuality.topApplicants && applicationQuality.topApplicants.length > 0) {
        const aqData = [
          ['Name', 'Score', 'Job Applied'],
          ...applicationQuality.topApplicants.map((a: any) => [a.name, a.score, a.jobTitle])
        ]
        const wsAQ = XLSX.utils.aoa_to_sheet(aqData)
        wsAQ['!cols'] = [{ wch: 25 }, { wch: 8 }, { wch: 35 }]
        XLSX.utils.book_append_sheet(wb, wsAQ, 'Application Quality')
      }

      // 9. Demographics sheet
      if (demographics) {
        const demoRows: any[][] = []
        const totalApplicants = demographics.totalApplicants || 1
        if (demographics.regionData?.length > 0) {
          demoRows.push(['UK REGION BREAKDOWN', '', ''])
          demoRows.push(['Region', 'Count', 'Percentage'])
          demographics.regionData.forEach((r: any) => demoRows.push([r.name, r.value, `${((r.value / totalApplicants) * 100).toFixed(1)}%`]))
          demoRows.push([])
        }
        if (demographics.experienceData?.length > 0) {
          demoRows.push(['EXPERIENCE LEVELS', '', ''])
          demoRows.push(['Level', 'Count', 'Percentage'])
          demographics.experienceData.forEach((e: any) => demoRows.push([e.name, e.value, `${((e.value / totalApplicants) * 100).toFixed(1)}%`]))
          demoRows.push([])
        }
        if (demographics.ageData?.length > 0) {
          demoRows.push(['AGE DISTRIBUTION', '', ''])
          demoRows.push(['Age Range', 'Count', 'Percentage'])
          demographics.ageData.forEach((a: any) => demoRows.push([a.name, a.value, `${((a.value / totalApplicants) * 100).toFixed(1)}%`]))
        }
        if (demoRows.length > 0) {
          const wsDemo = XLSX.utils.aoa_to_sheet(demoRows)
          wsDemo['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 12 }]
          XLSX.utils.book_append_sheet(wb, wsDemo, 'Demographics')
        }
      }

      const filename = `Hex-Analytics-${companyName.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, filename)
    } catch (err) {
      console.error('[Analytics] Excel export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [dateRange, companyName, metrics, funnelData, jobPerformanceData, trafficChartData, sourceData, deviceData, salaryInsights, marketBenchmark, applicationQuality, demographics])

  if (loading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.container}>
          <div className={styles.skeletonHeader}>
            <div>
              <div className={styles.skeletonLine} style={{ width: '220px', height: '28px' }} />
              <div className={styles.skeletonLine} style={{ width: '180px', height: '16px', marginTop: '0.5rem' }} />
            </div>
          </div>
          <div className={styles.skeletonGrid}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className={styles.skeletonCard}>
                <div className={styles.skeletonCircle} />
                <div className={styles.skeletonLine} style={{ width: '60%', margin: '0 auto' }} />
                <div className={styles.skeletonLineShort} />
              </div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  const maxFunnelValue = Math.max(...funnelData.map(d => d.value), 1)

  const renderChange = (value: number | undefined) => {
    if (value === undefined || value === 0) return null
    const isPositive = value > 0
    return (
      <div className={`${styles.cardChange} ${isPositive ? styles.cardChangePositive : styles.cardChangeNegative}`}>
        <span>{isPositive ? '\u2191' : '\u2193'}</span>
        <span>{Math.abs(value).toFixed(1)}%</span>
      </div>
    )
  }

  // TODO: Re-enable subscription checks when Stripe payments are integrated
  // const isProfessional = subscriptionTier === 'professional'
  const isProfessional = true // TEMP: bypass paywall for testing

  // // Redirect users without any subscription
  // if (!hasSubscription) {
  //   router.push('/dashboard/subscription')
  //   return (
  //     <main className={styles.page}>
  //       <Header />
  //       <div className={styles.container}>
  //         <p>Redirecting to subscription page...</p>
  //       </div>
  //     </main>
  //   )
  // }

  return (
    <main className={styles.page}>
      <Header />

      {/* Professional Tier Upgrade Overlay for Standard Users */}
      {!isProfessional && (
        <div className={styles.upgradeOverlay}>
          <div className={styles.upgradeCard}>
            <h2 className={styles.upgradeTitle}>Upgrade to Professional</h2>
            <p className={styles.upgradeText}>
              The Analytics Dashboard is available exclusively on the Professional plan.
              Upgrade to access detailed recruitment insights, candidate demographics,
              market benchmarking, and more.
            </p>
            <Link href="/dashboard/subscription" className={styles.upgradeBtnLink}>
              Upgrade Now — £59.99/month
            </Link>
          </div>
        </div>
      )}

      <div className={`${styles.container} ${!isProfessional ? styles.blurredContent : ''}`}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.title}>Analytics Dashboard</h1>
            <p className={styles.subtitle}>Recruitment insights for {companyName}</p>
          </div>
          <div className={styles.headerControls}>
            <div className={styles.dateFilter}>
              {(['7d', '30d', '90d', '12m', 'all'] as const).map(range => (
                <button
                  key={range}
                  className={`${styles.dateFilterBtn} ${dateRange === range ? styles.dateFilterBtnActive : ''}`}
                  onClick={() => { setDateRange(range); setShowCustomPicker(false) }}
                >
                  {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : range === '90d' ? '90 Days' : range === '12m' ? '12 Months' : 'All Time'}
                </button>
              ))}
              <button
                className={`${styles.dateFilterBtn} ${dateRange === 'custom' ? styles.dateFilterBtnActive : ''}`}
                onClick={() => setShowCustomPicker(prev => !prev)}
              >
                Custom
              </button>
            </div>
            {showCustomPicker && (
              <div className={styles.customDatePicker}>
                <div className={styles.customDateInputs}>
                  <label>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>From</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={e => setCustomStartDate(e.target.value)}
                      className={styles.customDateInput}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>To</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={e => setCustomEndDate(e.target.value)}
                      className={styles.customDateInput}
                    />
                  </label>
                  <button
                    className={styles.customDateApply}
                    disabled={!customStartDate || !customEndDate}
                    onClick={() => {
                      setDateRange('custom')
                      setShowCustomPicker(false)
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
            <div className={styles.exportWrapper} ref={exportMenuRef}>
              <button
                className={styles.exportBtn}
                onClick={() => setExportMenuOpen(prev => !prev)}
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <span className={styles.exportSpinner} />
                    Exporting...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '0.15rem' }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </>
                )}
              </button>
              {exportMenuOpen && !exporting && (
                <div className={styles.exportMenu}>
                  <button className={styles.exportMenuItem} onClick={handleExportPdf}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    Export as PDF
                  </button>
                  <button className={styles.exportMenuItem} onClick={handleExportCsv}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="8" y1="13" x2="16" y2="13" />
                      <line x1="8" y1="17" x2="16" y2="17" />
                    </svg>
                    Export as CSV
                  </button>
                  <button className={styles.exportMenuItem} onClick={handleExportXlsx}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="8" y1="13" x2="16" y2="13" />
                      <line x1="8" y1="17" x2="12" y2="17" />
                    </svg>
                    Export as Excel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className={styles.tabBar}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className={styles.tabIcon}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <>
        {/* Overview Cards */}
        <div className={styles.overviewGrid}>
          <div className={styles.overviewCard}>
            <div className={styles.cardIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <div className={styles.cardValue}>{metrics.activeJobs}</div>
            <div className={styles.cardLabel}>Active Jobs</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.cardIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div className={styles.cardValue}>{metrics.totalViews.toLocaleString()}</div>
            <div className={styles.cardLabel}>Total Views</div>
            {renderChange(metrics.changes?.views)}
            {mounted && sparklineData && (
              <div className={styles.sparklineWrap}>
                <ResponsiveContainer width="100%" height={32}>
                  <AreaChart data={sparklineData}>
                    <defs>
                      <linearGradient id="sparkViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#64748b" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#64748b" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="views" stroke="#64748b" strokeWidth={1.5} fill="url(#sparkViews)" isAnimationActive={true} animationDuration={600} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.cardIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
            </div>
            <div className={styles.cardValue}>{metrics.totalApplications}</div>
            <div className={styles.cardLabel}>Applications</div>
            {renderChange(metrics.changes?.applications)}
            {mounted && sparklineData && (
              <div className={styles.sparklineWrap}>
                <ResponsiveContainer width="100%" height={32}>
                  <AreaChart data={sparklineData}>
                    <defs>
                      <linearGradient id="sparkApps" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="apps" stroke="#8b5cf6" strokeWidth={1.5} fill="url(#sparkApps)" isAnimationActive={true} animationDuration={600} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.cardIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className={styles.cardValue}>{metrics.hires}</div>
            <div className={styles.cardLabel}>Hires</div>
            {renderChange(metrics.changes?.hires)}
            {mounted && sparklineData && (
              <div className={styles.sparklineWrap}>
                <ResponsiveContainer width="100%" height={32}>
                  <AreaChart data={sparklineData}>
                    <defs>
                      <linearGradient id="sparkHires" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16a34a" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#16a34a" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="hires" stroke="#16a34a" strokeWidth={1.5} fill="url(#sparkHires)" isAnimationActive={true} animationDuration={600} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.cardIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
            <div className={styles.cardValue}>{metrics.conversionRate}<span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#64748b' }}>%</span></div>
            <div className={styles.cardLabel}>Conversion Rate</div>
            {renderChange(metrics.changes?.conversion)}
            {mounted && sparklineData && (
              <div className={styles.sparklineWrap}>
                <ResponsiveContainer width="100%" height={32}>
                  <AreaChart data={sparklineData}>
                    <defs>
                      <linearGradient id="sparkConv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FFD700" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#FFD700" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="conv" stroke="#FFD700" strokeWidth={1.5} fill="url(#sparkConv)" isAnimationActive={true} animationDuration={600} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.cardIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className={styles.cardValue}>{formatTimeToHire(metrics.avgTimeToHireMs)}</div>
            <div className={styles.cardLabel}>Avg Time to Hire</div>
          </div>
        </div>

        {/* AI Insights Summary */}
        {aiInsightsSummary && (
          <div className={styles.aiInsightsCard}>
            <div className={styles.aiInsightsHeader}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>AI Insights</span>
            </div>
            <ul className={styles.aiInsightsList}>
              {aiInsightsSummary.map((insight, i) => (
                <li key={i} className={styles.aiInsightsItem}>{insight}</li>
              ))}
            </ul>
          </div>
        )}
          </>
        )}

          {/* Traffic Overview */}
        {activeTab === 'traffic' && (
          <div className={`${styles.sectionCard}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Traffic Overview</h2>
                {renderInfoIcon('Views and impressions over time. Views count when a candidate opens your job listing. Impressions count when your listing appears in search results.')}
              </div>
            </div>
                <div ref={chartRef}>
                  <div className={styles.chartHeader} style={{ marginTop: '0.75rem' }}>
                    <div />
                    <select
                      className={styles.chartGroupingSelect}
                      value={trafficGrouping}
                      onChange={e => setTrafficGrouping(e.target.value as 'day' | 'week' | 'month')}
                    >
                      <option value="day">Daily</option>
                      <option value="week">Weekly</option>
                      <option value="month">Monthly</option>
                    </select>
                  </div>
                  {mounted && trafficChartData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={trafficChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            labelStyle={{ color: '#1e293b', fontWeight: 600 }}
                          />
                          <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} dot={false} name="Views" hide={hiddenTrafficSeries.has('views')} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                          <Line type="monotone" dataKey="impressions" stroke="#64748b" strokeWidth={2} dot={false} name="Impressions" hide={hiddenTrafficSeries.has('impressions')} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" animationBegin={200} />
                        </LineChart>
                      </ResponsiveContainer>
                      <div className={styles.chartLegend}>
                        {([
                          { key: 'views', label: 'Views', color: '#3b82f6' },
                          { key: 'impressions', label: 'Impressions', color: '#64748b' },
                        ]).map(s => (
                          <button
                            key={s.key}
                            className={`${styles.chartLegendItem} ${hiddenTrafficSeries.has(s.key) ? styles.chartLegendItemInactive : ''}`}
                            onClick={() => setHiddenTrafficSeries(prev => {
                              const next = new Set(prev)
                              next.has(s.key) ? next.delete(s.key) : next.add(s.key)
                              return next
                            })}
                          >
                            <span className={styles.chartLegendDot} style={{ background: hiddenTrafficSeries.has(s.key) ? '#cbd5e1' : s.color }} />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={styles.chartEmpty}>No traffic data for this period</div>
                  )}
                </div>
          </div>
        )}

          {/* Application Activity */}
        {activeTab === 'applications' && (
          <div className={`${styles.sectionCard}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Application Activity</h2>
                {renderInfoIcon('Application engagement over time. Tracks completed applications, apply button clicks, and job saves.')}
              </div>
            </div>
                <div className={styles.chartHeader} style={{ marginTop: '0.75rem' }}>
                  <div />
                  <select
                    className={styles.chartGroupingSelect}
                    value={activityGrouping}
                    onChange={e => setActivityGrouping(e.target.value as 'day' | 'week' | 'month')}
                  >
                    <option value="day">Daily</option>
                    <option value="week">Weekly</option>
                    <option value="month">Monthly</option>
                  </select>
                </div>
                {mounted && activityChartData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={activityChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          labelStyle={{ color: '#1e293b', fontWeight: 600 }}
                        />
                        <Line type="monotone" dataKey="applications" stroke="#FFD700" strokeWidth={2} dot={false} name="Applications" hide={hiddenActivitySeries.has('applications')} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="applyClicks" stroke="#16a34a" strokeWidth={2} dot={false} name="Apply Clicks" hide={hiddenActivitySeries.has('applyClicks')} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" animationBegin={200} />
                        <Line type="monotone" dataKey="saveClicks" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Save Clicks" hide={hiddenActivitySeries.has('saveClicks')} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" animationBegin={400} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div className={styles.chartLegend}>
                      {([
                        { key: 'applications', label: 'Applications', color: '#FFD700' },
                        { key: 'applyClicks', label: 'Apply Clicks', color: '#16a34a' },
                        { key: 'saveClicks', label: 'Save Clicks', color: '#8b5cf6' },
                      ]).map(s => (
                        <button
                          key={s.key}
                          className={`${styles.chartLegendItem} ${hiddenActivitySeries.has(s.key) ? styles.chartLegendItemInactive : ''}`}
                          onClick={() => setHiddenActivitySeries(prev => {
                            const next = new Set(prev)
                            next.has(s.key) ? next.delete(s.key) : next.add(s.key)
                            return next
                          })}
                        >
                          <span className={styles.chartLegendDot} style={{ background: hiddenActivitySeries.has(s.key) ? '#cbd5e1' : s.color }} />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={styles.chartEmpty}>No application data for this period</div>
                )}
          </div>
        )}

        {/* Conversion Funnel */}
        {activeTab === 'applications' && (
        <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Conversion Funnel</h2>
              {renderInfoIcon('Full candidate journey from first impression to hire. Each stage shows the count and drop-off percentage from the previous step.')}
            </div>
          </div>
              {maxFunnelValue > 1 ? (
                funnelData.map((stage, i) => {
                  const prevValue = i > 0 ? funnelData[i - 1].value : 0
                  const dropOff = i === 0 || prevValue === 0
                    ? null
                    : ((1 - stage.value / prevValue) * 100)
                  return (
                    <div key={stage.name} className={styles.funnelStage}>
                      <span className={styles.funnelLabel}>{stage.name}</span>
                      <div className={styles.funnelBarWrap}>
                        <div
                          className={styles.funnelBar}
                          style={{
                            width: `${(stage.value / maxFunnelValue) * 100}%`,
                            background: EXTENDED_FUNNEL_COLORS[i],
                          }}
                        />
                      </div>
                      <span className={styles.funnelValue}>{stage.value}</span>
                      <span className={styles.funnelPercent}>
                        {dropOff === null ? '—' : `${dropOff.toFixed(1)}% drop`}
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className={styles.chartEmpty}>No data yet</div>
              )}
        </div>
        )}

        {/* Conversion Rate Over Time */}
        {activeTab === 'traffic' && mounted && conversionRateOverTimeData.length > 1 && (
          <div className={styles.sectionCard} style={{ marginBottom: '1.5rem' }}>
            <h2 className={styles.sectionTitle}>Conversion Rate Over Time</h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={conversionRateOverTimeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} unit="%" />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  labelStyle={{ color: '#1e293b', fontWeight: 600 }}
                  formatter={(value: any) => [`${value}%`, 'Conversion Rate']}
                />
                <Line type="monotone" dataKey="rate" stroke="#FFD700" strokeWidth={2.5} dot={{ fill: '#FFD700', r: 3 }} name="Conversion Rate" isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Source & Device Insights */}
        {activeTab === 'traffic' && (
        <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Source & Device Insights</h2>
              {renderInfoIcon('Where your job views come from and what devices candidates use to view your listings.')}
            </div>
          </div>
              <div className={styles.threeColGrid} style={{ marginBottom: 0, marginTop: '0.75rem' }}>
                {/* Source Breakdown — Donut */}
                <div className={styles.sectionCardInner}>
                  <h3 className={styles.demographicsSubtitle} style={{ margin: '0 0 0.5rem' }}>Source Breakdown</h3>
                  {mounted && sourceData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={sourceData}
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            innerRadius={35}
                            dataKey="value"
                            paddingAngle={2}
                            isAnimationActive={true}
                            animationDuration={800}
                            animationEasing="ease-out"
                          >
                            {sourceData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            formatter={(value: any, name: any) => [`${value} views`, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className={styles.legendRow}>
                        {sourceData.map((entry) => (
                          <div key={entry.name} className={styles.legendItem}>
                            <div className={styles.legendDot} style={{ background: entry.fill }} />
                            <span>{entry.name} ({entry.value})</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={styles.chartEmptySmall}>Source tracking not yet available</div>
                  )}
                </div>

                {/* Device Breakdown — Donut */}
                <div className={styles.sectionCardInner}>
                  <h3 className={styles.demographicsSubtitle} style={{ margin: '0 0 0.5rem' }}>Device Breakdown</h3>
                  {mounted && deviceData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={deviceData}
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            innerRadius={35}
                            dataKey="value"
                            paddingAngle={2}
                            isAnimationActive={true}
                            animationDuration={800}
                            animationEasing="ease-out"
                            animationBegin={200}
                          >
                            {deviceData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            formatter={(value: any, name: any) => [`${value} views`, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className={styles.legendRow}>
                        {deviceData.map((entry) => (
                          <div key={entry.name} className={styles.legendItem}>
                            <div className={styles.legendDot} style={{ background: entry.fill }} />
                            <span>{entry.name} ({entry.value})</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={styles.chartEmptySmall}>Device tracking not yet available</div>
                  )}
                </div>

                {/* Jobs by Sector — Donut */}
                <div className={styles.sectionCardInner}>
                  <h3 className={styles.demographicsSubtitle} style={{ margin: '0 0 0.5rem' }}>Jobs by Sector</h3>
                  {mounted && sectorData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={sectorData}
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            innerRadius={35}
                            dataKey="value"
                            paddingAngle={2}
                            isAnimationActive={true}
                            animationDuration={800}
                            animationEasing="ease-out"
                            animationBegin={400}
                          >
                            {sectorData.map((_entry, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            formatter={(value: any, name: any) => [`${value} job${value !== 1 ? 's' : ''}`, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className={styles.legendRow}>
                        {sectorData.map((entry, i) => (
                          <div key={entry.name} className={styles.legendItem}>
                            <div className={styles.legendDot} style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span>{entry.name} ({entry.value})</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={styles.chartEmptySmall}>No sector data</div>
                  )}
                </div>
              </div>

              {/* Applications by Sector & Job Type — second row */}
              {(applicationBySectorData.length > 0 || applicationByJobTypeData.length > 0) && (
                <div className={styles.twoColGridEqual} style={{ marginTop: '1rem', marginBottom: 0 }}>
                  {/* Applications by Sector */}
                  <div className={styles.sectionCardInner}>
                    <h3 className={styles.demographicsSubtitle} style={{ margin: '0 0 0.5rem' }}>Applications by Sector</h3>
                    {mounted && applicationBySectorData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={applicationBySectorData}
                              cx="50%"
                              cy="50%"
                              outerRadius={70}
                              innerRadius={35}
                              dataKey="value"
                              paddingAngle={2}
                              isAnimationActive={true}
                              animationDuration={800}
                              animationEasing="ease-out"
                            >
                              {applicationBySectorData.map((_entry, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                              formatter={(value: any, name: any) => [`${value} application${value !== 1 ? 's' : ''}`, name]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className={styles.legendRow}>
                          {applicationBySectorData.map((entry, i) => (
                            <div key={entry.name} className={styles.legendItem}>
                              <div className={styles.legendDot} style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                              <span>{entry.name} ({entry.value})</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className={styles.chartEmptySmall}>No application data</div>
                    )}
                  </div>

                  {/* Applications by Job Type */}
                  <div className={styles.sectionCardInner}>
                    <h3 className={styles.demographicsSubtitle} style={{ margin: '0 0 0.5rem' }}>Applications by Job Type</h3>
                    {mounted && applicationByJobTypeData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={applicationByJobTypeData}
                              cx="50%"
                              cy="50%"
                              outerRadius={70}
                              innerRadius={35}
                              dataKey="value"
                              paddingAngle={2}
                              isAnimationActive={true}
                              animationDuration={800}
                              animationEasing="ease-out"
                              animationBegin={200}
                            >
                              {applicationByJobTypeData.map((_entry, i) => (
                                <Cell key={i} fill={PIE_COLORS[(i + 3) % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                              formatter={(value: any, name: any) => [`${value} application${value !== 1 ? 's' : ''}`, name]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className={styles.legendRow}>
                          {applicationByJobTypeData.map((entry, i) => (
                            <div key={entry.name} className={styles.legendItem}>
                              <div className={styles.legendDot} style={{ background: PIE_COLORS[(i + 3) % PIE_COLORS.length] }} />
                              <span>{entry.name} ({entry.value})</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className={styles.chartEmptySmall}>No job type data</div>
                    )}
                  </div>
                </div>
              )}
        </div>
        )}

        {/* Salary Insights Section */}
        {activeTab === 'jobs' && salaryInsights && (
          <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Salary Insights</h2>
            </div>

            {/* Stats row */}
            <div className={styles.salaryStatsRow}>
              <div className={styles.salaryStat}>
                <div className={styles.salaryStatLabel}>Most Popular Range</div>
                <div className={styles.salaryStatValue}>
                  {salaryInsights.mostPopular?.name || '-'}
                </div>
                <div className={styles.salaryStatSub}>
                  {salaryInsights.mostPopular ? `${salaryInsights.mostPopular.views} views` : ''}
                </div>
              </div>
              <div className={styles.salaryStat}>
                <div className={styles.salaryStatLabel}>Best Converting Range</div>
                <div className={styles.salaryStatValue} style={{ color: '#16a34a' }}>
                  {salaryInsights.bestConverting?.name || '-'}
                </div>
                <div className={styles.salaryStatSub}>
                  {salaryInsights.bestConverting ? `${salaryInsights.bestConverting.ctr.toFixed(1)}% CTR` : ''}
                </div>
              </div>
            </div>

            {/* Bar chart: views & applications by salary bracket */}
            {mounted && salaryInsights.bracketData.length > 0 && (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={salaryInsights.bracketData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={72} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                  <Bar dataKey="views" fill="#FFD700" name="Views" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="applications" fill="#3b82f6" name="Applications" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* Salary performance table */}
            {salaryInsights.jobTable.length > 0 && (
              <div className={styles.tableWrap} style={{ marginTop: '1rem' }}>
                <table className={styles.performanceTable}>
                  <thead>
                    <tr>
                      <th>Job Title</th>
                      <th>Salary</th>
                      <th>Views</th>
                      <th>Apps</th>
                      <th>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryInsights.jobTable.map((row: any) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/my-jobs/${row.id}/applications`} className={styles.jobTitleLink}>
                            {row.title}
                          </Link>
                        </td>
                        <td className={styles.salaryCell}>{row.salaryRange}</td>
                        <td>{row.views.toLocaleString()}</td>
                        <td>{row.apps}</td>
                        <td>{row.ctr.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

        {/* Candidate Demographics */}
        {activeTab === 'market' && demographics && (
          <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Candidate Demographics</h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.5rem 0 1rem' }}>
              Insights from {demographics.totalApplicants} applicant profile{demographics.totalApplicants !== 1 ? 's' : ''}
            </p>

            <div className={styles.demographicsGrid}>
              {/* UK Region Breakdown */}
              <div className={styles.demographicsPanel}>
                <h3 className={styles.demographicsSubtitle}>UK Region Breakdown</h3>
                {mounted && demographics.regionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, demographics.regionData.length * 32)}>
                    <BarChart data={demographics.regionData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={100} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: any) => [`${value} applicant${value !== 1 ? 's' : ''}`]}
                      />
                      <Bar dataKey="value" fill="#FFD700" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={styles.chartEmptySmall}>No location data available</div>
                )}
              </div>

              {/* Experience Level Breakdown */}
              <div className={styles.demographicsPanel}>
                <h3 className={styles.demographicsSubtitle}>Experience Levels</h3>
                {mounted && demographics.experienceData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={demographics.experienceData}
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          innerRadius={35}
                          dataKey="value"
                          paddingAngle={2}
                          isAnimationActive={true}
                          animationDuration={800}
                          animationEasing="ease-out"
                        >
                          {demographics.experienceData.map((entry: any, i: number) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          formatter={(value: any, name: any) => [`${value} applicant${value !== 1 ? 's' : ''}`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className={styles.legendRow}>
                      {demographics.experienceData.map((entry: any) => (
                        <div key={entry.name} className={styles.legendItem}>
                          <div className={styles.legendDot} style={{ background: entry.fill }} />
                          <span>{entry.name} ({entry.value})</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={styles.chartEmptySmall}>No experience data available</div>
                )}
              </div>

              {/* Age Distribution */}
              <div className={styles.demographicsPanel}>
                <h3 className={styles.demographicsSubtitle}>Age Distribution</h3>
                {demographics.ageProvidedCount > 0 && demographics.totalApplicants > demographics.ageProvidedCount && (
                  <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '-0.25rem 0 0.5rem' }}>
                    {demographics.ageProvidedCount} of {demographics.totalApplicants} applicants provided age data
                  </p>
                )}
                {mounted && demographics.ageData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={demographics.ageData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: any) => [`${value} applicant${value !== 1 ? 's' : ''}`]}
                      />
                      <Bar dataKey="value" fill="#FFD700" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={styles.chartEmptySmall}>No date of birth data available</div>
                )}
              </div>

              {/* Nationality Breakdown */}
              <div className={styles.demographicsPanel}>
                <h3 className={styles.demographicsSubtitle}>Nationality Breakdown</h3>
                {demographics.nationalityProvidedCount > 0 && demographics.totalApplicants > demographics.nationalityProvidedCount && (
                  <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '-0.25rem 0 0.5rem' }}>
                    {demographics.nationalityProvidedCount} of {demographics.totalApplicants} applicants provided nationality data
                  </p>
                )}
                {mounted && demographics.nationalityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, demographics.nationalityData.length * 28)}>
                    <BarChart data={demographics.nationalityData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={100} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: any) => [`${value} applicant${value !== 1 ? 's' : ''}`]}
                      />
                      <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={styles.chartEmptySmall}>No nationality data available</div>
                )}
              </div>

              {/* Top 10 Skills */}
              <div className={styles.demographicsPanel}>
                <h3 className={styles.demographicsSubtitle}>Top Skills</h3>
                {mounted && demographics.topSkills.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, demographics.topSkills.length * 28)}>
                    <BarChart data={demographics.topSkills} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={110} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: any) => [`${value} applicant${value !== 1 ? 's' : ''}`]}
                      />
                      <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={styles.chartEmptySmall}>No skills data available</div>
                )}
              </div>

              {/* Profile Completeness */}
              <div className={styles.demographicsPanel}>
                <h3 className={styles.demographicsSubtitle}>Profile Completeness</h3>
                <div className={styles.completenessWrap}>
                  <div className={styles.completenessCircle}>
                    <svg viewBox="0 0 100 100" className={styles.completenessSvg}>
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke={demographics.completenessPercent >= 70 ? '#16a34a' : demographics.completenessPercent >= 40 ? '#f59e0b' : '#dc2626'}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${demographics.completenessPercent * 2.639} ${263.9 - demographics.completenessPercent * 2.639}`}
                        strokeDashoffset="66"
                        style={{ transition: 'stroke-dasharray 0.5s ease' }}
                      />
                    </svg>
                    <div className={styles.completenessValue}>{demographics.completenessPercent}%</div>
                  </div>
                  <p className={styles.completenessLabel}>
                    {demographics.completeProfiles} of {demographics.totalApplicants} applicants have a complete profile
                  </p>
                  <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>
                    CV + photo + skills + work history
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}
        {activeTab === 'market' && !demographics && candidateProfiles.length === 0 && !loading && (
          <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Candidate Demographics</h2>
            </div>
                <div className={styles.chartEmpty}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: '0 0 0.25rem', color: '#94a3b8' }}>Not enough applicant data yet</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1' }}>This section populates as candidates apply to your jobs</p>
                  </div>
                </div>
          </div>
        )}

        {/* Best Time to Post */}
        {activeTab === 'traffic' && (
        <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Best Time to Post</h2>
          </div>
          {bestTimeToPost.hasEnoughData ? (
            <>
              {/* Peak Hours + Best Day summary row */}
              <div className={styles.btpSummaryRow}>
                <div className={styles.btpSummaryCard}>
                  <div className={styles.btpSummaryLabel}>Peak Hours</div>
                  <div className={styles.btpPeakList}>
                    {bestTimeToPost.peakHours.map((peak, i) => (
                      <div key={i} className={styles.btpPeakItem}>
                        <span className={styles.btpPeakRank}>{i + 1}</span>
                        <span className={styles.btpPeakLabel}>{peak.label}</span>
                        <span className={styles.btpPeakCount}>{peak.count} views</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={styles.btpSummaryCard}>
                  <div className={styles.btpSummaryLabel}>Best Day to Post</div>
                  <div className={styles.btpBestDay}>{bestTimeToPost.bestDay}</div>
                  <div className={styles.btpBestDaySub}>{bestTimeToPost.bestDayViews} total views</div>
                </div>
              </div>

              {/* Heatmap */}
              <div className={styles.btpHeatmapWrap}>
                <h3 className={styles.demographicsSubtitle} style={{ marginBottom: '0.5rem' }}>Views by Day &amp; Hour</h3>
                <div className={styles.btpHeatmap}>
                  {/* Hour labels header row */}
                  <div className={styles.btpHeatmapRow}>
                    <div className={styles.btpHeatmapDayLabel} />
                    {Array.from({ length: bestTimeToPost.hoursEnd - bestTimeToPost.hoursStart }, (_, i) => {
                      const h = bestTimeToPost.hoursStart + i
                      return (
                        <div key={h} className={styles.btpHeatmapHourLabel}>
                          {h % 3 === 0 ? (h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`) : ''}
                        </div>
                      )
                    })}
                  </div>
                  {/* Data rows */}
                  {bestTimeToPost.heatmapData.map(row => (
                    <div key={row.day} className={styles.btpHeatmapRow}>
                      <div className={styles.btpHeatmapDayLabel}>{row.day}</div>
                      {row.cells.map(cell => {
                        const bg = cell.count === 0
                          ? '#f8fafc'
                          : `color-mix(in srgb, #FFD700 ${Math.round((1 - cell.intensity) * 100)}%, #1e293b ${Math.round(cell.intensity * 100)}%)`
                        const textColor = cell.intensity > 0.5 ? '#fff' : '#64748b'
                        return (
                          <div
                            key={cell.hour}
                            className={styles.btpHeatmapCell}
                            style={{ background: bg, color: textColor }}
                            title={`${row.day} ${cell.hour}:00 — ${cell.count} view${cell.count !== 1 ? 's' : ''}`}
                          >
                            {cell.count > 0 ? cell.count : ''}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                <div className={styles.btpHeatmapLegend}>
                  <span>Less</span>
                  <div className={styles.btpLegendScale}>
                    {[0, 0.25, 0.5, 0.75, 1].map(intensity => (
                      <div
                        key={intensity}
                        className={styles.btpLegendSwatch}
                        style={{
                          background: intensity === 0
                            ? '#f8fafc'
                            : `color-mix(in srgb, #FFD700 ${Math.round((1 - intensity) * 100)}%, #1e293b ${Math.round(intensity * 100)}%)`,
                        }}
                      />
                    ))}
                  </div>
                  <span>More</span>
                </div>
              </div>

              {/* Applications by day bar chart */}
              <div style={{ marginTop: '1.5rem' }}>
                <h3 className={styles.demographicsSubtitle}>Applications by Day of Week</h3>
                {mounted && bestTimeToPost.appsByDayData.some(d => d.applications > 0) ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={bestTimeToPost.appsByDayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: any) => [`${value} application${value !== 1 ? 's' : ''}`]}
                      />
                      <Bar dataKey="applications" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Applications" isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={styles.chartEmptySmall}>No applications yet</div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.chartEmpty}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 0.25rem', color: '#94a3b8' }}>More data needed — patterns will emerge as candidates browse your jobs</p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1' }}>
                  {bestTimeToPost.totalViews} of {bestTimeToPost.minViews} minimum views collected
                </p>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Market Benchmarking */}
        {activeTab === 'market' && (
        <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Market Benchmarking</h2>
          </div>
          {marketBenchmark && marketBenchmark.hasEnoughData ? (
            <>
              {/* Your Jobs vs Platform Average — grouped bar chart */}
              <div className={styles.mbChartRow}>
                <div className={styles.mbChartWrap}>
                  <h3 className={styles.demographicsSubtitle}>Your Jobs vs Platform Average</h3>
                  {mounted && (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={marketBenchmark.comparisonChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                        <Bar dataKey="yours" fill="#FFD700" name="Your Average" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                        <Bar dataKey="platform" fill="#94a3b8" name="Platform Average" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" animationBegin={200} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Time to Fill comparison */}
                <div className={styles.mbTimeToFill}>
                  <h3 className={styles.demographicsSubtitle}>Time to First Application</h3>
                  <div className={styles.mbTtfGrid}>
                    <div className={styles.mbTtfCard}>
                      <div className={styles.mbTtfLabel}>Your Average</div>
                      <div className={styles.mbTtfValue} style={{ color: '#FFD700' }}>
                        {formatTimeToHire(marketBenchmark.myAvgTimeToFirst)}
                      </div>
                    </div>
                    <div className={styles.mbTtfCard}>
                      <div className={styles.mbTtfLabel}>Platform Average</div>
                      <div className={styles.mbTtfValue} style={{ color: '#64748b' }}>
                        {formatTimeToHire(marketBenchmark.platAvgTimeToFirst)}
                      </div>
                    </div>
                  </div>
                  {marketBenchmark.myAvgTimeToFirst !== null && marketBenchmark.platAvgTimeToFirst !== null && (
                    <div className={styles.mbTtfComparison}>
                      {marketBenchmark.myAvgTimeToFirst < marketBenchmark.platAvgTimeToFirst ? (
                        <span style={{ color: '#16a34a' }}>
                          &#9650; Your jobs attract applications faster than average
                        </span>
                      ) : marketBenchmark.myAvgTimeToFirst > marketBenchmark.platAvgTimeToFirst ? (
                        <span style={{ color: '#dc2626' }}>
                          &#9660; Your jobs take longer than average to get applications
                        </span>
                      ) : (
                        <span style={{ color: '#64748b' }}>On par with platform average</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Comparison table */}
              <h3 className={styles.demographicsSubtitle} style={{ marginTop: '1.5rem' }}>Job-by-Job Comparison</h3>
              <div className={styles.tableWrap}>
                <table className={styles.performanceTable}>
                  <thead>
                    <tr>
                      <th>Job Title</th>
                      <th>Salary</th>
                      <th>Market Avg Salary</th>
                      <th>Views</th>
                      <th>Market Avg Views</th>
                      <th>Applications</th>
                      <th>Market Avg Applications</th>
                      <th>Competitiveness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketBenchmark.jobComparisons.map((job: any) => (
                      <tr key={job.id}>
                        <td>
                          <Link href={`/my-jobs/${job.id}/applications`} className={styles.jobTitleLink}>
                            {job.title}
                          </Link>
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{job.sector}</div>
                        </td>
                        <td>{job.mySalaryDisplay}</td>
                        <td>
                          {job.hasSectorData && job.avgSalary > 0
                            ? `£${Math.round(job.avgSalary / 1000)}k`
                            : '-'}
                        </td>
                        <td>
                          <span>{job.myViews}</span>
                          {job.hasSectorData && (
                            <span className={job.myViews >= job.avgViews ? styles.mbArrowUp : styles.mbArrowDown}>
                              {job.myViews >= job.avgViews ? ' \u25B2' : ' \u25BC'}
                            </span>
                          )}
                        </td>
                        <td>{job.hasSectorData ? Math.round(job.avgViews) : '-'}</td>
                        <td>
                          <span>{job.myApps}</span>
                          {job.hasSectorData && (
                            <span className={job.myApps >= job.avgApps ? styles.mbArrowUp : styles.mbArrowDown}>
                              {job.myApps >= job.avgApps ? ' \u25B2' : ' \u25BC'}
                            </span>
                          )}
                        </td>
                        <td>{job.hasSectorData ? Math.round(job.avgApps * 10) / 10 : '-'}</td>
                        <td>
                          {job.hasSectorData && job.mySalary !== null ? (
                            <span className={
                              job.salaryBadge === 'above' ? styles.mbBadgeAbove
                                : job.salaryBadge === 'below' ? styles.mbBadgeBelow
                                : styles.mbBadgeAt
                            }>
                              {job.salaryBadge === 'above' ? 'Above Market'
                                : job.salaryBadge === 'below' ? 'Below Market'
                                : 'At Market'}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : marketBenchmark && !marketBenchmark.hasEnoughData ? (
            <div className={styles.chartEmpty}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 0.25rem', color: '#94a3b8' }}>
                  Not enough market data yet — benchmarks will become available as more employers join the platform
                </p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1' }}>
                  Need at least 5 jobs from other employers in the same sector (currently {marketBenchmark.currentMax})
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.chartEmpty}>
              <p style={{ color: '#94a3b8' }}>Post jobs to see market benchmarks</p>
            </div>
          )}
        </div>
        )}

        {/* Application Quality Score */}
        {activeTab === 'applications' && (
        <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Application Quality Score</h2>
          </div>
          {applicationQuality ? (
            <>
              <div className={styles.aqTopRow}>
                {/* Overall gauge */}
                <div className={styles.aqGaugeWrap}>
                  <div className={styles.completenessCircle}>
                    <svg viewBox="0 0 100 100" className={styles.completenessSvg}>
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke={applicationQuality.avgPercent >= 70 ? '#16a34a' : applicationQuality.avgPercent >= 40 ? '#f59e0b' : '#dc2626'}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${applicationQuality.avgPercent * 2.639} ${263.9 - applicationQuality.avgPercent * 2.639}`}
                        strokeDashoffset="66"
                        style={{ transition: 'stroke-dasharray 0.5s ease' }}
                      />
                    </svg>
                    <div className={styles.completenessValue}>{applicationQuality.avgPercent}%</div>
                  </div>
                  <div className={styles.aqGaugeLabel}>Average Quality Score</div>
                  <div className={styles.aqGaugeSub}>Across {applicationQuality.totalScored} application{applicationQuality.totalScored !== 1 ? 's' : ''}</div>
                </div>

                {/* Top 3 applicants */}
                <div className={styles.aqTopApplicants}>
                  <h3 className={styles.demographicsSubtitle}>Top Applicants</h3>
                  {applicationQuality.topApplicants.map((applicant, i) => (
                    <div key={i} className={styles.aqApplicantCard}>
                      <div className={styles.aqApplicantRank}>{i + 1}</div>
                      <div className={styles.aqApplicantInfo}>
                        <div className={styles.aqApplicantName}>{applicant.name}</div>
                        <div className={styles.aqApplicantJob}>Applied for: {applicant.jobTitle}</div>
                        <div className={styles.aqApplicantBreakdown}>
                          <span title="Skills match">Skills {applicant.skills}%</span>
                          <span title="Experience match">Experience {applicant.experience}%</span>
                          <span title="Location match">Location {applicant.location}%</span>
                          <span title="Sector match">Sector {applicant.sector}%</span>
                        </div>
                      </div>
                      <div
                        className={styles.aqApplicantScore}
                        style={{
                          color: applicant.matchPercent >= 70 ? '#16a34a' : applicant.matchPercent >= 40 ? '#f59e0b' : '#dc2626',
                        }}
                      >
                        {applicant.matchPercent}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-job breakdown */}
              {applicationQuality.jobScores.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h3 className={styles.demographicsSubtitle}>Quality by Job</h3>
                  <div className={styles.aqJobList}>
                    {applicationQuality.jobScores.map((job: any) => {
                      const barColor = job.avgPercent >= 70 ? '#16a34a' : job.avgPercent >= 40 ? '#f59e0b' : '#dc2626'
                      return (
                        <div key={job.id} className={styles.aqJobRow}>
                          <div className={styles.aqJobTitle}>
                            <Link href={`/my-jobs/${job.id}/applications`} className={styles.jobTitleLink}>
                              {job.title}
                            </Link>
                            <span className={styles.aqJobApps}>{job.applicantCount} applicant{job.applicantCount !== 1 ? 's' : ''}</span>
                          </div>
                          <div className={styles.aqJobBarWrap}>
                            <div
                              className={styles.aqJobBar}
                              style={{ width: `${job.avgPercent}%`, background: barColor }}
                            />
                          </div>
                          <div className={styles.aqJobPercent} style={{ color: barColor }}>
                            {job.avgPercent}%
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className={styles.chartEmpty}>
              <p style={{ color: '#94a3b8' }}>No applications to analyse yet</p>
            </div>
          )}
        </div>
        )}

        {/* Cost Per Hire */}
        {activeTab === 'market' && costPerHire && (
          <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Cost Per Hire</h2>
            </div>
            <div className={styles.cphTopRow}>
              {/* Main figure */}
              <div className={styles.cphMainFigure}>
                {costPerHire.costPerHire !== null ? (
                  <>
                    <div className={styles.cphBigNumber}>
                      £{costPerHire.costPerHire.toFixed(2)}
                    </div>
                    <div className={styles.cphBigLabel}>per hire</div>
                    <div className={styles.cphComparison}>
                      Industry average: <strong>£3,000–£5,000</strong> per hire
                    </div>
                    {costPerHire.costPerHire < 3000 && (
                      <div className={styles.cphSaving}>
                        You&apos;re saving up to <strong>£{Math.round(3000 - costPerHire.costPerHire).toLocaleString()}</strong> per hire vs industry average
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className={styles.cphBigNumber} style={{ fontSize: '1.4rem', color: '#64748b' }}>
                      £{costPerHire.totalCost.toFixed(2)} spent
                    </div>
                    <div className={styles.cphBigLabel}>Make your first hire to see your cost per hire</div>
                  </>
                )}
              </div>

              {/* Breakdown cards */}
              <div className={styles.cphBreakdown}>
                <div className={styles.cphBreakdownCard}>
                  <div className={styles.cphBreakdownLabel}>Total Spent</div>
                  <div className={styles.cphBreakdownValue}>£{costPerHire.totalCost.toFixed(2)}</div>
                  <div className={styles.cphBreakdownSub}>{costPerHire.totalMonths} month{costPerHire.totalMonths !== 1 ? 's' : ''} × £29.99</div>
                </div>
                <div className={styles.cphBreakdownCard}>
                  <div className={styles.cphBreakdownLabel}>Total Hires</div>
                  <div className={styles.cphBreakdownValue} style={{ color: costPerHire.totalHires > 0 ? '#16a34a' : '#64748b' }}>
                    {costPerHire.totalHires}
                  </div>
                  <div className={styles.cphBreakdownSub}>Through the platform</div>
                </div>
                <div className={styles.cphBreakdownCard}>
                  <div className={styles.cphBreakdownLabel}>Member Since</div>
                  <div className={styles.cphBreakdownValue} style={{ fontSize: '1rem' }}>{costPerHire.memberSince}</div>
                  <div className={styles.cphBreakdownSub}>£29.99/month subscription</div>
                </div>
              </div>
            </div>

            {/* Cumulative chart */}
            {mounted && costPerHire.chartData.length > 1 && (
              <div style={{ marginTop: '1.25rem' }}>
                <h3 className={styles.demographicsSubtitle}>Cumulative Cost vs Hires</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={costPerHire.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis
                      yAxisId="cost"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v: number) => `£${v}`}
                    />
                    <YAxis
                      yAxisId="hires"
                      orientation="right"
                      tick={{ fontSize: 10, fill: '#16a34a' }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: any, name: any) => [
                        name === 'cost' ? `£${value}` : value,
                        name === 'cost' ? 'Total Cost' : 'Total Hires',
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                    <Line yAxisId="cost" type="monotone" dataKey="cost" stroke="#FFD700" strokeWidth={2} dot={false} name="Total Cost" isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                    <Line yAxisId="hires" type="stepAfter" dataKey="hires" stroke="#16a34a" strokeWidth={2} dot={false} name="Total Hires" isAnimationActive={true} animationDuration={800} animationEasing="ease-out" animationBegin={200} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

          </div>
        )}

        {/* Job Description Performance */}
        {activeTab === 'jobs' && (
        <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Job Description Performance</h2>
          </div>
          {descriptionPerformance ? (
            <>
              {/* Tip card */}
              <div className={styles.jdpTipCard}>
                <div className={styles.jdpTipIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
                <div className={styles.jdpTipText}>{descriptionPerformance.tip}</div>
              </div>

              <div className={styles.jdpTopRow}>
                {/* Description length chart */}
                <div>
                  <h3 className={styles.demographicsSubtitle}>Description Length vs Performance</h3>
                  {mounted && descriptionPerformance.lengthChartData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={descriptionPerformance.lengthChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
                          <Bar dataKey="avgViews" fill="#FFD700" name="Avg Views" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                          <Bar dataKey="avgApps" fill="#3b82f6" name="Avg Applications" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" animationBegin={200} />
                        </BarChart>
                      </ResponsiveContainer>
                      {descriptionPerformance.bestGroup && (
                        <div className={styles.jdpBestBadge}>
                          Best: <strong>{descriptionPerformance.bestGroup.name}</strong> ({descriptionPerformance.bestGroup.jobCount} job{descriptionPerformance.bestGroup.jobCount !== 1 ? 's' : ''})
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={styles.chartEmptySmall}>Not enough variation in description lengths</div>
                  )}
                </div>

                {/* Keywords */}
                <div>
                  <h3 className={styles.demographicsSubtitle}>Top Keywords by Application Rate</h3>
                  {descriptionPerformance.keywords.length > 0 ? (
                    <div className={styles.jdpKeywords}>
                      {descriptionPerformance.keywords.map(kw => (
                        <span
                          key={kw.word}
                          className={`${styles.jdpKeywordTag} ${
                            kw.sentiment === 'positive' ? styles.jdpKeywordPositive
                              : kw.sentiment === 'negative' ? styles.jdpKeywordNegative
                              : styles.jdpKeywordNeutral
                          }`}
                          title={`Appears in ${kw.count} jobs, avg ${kw.avgApps} apps`}
                        >
                          {kw.word}
                          <span className={styles.jdpKeywordScore}>
                            {kw.sentiment === 'positive' ? '\u2191' : kw.sentiment === 'negative' ? '\u2193' : '–'}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.chartEmptySmall}>Post more jobs with varied descriptions to see keyword insights</div>
                  )}
                </div>
              </div>

              {/* Per-job table */}
              <div style={{ marginTop: '1.25rem' }}>
                <h3 className={styles.demographicsSubtitle}>Description Details</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.performanceTable}>
                    <thead>
                      <tr>
                        <th>Job Title</th>
                        <th>Words</th>
                        <th>Readability</th>
                        <th>Views</th>
                        <th>Apps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {descriptionPerformance.tableData.map((job: any) => (
                        <tr key={job.id}>
                          <td>
                            <Link href={`/my-jobs/${job.id}/applications`} className={styles.jobTitleLink}>
                              {job.title}
                            </Link>
                          </td>
                          <td>
                            <span className={
                              job.lengthGroup === 'Short' ? styles.jdpLengthShort
                                : job.lengthGroup === 'Long' ? styles.jdpLengthLong
                                : styles.jdpLengthMedium
                            }>
                              {job.wordCount}
                            </span>
                          </td>
                          <td>
                            <span className={
                              job.readability === 'Simple' ? styles.jdpReadSimple
                                : job.readability === 'Complex' ? styles.jdpReadComplex
                                : styles.jdpReadModerate
                            }>
                              {job.readability}
                            </span>
                          </td>
                          <td>{job.views.toLocaleString()}</td>
                          <td>{job.apps}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.chartEmpty}>
              <p style={{ color: '#94a3b8' }}>Post more jobs to see description performance patterns</p>
            </div>
          )}
        </div>
        )}

        {/* Retention Funnel */}
        {activeTab === 'jobs' && (
        <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Retention Funnel</h2>
          </div>
          {retentionData && retentionData.totalHired > 0 ? (
            <>
              <div className={styles.rfTopRow}>
                {/* Funnel */}
                <div className={styles.rfFunnelWrap}>
                  {retentionData.funnel.map((stage, i) => {
                    const maxVal = retentionData.funnel[0].value || 1
                    const dropOff = i > 0 && retentionData.funnel[i - 1].value > 0
                      ? Math.round((1 - stage.value / retentionData.funnel[i - 1].value) * 100)
                      : null
                    return (
                      <div key={stage.name} className={styles.rfFunnelStage}>
                        <span className={styles.rfFunnelLabel}>{stage.name}</span>
                        <div className={styles.rfFunnelBarWrap}>
                          <div
                            className={styles.rfFunnelBar}
                            style={{
                              width: `${maxVal > 0 ? (stage.value / maxVal) * 100 : 0}%`,
                              background: stage.color,
                            }}
                          />
                        </div>
                        <span className={styles.rfFunnelValue}>{stage.value}</span>
                        {dropOff !== null && dropOff > 0 && (
                          <span className={styles.rfDropOff}>-{dropOff}%</span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Retention rate gauge + avg retention */}
                <div className={styles.rfStatsCol}>
                  <div className={styles.rfGaugeCard}>
                    <div className={styles.completenessCircle}>
                      <svg viewBox="0 0 100 100" className={styles.completenessSvg}>
                        <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          fill="none"
                          stroke={
                            retentionData.retentionRate !== null
                              ? retentionData.retentionRate >= 70 ? '#16a34a' : retentionData.retentionRate >= 40 ? '#f59e0b' : '#dc2626'
                              : '#e2e8f0'
                          }
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${(retentionData.retentionRate || 0) * 2.639} ${263.9 - (retentionData.retentionRate || 0) * 2.639}`}
                          strokeDashoffset="66"
                          style={{ transition: 'stroke-dasharray 0.5s ease' }}
                        />
                      </svg>
                      <div className={styles.completenessValue}>
                        {retentionData.retentionRate !== null ? `${retentionData.retentionRate}%` : '–'}
                      </div>
                    </div>
                    <div className={styles.aqGaugeLabel}>Retention Rate</div>
                    <div className={styles.aqGaugeSub}>
                      {retentionData.totalRetained} retained of {retentionData.totalHired} hired
                    </div>
                  </div>
                  {retentionData.avgRetentionDays !== null && (
                    <div className={styles.rfAvgRetention}>
                      <div className={styles.cphBreakdownLabel}>Avg Retention</div>
                      <div className={styles.cphBreakdownValue}>
                        {retentionData.avgRetentionDays > 30
                          ? `${Math.round(retentionData.avgRetentionDays / 30)} months`
                          : `${retentionData.avgRetentionDays} days`}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Prompt to update statuses if no retention data */}
              {!retentionData.hasRetentionData && (
                <div className={styles.rfPrompt}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>Update your hired candidates below to track retention. Mark whether each hire is still employed or has left.</span>
                </div>
              )}

              {/* Hire Timeline */}
              <div style={{ marginTop: '1rem' }}>
                <h3 className={styles.demographicsSubtitle}>Hire Timeline</h3>
                <div className={styles.rfTimeline}>
                  {retentionData.hiredApps.map((hire) => (
                    <div key={hire.applicationId} className={styles.rfTimelineItem}>
                      <div className={styles.rfTimelineDot} style={{
                        background: hire.currentStatus === 'retained' ? '#16a34a' : hire.currentStatus === 'left' ? '#dc2626' : '#e2e8f0',
                      }} />
                      <div className={styles.rfTimelineContent}>
                        <div className={styles.rfTimelineName}>{hire.candidateName}</div>
                        <div className={styles.rfTimelineJob}>{hire.jobTitle}</div>
                        <div className={styles.rfTimelineDate}>
                          Hired {new Date(hire.hireDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {hire.currentStatus === 'retained' && ` • ${hire.retentionDays > 30 ? `${Math.round(hire.retentionDays / 30)} months` : `${hire.retentionDays} days`}`}
                        </div>
                      </div>
                      <div className={styles.rfTimelineActions}>
                        {hire.currentStatus === 'unknown' ? (
                          <>
                            <button
                              className={styles.rfBtnRetained}
                              onClick={() => handleRetentionUpdate(hire.applicationId, 'retained')}
                            >
                              Still Employed
                            </button>
                            <button
                              className={styles.rfBtnLeft}
                              onClick={() => handleRetentionUpdate(hire.applicationId, 'left')}
                            >
                              Has Left
                            </button>
                          </>
                        ) : (
                          <span className={hire.currentStatus === 'retained' ? styles.rfStatusRetained : styles.rfStatusLeft}>
                            {hire.currentStatus === 'retained' ? 'Retained' : 'Left'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className={styles.chartEmpty}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 0.25rem', color: '#94a3b8' }}>No hires yet — retention tracking begins once you hire your first candidate through Hex</p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1' }}>Hire candidates and update their status to build your retention data</p>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Job Performance Table */}
        {activeTab === 'jobs' && (
        <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Job Performance</h2>
          </div>
          {jobPerformanceData.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.performanceTable}>
                <thead>
                  <tr>
                    {[
                      { key: 'title', label: 'Job Title' },
                      { key: 'status', label: 'Status' },
                      { key: 'viewCount', label: 'Views' },
                      { key: 'uniqueViewCount', label: 'Unique Views' },
                      { key: 'applicationCount', label: 'Applications' },
                      { key: 'interviewCount', label: 'Interviews' },
                      { key: 'hiredCount', label: 'Hired' },
                      { key: 'conversionRate', label: 'Conversion %' },
                      { key: 'ctr', label: 'CTR' },
                      { key: 'postedAt', label: 'Posted' },
                    ].map(col => (
                      <th
                        key={col.key}
                        className={sortField === col.key ? styles.sortActive : ''}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label} {sortField === col.key ? (sortDirection === 'asc' ? '\u2191' : '\u2193') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobPerformanceData.map((job: any) => (
                    <tr key={job.id}>
                      <td>
                        <Link href={`/my-jobs/${job.id}/applications`} className={styles.jobTitleLink}>
                          {job.title}
                        </Link>
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${getStatusClass(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td>{job.viewCount.toLocaleString()}</td>
                      <td>{job.uniqueViewCount.toLocaleString()}</td>
                      <td>{job.applicationCount}</td>
                      <td>{job.interviewCount}</td>
                      <td>{job.hiredCount}</td>
                      <td>{job.conversionRate}%</td>
                      <td>{job.ctr}%</td>
                      <td className={styles.dateCell}>
                        {job.postedAt
                          ? new Date(job.postedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <p>No jobs posted yet.</p>
              <Link href="/post-job" style={{ color: '#FFD700', fontWeight: 600, textDecoration: 'none' }}>Post your first job</Link>
            </div>
          )}
        </div>
        )}

        {/* Top Converting Jobs */}
        {activeTab === 'applications' && (
        <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Top Converting Jobs</h2>
          </div>
              {topConvertingJobs.length > 0 ? (
                <div style={{ paddingTop: '0.5rem' }}>
                  {topConvertingJobs.map((job, i) => {
                    const maxRate = parseFloat(topConvertingJobs[0]?.ctr) || 1
                    const rate = parseFloat(job.ctr)
                    return (
                      <div key={job.id} className={styles.topJobItem}>
                        <span className={styles.topJobRank}>{i + 1}</span>
                        <div className={styles.topJobInfo}>
                          <div className={styles.topJobTitle}>{job.title}</div>
                          <div className={styles.topJobMeta}>{job.viewCount} views &middot; {job.applicationCount} applications</div>
                          <div className={styles.topJobBarWrap}>
                            <div
                              className={styles.topJobBar}
                              style={{ width: `${(rate / maxRate) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className={styles.topJobCount}>{job.ctr}%</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className={styles.chartEmpty}>No applications yet</div>
              )}
        </div>
        )}

        {/* Recent Activity */}
        {activeTab === 'overview' && (
        <div className={`${styles.sectionCard}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Recent Activity</h2>
          </div>
              {activityFeed.length > 0 ? (
                <div className={styles.activityList}>
                  {activityFeed.map((activity, i) => (
                    <div key={i} className={styles.activityItem}>
                      <div className={styles.activityDot} style={{ background: activity.color }} />
                      <div className={styles.activityContent}>
                        <div className={styles.activityTitle}>{activity.title}</div>
                        <div className={styles.activityDesc}>{activity.description}</div>
                        <div className={styles.activityTime}>{formatRelativeTime(activity.time)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.chartEmpty}>No recent activity</div>
              )}
        </div>
        )}
      </div>
    </main>
  )
}

// Helper: format avg time to hire from milliseconds
function formatTimeToHire(ms: number | null): string {
  if (ms === null) return 'No data'
  const totalMinutes = Math.floor(ms / 60000)
  const totalHours = Math.floor(ms / 3600000)
  const totalDays = ms / 86400000

  if (totalDays < 1) {
    const h = totalHours
    const m = totalMinutes - h * 60
    if (h === 0) return `${m} min`
    return `${h} hr ${m} min`
  }
  if (totalDays <= 7) {
    const d = Math.floor(totalDays)
    const h = Math.floor((ms - d * 86400000) / 3600000)
    if (h === 0) return `${d} day${d !== 1 ? 's' : ''}`
    return `${d} day${d !== 1 ? 's' : ''} ${h} hr`
  }
  const d = Math.round(totalDays)
  return `${d} days`
}

// Helper: format relative time
function formatRelativeTime(isoDate: string): string {
  const now = new Date()
  const date = new Date(isoDate)
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  if (diffHours < 24) return `${diffHours} hr ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Helper: format chart date labels
function formatChartDate(dateStr: string, grouping: string): string {
  if (grouping === 'month') {
    const [, month] = dateStr.split('-')
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return monthNames[parseInt(month) - 1] || dateStr
  }
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
