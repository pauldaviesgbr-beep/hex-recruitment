'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Area,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Users, UserCheck, UserPlus,
  Briefcase, FileText, Target, Clock, PoundSterling,
  MessageSquare, BarChart3, Award, Lock,
  Download, Image, X,
} from 'lucide-react'
import styles from './page.module.css'

// ============================================================
// Types
// ============================================================

interface SparklinePoint { period: string; value: number }
interface KPIMetric { value: number; change: number; sparkline: SparklinePoint[] }

interface KPIData {
  totalUsers: KPIMetric
  activeUsers30d: KPIMetric
  newSignupsWeek: KPIMetric
  newSignupsMonth: KPIMetric
  totalActiveJobs: KPIMetric
  totalApplications: KPIMetric
  conversionRate: KPIMetric
  mrr: KPIMetric
  churnRate: KPIMetric
  avgTimeToHire: KPIMetric
  avgAppsPerJob: KPIMetric
}

interface UsersData {
  userGrowth: { period: string; candidates: number; employers: number }[]
  retentionCohorts: { cohort: string; size: number; retention: number[] }[]
  geoDistribution: { region: string; count: number }[]
  activeUsers: { dau: number; wau: number; mau: number }
  signupSource: null
  engagementHistogram: null
}

interface JobsData {
  jobsOverTime: { period: string; count: number }[]
  jobsBySector: { sector: string; count: number }[]
  jobsByLocation: { location: string; count: number }[]
  avgSalaryBySector: { sector: string; avgMin: number; avgMax: number; avgMid: number }[]
  salaryDistribution: { range: string; count: number }[]
  jobTypeBreakdown: { type: string; count: number }[]
  popularTags: { tag: string; count: number }[]
  avgDaysActive: number | null
  filledVsExpiredRatio: { filled: number; expired: number; active: number }
}

interface ApplicationsData {
  funnel: { stage: string; count: number; dropOff: number }[]
  avgTimePerStage: { stage: string; avgDays: number }[]
  conversionBySector: { sector: string; applications: number; offers: number; rate: number }[]
  applicationsOverTime: { period: string; count: number }[]
  peakApplicationTimes: { dayOfWeek: number; hour: number; count: number }[]
  successRateByExperience: null
}

interface RevenueData {
  mrrOverTime: { period: string; mrr: number; standard: number; professional: number }[]
  revenueByTier: { period: string; mrr: number; standard: number; professional: number }[]
  trialConversion: { totalTrials: number; converted: number; rate: number }
  arpe: number
  churnOverTime: { period: string; churnRate: number; churned: number; total: number }[]
  ltvEstimate: number
  revenueForecast: { period: string; projected: number }[]
}

interface EngagementData {
  messagesOverTime: { period: string; count: number }[]
  avgResponseTime: null
  reviewsOverTime: { period: string; count: number; avgRating: number }[]
  mostReviewedCompanies: { company: string; reviewCount: number; avgRating: number }[]
  searchQueries: null
  pageViews: null
  errorRate: null
}

interface BenchmarksData {
  appsPerJob: { platform: number; industryBenchmark: number }
  timeToHire: { platform: number; industryBenchmark: number }
  costPerHire: null
}

// ============================================================
// Constants
// ============================================================

type TabKey = 'kpi' | 'users' | 'jobs' | 'applications' | 'revenue' | 'engagement' | 'benchmarks'
type RangeKey = '7d' | '30d' | '90d' | '12m' | 'all'

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'kpi', label: 'Key Metrics', icon: TrendingUp },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'jobs', label: 'Job Market', icon: Briefcase },
  { key: 'applications', label: 'Applications', icon: FileText },
  { key: 'revenue', label: 'Revenue', icon: PoundSterling },
  { key: 'engagement', label: 'Engagement', icon: MessageSquare },
  { key: 'benchmarks', label: 'Benchmarks', icon: Target },
]

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: '12m', label: '12 Months' },
  { key: 'all', label: 'All Time' },
]

const COLORS = {
  primary: '#FFE500',
  secondary: '#3b82f6',
  tertiary: '#8b5cf6',
  quaternary: '#f59e0b',
  quinary: '#06b6d4',
  success: '#16a34a',
  danger: '#dc2626',
  navy: '#1e293b',
  slate: '#64748b',
  grid: '#e2e8f0',
}

const PIE_COLORS = ['#FFE500', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#ec4899', '#f97316']

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: 'none',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '0.78rem',
  padding: '6px 10px',
}

// ============================================================
// Utility Functions
// ============================================================

function formatPeriod(p: any): string {
  const s = String(p || '')
  if (!s) return ''
  // YYYY-MM -> "Jan 25"
  if (s.length === 7) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const [yr, mo] = s.split('-')
    return `${months[parseInt(mo) - 1]} ${yr.slice(2)}`
  }
  // YYYY-MM-DD -> "Jan 15"
  if (s.length === 10) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const d = new Date(s)
    return `${months[d.getMonth()]} ${d.getDate()}`
  }
  return s
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatCurrency(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function exportCSV(data: Record<string, any>[], filename: string) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h]
      if (val === null || val === undefined) return ''
      const str = String(val)
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
    })
  )
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `hex-analytics-${filename}-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

async function exportPNG(ref: React.RefObject<HTMLDivElement | null>, filename: string) {
  if (!ref.current) return
  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(ref.current, { backgroundColor: '#ffffff', scale: 2 })
    const link = document.createElement('a')
    link.download = `hex-analytics-${filename}-${new Date().toISOString().split('T')[0]}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (err) {
    console.error('PNG export failed:', err)
  }
}

// ============================================================
// Insights Computation
// ============================================================

function computeInsights(data: Record<string, any>[], valueKey?: string) {
  if (!data || data.length < 2) return null
  const keys = Object.keys(data[0])
  const numericKeys = keys.filter(k => typeof data[0][k] === 'number')
  const vKey = valueKey || numericKeys[0]
  if (!vKey) return null
  const labelKey = keys.find(k => k === 'period') || keys.find(k => typeof data[0][k] === 'string') || keys[0]
  const entries = data.map(d => ({ val: Number(d[vKey]) || 0, label: String(d[labelKey] || '') }))
  let highIdx = 0, lowIdx = 0
  entries.forEach((e, i) => {
    if (e.val > entries[highIdx].val) highIdx = i
    if (e.val < entries[lowIdx].val) lowIdx = i
  })
  const sum = entries.reduce((s, e) => s + e.val, 0)
  const avg = sum / entries.length
  const mid = Math.floor(entries.length / 2)
  const firstHalfAvg = entries.slice(0, mid).reduce((s, e) => s + e.val, 0) / (mid || 1)
  const secondHalfAvg = entries.slice(mid).reduce((s, e) => s + e.val, 0) / ((entries.length - mid) || 1)
  const trendPct = firstHalfAvg > 0 ? Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100) : 0
  const trend: 'up' | 'down' | 'stable' = trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'stable'
  return {
    highest: { value: entries[highIdx].val, label: entries[highIdx].label },
    lowest: { value: entries[lowIdx].val, label: entries[lowIdx].label },
    average: Math.round(avg * 100) / 100,
    trend,
    trendPct,
  }
}

// ============================================================
// Sub-Components
// ============================================================

function ChartCard({
  title, subtitle, children, csvData, csvFilename, fullWidth, noData, noDataHint, loading,
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
  csvData?: Record<string, any>[]
  csvFilename?: string
  fullWidth?: boolean
  noData?: boolean
  noDataHint?: string
  loading?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const canExpand = !noData && !loading && !!csvData && csvData.length > 0

  if (loading) {
    return (
      <div className={`${styles.chartCard} ${fullWidth ? styles.fullWidth : ''}`}>
        <div className={`${styles.skeleton} ${styles.skeletonChart}`} />
      </div>
    )
  }

  if (noData) {
    return (
      <div className={`${styles.chartCard} ${fullWidth ? styles.fullWidth : ''}`}>
        <div className={styles.chartHeader}>
          <div className={styles.chartTitleGroup}>
            <div className={styles.chartTitle}>{title}</div>
            {subtitle && <div className={styles.chartSubtitle}>{subtitle}</div>}
          </div>
        </div>
        <div className={styles.noData}>
          <Lock size={28} className={styles.noDataIcon} />
          <div className={styles.noDataText}>No data available</div>
          {noDataHint && <div className={styles.noDataHint}>{noDataHint}</div>}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`${styles.chartCard} ${fullWidth || isExpanded ? styles.fullWidth : ''} ${isExpanded ? styles.chartCardExpanded : ''}`}
      ref={ref}
    >
      <div
        className={styles.chartHeader}
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        style={canExpand ? { cursor: 'pointer' } : undefined}
      >
        <div className={styles.chartTitleGroup}>
          <div className={styles.chartTitle}>
            {title}
            {canExpand && <span className={styles.expandHint}>{isExpanded ? ' ▾' : ' ▸'}</span>}
          </div>
          {subtitle && <div className={styles.chartSubtitle}>{subtitle}</div>}
        </div>
        <div className={styles.chartActions} onClick={(e) => e.stopPropagation()}>
          {csvData && csvFilename && (
            <button className={styles.exportBtn} onClick={() => exportCSV(csvData, csvFilename)} title="Export CSV">
              <Download size={11} /> CSV
            </button>
          )}
          <button className={styles.exportBtn} onClick={() => exportPNG(ref, title.replace(/\s+/g, '-').toLowerCase())} title="Export PNG">
            <Image size={11} /> PNG
          </button>
          {isExpanded && (
            <button className={styles.closeExpandBtn} onClick={() => setIsExpanded(false)} title="Collapse">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {children}
      {isExpanded && csvData && (
        <div className={styles.expandedContent}>
          <InsightsPanel data={csvData} />
          <DataTable
            data={csvData}
            onExportCSV={() => exportCSV(csvData, csvFilename || title.toLowerCase().replace(/\s+/g, '-'))}
          />
        </div>
      )}
    </div>
  )
}

function KPICard({
  title, value, change, sparkline, icon: Icon, prefix, suffix, color, loading,
}: {
  title: string
  value: number
  change: number
  sparkline: SparklinePoint[]
  icon: any
  prefix?: string
  suffix?: string
  color: string
  loading?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (loading) {
    return <div className={`${styles.skeleton} ${styles.skeletonKpi}`} />
  }

  const displayValue = prefix
    ? `${prefix}${formatNumber(value)}`
    : suffix
      ? `${formatNumber(value)}${suffix}`
      : formatNumber(value)

  const changeClass = change > 0 ? styles.kpiChangePositive : change < 0 ? styles.kpiChangeNegative : styles.kpiChangeNeutral
  const changeText = change > 0 ? `+${change}%` : change < 0 ? `${change}%` : '0%'
  const fmtVal = (v: number) => prefix ? `${prefix}${v.toLocaleString()}` : suffix ? `${v.toLocaleString()}${suffix}` : v.toLocaleString()

  return (
    <div
      className={`${styles.kpiCard} ${isExpanded ? styles.kpiCardExpanded : styles.kpiCardClickable}`}
      onClick={() => !isExpanded && setIsExpanded(true)}
    >
      <div className={styles.kpiHeader}>
        <div>
          <div className={styles.kpiLabel}>{title}</div>
          <div className={styles.kpiValue}>{displayValue}</div>
          <div className={`${styles.kpiChange} ${changeClass}`}>
            {change > 0 ? <TrendingUp size={11} /> : change < 0 ? <TrendingDown size={11} /> : null}
            {changeText}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isExpanded && (
            <button
              className={styles.closeExpandBtn}
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false) }}
              title="Collapse"
            >
              <X size={14} />
            </button>
          )}
          <div className={styles.kpiIconWrapper} style={{ background: `${color}20`, color }}>
            <Icon size={16} />
          </div>
        </div>
      </div>
      {!isExpanded && sparkline.length > 0 && (
        <div className={styles.kpiSparkline}>
          <ResponsiveContainer width="100%" height={36}>
            <LineChart data={sparkline}>
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {isExpanded && (
        <div className={styles.expandedContent}>
          {sparkline.length > 0 && (
            <div className={styles.expandedChartArea}>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={sparkline}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                  <XAxis dataKey="period" fontSize={11} tickFormatter={formatPeriod} />
                  <YAxis fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={formatPeriod} formatter={(v: any) => fmtVal(Number(v))} />
                  <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} name={title} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <InsightsPanel data={sparkline} valueKey="value" formatValue={fmtVal} />
          <DataTable
            data={sparkline.map(p => ({ Period: formatPeriod(p.period), [title]: p.value }))}
            onExportCSV={() => exportCSV(sparkline.map(p => ({ period: p.period, value: p.value })), `kpi-${title.toLowerCase().replace(/\s+/g, '-')}`)}
          />
        </div>
      )}
    </div>
  )
}

function NoDataCard({ title, hint, fullWidth }: { title: string; hint?: string; fullWidth?: boolean }) {
  return (
    <ChartCard title={title} noData noDataHint={hint} fullWidth={fullWidth} />
  )
}

function DataTable({ data, onExportCSV }: { data: Record<string, any>[]; onExportCSV?: () => void }) {
  const [sortKey, setSortKey] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  if (!data || data.length === 0) return null

  const headers = Object.keys(data[0])
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...data].sort((a, b) => {
    if (!sortKey) return 0
    const va = a[sortKey], vb = b[sortKey]
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className={styles.dataTableWrapper}>
      <div className={styles.dataTableHeader}>
        <span className={styles.dataTableTitle}>Data Table</span>
        {onExportCSV && (
          <button className={styles.exportBtn} onClick={onExportCSV}>
            <Download size={11} /> Export CSV
          </button>
        )}
      </div>
      <div className={styles.dataTableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              {headers.map(h => (
                <th key={h} onClick={() => toggleSort(h)}>
                  {h} {sortKey === h ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 50).map((row, i) => (
              <tr key={i}>
                {headers.map(h => (
                  <td key={h}>
                    {typeof row[h] === 'number' ? row[h].toLocaleString() : String(row[h] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > 50 && (
        <div className={styles.dataTableFooter}>Showing 50 of {data.length} rows</div>
      )}
    </div>
  )
}

function InsightsPanel({ data, valueKey, formatValue }: {
  data: Record<string, any>[]
  valueKey?: string
  formatValue?: (v: number) => string
}) {
  const insights = computeInsights(data, valueKey)
  if (!insights) return null
  const fmt = formatValue || ((v: number) => v.toLocaleString())
  return (
    <div className={styles.insightsPanel}>
      <div className={styles.insightsTitle}>Key Insights</div>
      <div className={styles.insightsGrid}>
        <div className={styles.insightItem}>
          <TrendingUp size={14} className={styles.insightIconGreen} />
          <div>
            <div className={styles.insightLabel}>Highest</div>
            <div className={styles.insightValue}>{fmt(insights.highest.value)}</div>
            <div className={styles.insightSub}>{formatPeriod(insights.highest.label)}</div>
          </div>
        </div>
        <div className={styles.insightItem}>
          <TrendingDown size={14} className={styles.insightIconRed} />
          <div>
            <div className={styles.insightLabel}>Lowest</div>
            <div className={styles.insightValue}>{fmt(insights.lowest.value)}</div>
            <div className={styles.insightSub}>{formatPeriod(insights.lowest.label)}</div>
          </div>
        </div>
        <div className={styles.insightItem}>
          <BarChart3 size={14} className={styles.insightIconBlue} />
          <div>
            <div className={styles.insightLabel}>Average</div>
            <div className={styles.insightValue}>{fmt(insights.average)}</div>
          </div>
        </div>
        <div className={styles.insightItem}>
          {insights.trend === 'up' ? (
            <TrendingUp size={14} className={styles.insightIconGreen} />
          ) : insights.trend === 'down' ? (
            <TrendingDown size={14} className={styles.insightIconRed} />
          ) : (
            <BarChart3 size={14} className={styles.insightIconSlate} />
          )}
          <div>
            <div className={styles.insightLabel}>Trend</div>
            <div className={styles.insightValue}>
              {insights.trend === 'up' ? `+${insights.trendPct}%` : insights.trend === 'down' ? `${insights.trendPct}%` : 'Stable'}
            </div>
            <div className={styles.insightSub}>vs prior period</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function AdminAnalyticsPage() {
  const token = useAdminToken()
  const [activeTab, setActiveTab] = useState<TabKey>('kpi')
  const [dateRange, setDateRange] = useState<RangeKey>('30d')
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('month')
  const [loadingSection, setLoadingSection] = useState<string | null>(null)

  // Section data
  const [kpiData, setKpiData] = useState<KPIData | null>(null)
  const [usersData, setUsersData] = useState<UsersData | null>(null)
  const [jobsData, setJobsData] = useState<JobsData | null>(null)
  const [applicationsData, setApplicationsData] = useState<ApplicationsData | null>(null)
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null)
  const [engagementData, setEngagementData] = useState<EngagementData | null>(null)
  const [benchmarksData, setBenchmarksData] = useState<BenchmarksData | null>(null)

  // Track which sections have been fetched for this range
  const [fetchedSections, setFetchedSections] = useState<Record<string, string>>({})

  // Heatmap tooltip (used in applications section)
  const [heatmapTooltip, setHeatmapTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const fetchSection = useCallback(async (section: TabKey, range: RangeKey) => {
    if (!token) return
    setLoadingSection(section)
    try {
      const params = new URLSearchParams({ section, range })
      if (section === 'users') params.set('granularity', granularity)
      const res = await fetch(`/api/admin/analytics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      switch (section) {
        case 'kpi': setKpiData(data); break
        case 'users': setUsersData(data); break
        case 'jobs': setJobsData(data); break
        case 'applications': setApplicationsData(data); break
        case 'revenue': setRevenueData(data); break
        case 'engagement': setEngagementData(data); break
        case 'benchmarks': setBenchmarksData(data); break
      }
      setFetchedSections(prev => ({ ...prev, [`${section}-${range}`]: 'done' }))
    } catch (err) {
      console.error(`[Analytics] Failed to fetch ${section}:`, err)
    } finally {
      setLoadingSection(null)
    }
  }, [token, granularity])

  // Fetch on tab/range change (skip if already fetched)
  useEffect(() => {
    const key = `${activeTab}-${dateRange}`
    if (fetchedSections[key]) return
    fetchSection(activeTab, dateRange)
  }, [activeTab, dateRange, fetchedSections, fetchSection])

  // Re-fetch users when granularity changes
  useEffect(() => {
    if (activeTab === 'users') {
      fetchSection('users', dateRange)
    }
  }, [granularity]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset fetched sections when range changes
  const handleRangeChange = (range: RangeKey) => {
    setFetchedSections({})
    setDateRange(range)
  }

  const isLoading = (section: TabKey) => loadingSection === section

  // ============================================================
  // Section Renderers
  // ============================================================

  function renderKPI() {
    const l = isLoading('kpi')
    const d = kpiData
    const metrics: {
      key: keyof KPIData; title: string; icon: any; color: string; prefix?: string; suffix?: string
    }[] = [
      { key: 'totalUsers', title: 'Total Users', icon: Users, color: COLORS.primary },
      { key: 'activeUsers30d', title: 'Active Users (30d)', icon: UserCheck, color: COLORS.secondary },
      { key: 'newSignupsWeek', title: 'New Signups (Week)', icon: UserPlus, color: COLORS.success },
      { key: 'newSignupsMonth', title: 'New Signups (Month)', icon: TrendingUp, color: COLORS.tertiary },
      { key: 'totalActiveJobs', title: 'Active Jobs', icon: Briefcase, color: COLORS.quaternary },
      { key: 'totalApplications', title: 'Total Applications', icon: FileText, color: COLORS.quinary },
      { key: 'conversionRate', title: 'Conversion Rate', icon: Target, color: COLORS.primary, suffix: '%' },
      { key: 'mrr', title: 'MRR', icon: PoundSterling, color: COLORS.success, prefix: '£' },
      { key: 'churnRate', title: 'Churn Rate', icon: TrendingDown, color: COLORS.danger, suffix: '%' },
      { key: 'avgTimeToHire', title: 'Avg Time to Hire', icon: Clock, color: COLORS.secondary, suffix: 'd' },
    ]

    return (
      <div className={styles.kpiGrid}>
        {metrics.map(m => {
          const metric = d?.[m.key]
          return (
            <KPICard
              key={m.key}
              title={m.title}
              value={metric?.value ?? 0}
              change={metric?.change ?? 0}
              sparkline={metric?.sparkline ?? []}
              icon={m.icon}
              prefix={m.prefix}
              suffix={m.suffix}
              color={m.color}
              loading={l && !d}
            />
          )
        })}
      </div>
    )
  }

  function renderUsers() {
    const l = isLoading('users')
    const d = usersData

    return (
      <div className={styles.chartsGrid}>
        {/* User Growth — full width with granularity toggle */}
        <ChartCard
          title="User Growth"
          subtitle="New candidates and employers over time"
          fullWidth
          csvData={d?.userGrowth}
          csvFilename="user-growth"
          loading={l && !d}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            <div className={styles.granularityToggle}>
              {(['day', 'week', 'month'] as const).map(g => (
                <button
                  key={g}
                  className={`${styles.granBtn} ${granularity === g ? styles.granBtnActive : ''}`}
                  onClick={() => setGranularity(g)}
                >
                  {g === 'day' ? 'Daily' : g === 'week' ? 'Weekly' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>
          {d?.userGrowth && d.userGrowth.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={d.userGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="period" fontSize={11} tickFormatter={formatPeriod} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={formatPeriod} />
                <Legend />
                <Line type="monotone" dataKey="candidates" stroke={COLORS.primary} strokeWidth={2} dot={false} name="Candidates" />
                <Line type="monotone" dataKey="employers" stroke={COLORS.secondary} strokeWidth={2} dot={false} name="Employers" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No growth data yet</div></div>
          )}
        </ChartCard>

        {/* Retention Cohort — full width */}
        <ChartCard title="Retention Cohorts" subtitle="% of users active N months after signup" fullWidth loading={l && !d}>
          {d?.retentionCohorts && d.retentionCohorts.length > 0 ? (
            <div className={styles.cohortTableWrapper}>
              <table className={styles.cohortTable}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Cohort</th>
                    <th>Users</th>
                    <th>Month 0</th>
                    <th>Month 1</th>
                    <th>Month 2</th>
                    <th>Month 3</th>
                    <th>Month 4</th>
                    <th>Month 5</th>
                  </tr>
                </thead>
                <tbody>
                  {d.retentionCohorts.map(c => (
                    <tr key={c.cohort}>
                      <td className={styles.cohortLabel}>{formatPeriod(c.cohort)}</td>
                      <td className={styles.cohortSize}>{c.size}</td>
                      {Array.from({ length: 6 }, (_, i) => {
                        const val = c.retention[i]
                        if (val === undefined) return <td key={i}>—</td>
                        const intensity = val / 100
                        const bg = `rgba(255, 229, 0, ${intensity * 0.6})`
                        const color = intensity > 0.5 ? '#1e293b' : '#64748b'
                        return (
                          <td key={i}>
                            <span className={styles.cohortCell} style={{ background: bg, color }}>
                              {val}%
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No cohort data yet</div></div>
          )}
        </ChartCard>

        {/* Geographic Distribution */}
        <ChartCard
          title="Geographic Distribution"
          subtitle="Users by region"
          csvData={d?.geoDistribution}
          csvFilename="geo-distribution"
          loading={l && !d}
        >
          {d?.geoDistribution && d.geoDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(250, d.geoDistribution.length * 28)}>
              <BarChart data={d.geoDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="region" fontSize={11} width={100} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill={COLORS.secondary} radius={[0, 4, 4, 0]} name="Users" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No location data yet</div></div>
          )}
        </ChartCard>

        {/* Active Users DAU/WAU/MAU */}
        <ChartCard title="Active Users" subtitle="Daily, weekly, monthly active users" loading={l && !d}>
          {d?.activeUsers ? (
            <div className={styles.statCardsRow}>
              <div className={styles.statCard}>
                <div className={styles.statCardLabel}>DAU</div>
                <div className={styles.statCardValue}>{formatNumber(d.activeUsers.dau)}</div>
                <div className={styles.statCardSub}>Today</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statCardLabel}>WAU</div>
                <div className={styles.statCardValue}>{formatNumber(d.activeUsers.wau)}</div>
                <div className={styles.statCardSub}>Last 7 days</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statCardLabel}>MAU</div>
                <div className={styles.statCardValue}>{formatNumber(d.activeUsers.mau)}</div>
                <div className={styles.statCardSub}>Last 30 days</div>
              </div>
            </div>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No activity data yet</div></div>
          )}
        </ChartCard>

        {/* No data cards */}
        <NoDataCard title="Signup Sources" hint="Requires UTM tracking to be implemented" />
        <NoDataCard title="User Engagement Score" hint="Requires engagement scoring to be implemented" />
      </div>
    )
  }

  function renderJobs() {
    const l = isLoading('jobs')
    const d = jobsData

    return (
      <div className={styles.chartsGrid}>
        {/* Jobs posted over time */}
        <ChartCard title="Jobs Posted Over Time" csvData={d?.jobsOverTime} csvFilename="jobs-over-time" loading={l && !d}>
          {d?.jobsOverTime && d.jobsOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.jobsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="period" fontSize={11} tickFormatter={formatPeriod} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={formatPeriod} />
                <Bar dataKey="count" fill={COLORS.primary} radius={[4, 4, 0, 0]} name="Jobs" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No job data yet</div></div>
          )}
        </ChartCard>

        {/* Jobs by sector */}
        <ChartCard title="Jobs by Sector" csvData={d?.jobsBySector} csvFilename="jobs-by-sector" loading={l && !d}>
          {d?.jobsBySector && d.jobsBySector.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(280, d.jobsBySector.length * 24)}>
              <BarChart data={d.jobsBySector} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="sector" fontSize={10} width={110} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill={COLORS.secondary} radius={[0, 4, 4, 0]} name="Jobs" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No sector data yet</div></div>
          )}
        </ChartCard>

        {/* Jobs by location */}
        <ChartCard title="Jobs by Location (Top 20)" csvData={d?.jobsByLocation} csvFilename="jobs-by-location" loading={l && !d}>
          {d?.jobsByLocation && d.jobsByLocation.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(280, d.jobsByLocation.length * 22)}>
              <BarChart data={d.jobsByLocation} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="location" fontSize={10} width={100} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill={COLORS.tertiary} radius={[0, 4, 4, 0]} name="Jobs" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No location data yet</div></div>
          )}
        </ChartCard>

        {/* Avg salary by sector */}
        <ChartCard title="Average Salary by Sector" subtitle="Min/Max ranges" csvData={d?.avgSalaryBySector} csvFilename="salary-by-sector" loading={l && !d}>
          {d?.avgSalaryBySector && d.avgSalaryBySector.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(280, d.avgSalaryBySector.length * 30)}>
              <BarChart data={d.avgSalaryBySector} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis type="number" fontSize={11} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="sector" fontSize={10} width={110} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatCurrency(Number(v))} />
                <Bar dataKey="avgMin" fill={COLORS.secondary} radius={[0, 0, 0, 0]} name="Avg Min" stackId="salary" />
                <Bar dataKey="avgMax" fill={COLORS.primary} radius={[0, 4, 4, 0]} name="Avg Max" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No salary data yet</div></div>
          )}
        </ChartCard>

        {/* Salary distribution */}
        <ChartCard title="Salary Distribution" csvData={d?.salaryDistribution} csvFilename="salary-distribution" loading={l && !d}>
          {d?.salaryDistribution && d.salaryDistribution.some(s => s.count > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.salaryDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="range" fontSize={10} angle={-30} textAnchor="end" height={50} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill={COLORS.quinary} radius={[4, 4, 0, 0]} name="Jobs" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No salary data yet</div></div>
          )}
        </ChartCard>

        {/* Job type breakdown (donut) */}
        <ChartCard title="Job Type Breakdown" csvData={d?.jobTypeBreakdown} csvFilename="job-types" loading={l && !d}>
          {d?.jobTypeBreakdown && d.jobTypeBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={d.jobTypeBreakdown}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                  fontSize={11}
                >
                  {d.jobTypeBreakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No type data yet</div></div>
          )}
        </ChartCard>

        {/* Popular tags */}
        <ChartCard title="Popular Job Tags (Top 20)" csvData={d?.popularTags} csvFilename="popular-tags" loading={l && !d}>
          {d?.popularTags && d.popularTags.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(280, d.popularTags.length * 22)}>
              <BarChart data={d.popularTags} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="tag" fontSize={10} width={110} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill={COLORS.quaternary} radius={[0, 4, 4, 0]} name="Jobs" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No tag data yet</div></div>
          )}
        </ChartCard>

        {/* Filled vs Expired + Avg days active */}
        <ChartCard title="Job Status & Lifecycle" loading={l && !d}>
          {d ? (
            <div>
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
                <div className={styles.statCard} style={{ flex: 1 }}>
                  <div className={styles.statCardLabel}>Avg Days Active</div>
                  <div className={styles.statCardValue}>{d.avgDaysActive ?? '—'}</div>
                  <div className={styles.statCardSub}>before filled/archived</div>
                </div>
              </div>
              {(d.filledVsExpiredRatio.filled + d.filledVsExpiredRatio.expired + d.filledVsExpiredRatio.active) > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Active', value: d.filledVsExpiredRatio.active },
                        { name: 'Filled', value: d.filledVsExpiredRatio.filled },
                        { name: 'Expired', value: d.filledVsExpiredRatio.expired },
                      ]}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={75}
                      paddingAngle={2}
                      label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                      fontSize={11}
                    >
                      <Cell fill={COLORS.success} />
                      <Cell fill={COLORS.primary} />
                      <Cell fill={COLORS.slate} />
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No data yet</div></div>
          )}
        </ChartCard>
      </div>
    )
  }

  function renderApplications() {
    const l = isLoading('applications')
    const d = applicationsData

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    return (
      <div className={styles.chartsGrid}>
        {/* Application Funnel — full width */}
        <ChartCard title="Application Funnel" subtitle="Pipeline stages with drop-off rates" fullWidth loading={l && !d}>
          {d?.funnel && d.funnel.length > 0 ? (() => {
            const maxCount = Math.max(...d.funnel.map(f => f.count), 1)
            return (
              <div className={styles.funnelContainer}>
                {d.funnel.map((f, i) => (
                  <div className={styles.funnelRow} key={f.stage}>
                    <div className={styles.funnelLabel}>{f.stage}</div>
                    <div className={styles.funnelBarTrack}>
                      <div
                        className={styles.funnelBarFill}
                        style={{
                          width: `${(f.count / maxCount) * 100}%`,
                          background: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      >
                        {f.count > 0 && <span className={styles.funnelBarText}>{f.count}</span>}
                      </div>
                    </div>
                    <div className={styles.funnelCount}>{formatNumber(f.count)}</div>
                    <div className={styles.funnelDropoff}>
                      {i > 0 && f.dropOff > 0 ? `−${f.dropOff}%` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )
          })() : (
            <div className={styles.noData}><div className={styles.noDataText}>No funnel data yet</div></div>
          )}
        </ChartCard>

        {/* Avg time per stage */}
        <ChartCard title="Average Time per Stage" subtitle="Days in each pipeline stage" csvData={d?.avgTimePerStage} csvFilename="time-per-stage" loading={l && !d}>
          {d?.avgTimePerStage && d.avgTimePerStage.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.avgTimePerStage} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis type="number" fontSize={11} label={{ value: 'Days', position: 'insideBottomRight', offset: -5, fontSize: 10 }} />
                <YAxis type="category" dataKey="stage" fontSize={11} width={80} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `${v} days`} />
                <Bar dataKey="avgDays" fill={COLORS.tertiary} radius={[0, 4, 4, 0]} name="Avg Days" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No timing data yet</div></div>
          )}
        </ChartCard>

        {/* Conversion by sector */}
        <ChartCard title="Conversion by Sector" subtitle="Applications to offers" csvData={d?.conversionBySector} csvFilename="conversion-by-sector" loading={l && !d}>
          {d?.conversionBySector && d.conversionBySector.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(280, d.conversionBySector.length * 28)}>
              <BarChart data={d.conversionBySector} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="sector" fontSize={10} width={100} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="applications" fill={COLORS.secondary} name="Applications" />
                <Bar dataKey="offers" fill={COLORS.success} name="Offers" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No conversion data yet</div></div>
          )}
        </ChartCard>

        {/* Applications over time */}
        <ChartCard title="Applications Over Time" csvData={d?.applicationsOverTime} csvFilename="applications-over-time" loading={l && !d}>
          {d?.applicationsOverTime && d.applicationsOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={d.applicationsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="period" fontSize={11} tickFormatter={formatPeriod} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={formatPeriod} />
                <Line type="monotone" dataKey="count" stroke={COLORS.quaternary} strokeWidth={2} dot={false} name="Applications" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No application data yet</div></div>
          )}
        </ChartCard>

        {/* Peak application times (heatmap) — full width */}
        <ChartCard title="Peak Application Times" subtitle="Day of week vs hour of day (UTC)" fullWidth loading={l && !d}>
          {d?.peakApplicationTimes && d.peakApplicationTimes.length > 0 ? (() => {
            const maxCount = Math.max(...d.peakApplicationTimes.map(c => c.count), 1)
            return (
              <div className={styles.heatmapContainer}>
                <div className={styles.heatmapGrid}>
                  {/* Header row */}
                  <div className={styles.heatmapHeaderCell} />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className={styles.heatmapHeaderCell}>{h}</div>
                  ))}
                  {/* Data rows */}
                  {dayLabels.map((day, di) => (
                    <React.Fragment key={di}>
                      <div className={styles.heatmapRowLabel}>{day}</div>
                      {Array.from({ length: 24 }, (_, hi) => {
                        const cell = d.peakApplicationTimes.find(c => c.dayOfWeek === di && c.hour === hi)
                        const count = cell?.count || 0
                        const intensity = count / maxCount
                        const bg = count === 0
                          ? '#f8fafc'
                          : `rgba(255, 229, 0, ${0.15 + intensity * 0.85})`
                        return (
                          <div
                            key={`${di}-${hi}`}
                            className={styles.heatmapCell}
                            style={{ background: bg }}
                            onMouseEnter={(e) => {
                              setHeatmapTooltip({
                                x: e.clientX + 10,
                                y: e.clientY - 30,
                                text: `${day} ${hi}:00 — ${count} applications`,
                              })
                            }}
                            onMouseLeave={() => setHeatmapTooltip(null)}
                          />
                        )
                      })}
                    </React.Fragment>
                  ))}
                </div>
                {heatmapTooltip && (
                  <div className={styles.heatmapTooltip} style={{ left: heatmapTooltip.x, top: heatmapTooltip.y }}>
                    {heatmapTooltip.text}
                  </div>
                )}
                <div className={styles.heatmapLegend}>
                  <span>Less</span>
                  <div className={styles.heatmapLegendBar}>
                    {[0, 0.2, 0.4, 0.6, 0.8, 1].map(i => (
                      <div
                        key={i}
                        className={styles.heatmapLegendCell}
                        style={{ background: i === 0 ? '#f8fafc' : `rgba(255, 229, 0, ${0.15 + i * 0.85})` }}
                      />
                    ))}
                  </div>
                  <span>More</span>
                </div>
              </div>
            )
          })() : (
            <div className={styles.noData}><div className={styles.noDataText}>No application data yet</div></div>
          )}
        </ChartCard>

        {/* No data */}
        <NoDataCard title="Success Rate by Experience" hint="Requires experience level field on applications" />
      </div>
    )
  }

  function renderRevenue() {
    const l = isLoading('revenue')
    const d = revenueData

    return (
      <>
        {/* Revenue stat cards */}
        <div className={styles.revenueStatsRow}>
          <div className={styles.revenueStat}>
            <div className={styles.revenueStatLabel}>Current MRR</div>
            <div className={styles.revenueStatValue}>{d ? formatCurrency(d.mrrOverTime[d.mrrOverTime.length - 1]?.mrr || 0) : '—'}</div>
          </div>
          <div className={styles.revenueStat}>
            <div className={styles.revenueStatLabel}>ARPE</div>
            <div className={styles.revenueStatValue}>{d ? formatCurrency(d.arpe) : '—'}</div>
            <div className={styles.revenueStatSub}>Per employer/month</div>
          </div>
          <div className={styles.revenueStat}>
            <div className={styles.revenueStatLabel}>Trial Conversion</div>
            <div className={styles.revenueStatValue}>{d ? `${d.trialConversion.rate}%` : '—'}</div>
            <div className={styles.revenueStatSub}>{d ? `${d.trialConversion.converted}/${d.trialConversion.totalTrials} trials` : ''}</div>
          </div>
          <div className={styles.revenueStat}>
            <div className={styles.revenueStatLabel}>Est. LTV</div>
            <div className={styles.revenueStatValue}>{d ? (d.ltvEstimate >= 99999 ? '∞' : formatCurrency(d.ltvEstimate)) : '—'}</div>
            <div className={styles.revenueStatSub}>Per employer</div>
          </div>
        </div>

        <div className={styles.chartsGrid}>
          {/* MRR over time — full width */}
          <ChartCard title="Monthly Recurring Revenue" subtitle="MRR trend over 12 months" fullWidth csvData={d?.mrrOverTime} csvFilename="mrr-over-time" loading={l && !d}>
            {d?.mrrOverTime && d.mrrOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={d.mrrOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                  <XAxis dataKey="period" fontSize={11} tickFormatter={formatPeriod} />
                  <YAxis fontSize={11} tickFormatter={(v) => `£${v}`} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={formatPeriod} formatter={(v: any) => formatCurrency(Number(v))} />
                  <Line type="monotone" dataKey="mrr" stroke={COLORS.success} strokeWidth={2.5} dot={false} name="MRR" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.noData}><div className={styles.noDataText}>No revenue data yet</div></div>
            )}
          </ChartCard>

          {/* Revenue by tier (stacked bar) */}
          <ChartCard title="Revenue by Tier" subtitle="Standard vs Professional" csvData={d?.revenueByTier} csvFilename="revenue-by-tier" loading={l && !d}>
            {d?.revenueByTier && d.revenueByTier.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={d.revenueByTier}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                  <XAxis dataKey="period" fontSize={11} tickFormatter={formatPeriod} />
                  <YAxis fontSize={11} tickFormatter={(v) => `£${v}`} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={formatPeriod} formatter={(v: any) => formatCurrency(Number(v))} />
                  <Legend />
                  <Bar dataKey="standard" fill={COLORS.secondary} stackId="rev" name="Standard (£29.99)" />
                  <Bar dataKey="professional" fill={COLORS.primary} stackId="rev" name="Professional (£59.99)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.noData}><div className={styles.noDataText}>No tier data yet</div></div>
            )}
          </ChartCard>

          {/* Churn over time */}
          <ChartCard title="Churn Over Time" subtitle="Monthly cancellation rate" csvData={d?.churnOverTime} csvFilename="churn-over-time" loading={l && !d}>
            {d?.churnOverTime && d.churnOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={d.churnOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                  <XAxis dataKey="period" fontSize={11} tickFormatter={formatPeriod} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={formatPeriod} />
                  <Legend />
                  <Bar dataKey="churned" fill={COLORS.danger} name="Churned" opacity={0.3} />
                  <Line type="monotone" dataKey="churnRate" stroke={COLORS.danger} strokeWidth={2} dot={false} name="Churn Rate %" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.noData}><div className={styles.noDataText}>No churn data yet</div></div>
            )}
          </ChartCard>

          {/* Revenue forecast */}
          <ChartCard title="Revenue Forecast" subtitle="3-month linear projection" loading={l && !d}>
            {d?.mrrOverTime && d.revenueForecast && d.revenueForecast.length > 0 ? (() => {
              const lastActual = d.mrrOverTime.slice(-6).map(m => ({ period: m.period, actual: m.mrr, projected: null as number | null }))
              const projected = d.revenueForecast.map(f => ({ period: f.period, actual: null as number | null, projected: f.projected }))
              // Bridge: add last actual to projected line
              if (lastActual.length > 0) {
                projected.unshift({ period: lastActual[lastActual.length - 1].period, actual: null, projected: lastActual[lastActual.length - 1].actual })
              }
              const chartData = [...lastActual, ...projected.slice(1)]

              return (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                    <XAxis dataKey="period" fontSize={11} tickFormatter={formatPeriod} />
                    <YAxis fontSize={11} tickFormatter={(v) => `£${v}`} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={formatPeriod} formatter={(v: any) => v != null ? formatCurrency(Number(v)) : '—'} />
                    <Legend />
                    <Line type="monotone" dataKey="actual" stroke={COLORS.success} strokeWidth={2} dot={false} name="Actual MRR" connectNulls={false} />
                    <Line type="monotone" dataKey="projected" stroke={COLORS.success} strokeWidth={2} strokeDasharray="5 5" dot={false} name="Projected" connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              )
            })() : (
              <div className={styles.noData}><div className={styles.noDataText}>Not enough data for forecast</div></div>
            )}
          </ChartCard>
        </div>
      </>
    )
  }

  function renderEngagement() {
    const l = isLoading('engagement')
    const d = engagementData

    return (
      <div className={styles.chartsGrid}>
        {/* Messages over time */}
        <ChartCard title="Messages Sent Over Time" csvData={d?.messagesOverTime} csvFilename="messages-over-time" loading={l && !d}>
          {d?.messagesOverTime && d.messagesOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={d.messagesOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="period" fontSize={11} tickFormatter={formatPeriod} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={formatPeriod} />
                <Line type="monotone" dataKey="count" stroke={COLORS.secondary} strokeWidth={2} dot={false} name="Messages" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No message data yet</div></div>
          )}
        </ChartCard>

        {/* No data: avg response time */}
        <NoDataCard title="Average Response Time" hint="Requires message read/response timestamps" />

        {/* Reviews over time with avg rating — full width */}
        <ChartCard title="Reviews & Ratings Over Time" subtitle="Review count and average rating trend" fullWidth csvData={d?.reviewsOverTime} csvFilename="reviews-over-time" loading={l && !d}>
          {d?.reviewsOverTime && d.reviewsOverTime.some(r => r.count > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={d.reviewsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="period" fontSize={11} tickFormatter={formatPeriod} />
                <YAxis yAxisId="left" fontSize={11} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} domain={[0, 5]} tickFormatter={(v) => `${v}★`} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={formatPeriod} />
                <Legend />
                <Bar yAxisId="left" dataKey="count" fill={COLORS.primary} name="Reviews" opacity={0.7} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="avgRating" stroke={COLORS.quaternary} strokeWidth={2} dot={false} name="Avg Rating" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No review data yet</div></div>
          )}
        </ChartCard>

        {/* Most reviewed companies */}
        <ChartCard title="Most Reviewed Companies" subtitle="Top 10 by review count" csvData={d?.mostReviewedCompanies} csvFilename="most-reviewed" loading={l && !d}>
          {d?.mostReviewedCompanies && d.mostReviewedCompanies.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(280, d.mostReviewedCompanies.length * 28)}>
              <BarChart data={d.mostReviewedCompanies} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="company" fontSize={10} width={110} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any, name: any) => name === 'avgRating' ? `${v}★` : v} />
                <Bar dataKey="reviewCount" fill={COLORS.tertiary} radius={[0, 4, 4, 0]} name="Reviews" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noData}><div className={styles.noDataText}>No review data yet</div></div>
          )}
        </ChartCard>

        {/* No data cards */}
        <NoDataCard title="Top Search Queries" hint="Requires search query logging" />
        <NoDataCard title="Page Views by Section" hint="Requires analytics tracking (e.g. Google Analytics)" />
        <NoDataCard title="Error Rate" hint="Requires error logging infrastructure" />
      </div>
    )
  }

  function renderBenchmarks() {
    const l = isLoading('benchmarks')
    const d = benchmarksData

    if (l && !d) {
      return (
        <div className={styles.benchmarkGrid}>
          {[1, 2, 3].map(i => <div key={i} className={`${styles.skeleton} ${styles.skeletonChart}`} style={{ height: 200 }} />)}
        </div>
      )
    }

    const renderBenchmark = (
      title: string,
      platformVal: number,
      benchmarkVal: number,
      unit: string,
      betterIfHigher: boolean
    ) => {
      const maxVal = Math.max(platformVal, benchmarkVal, 1)
      const platformPct = (platformVal / maxVal) * 100
      const benchmarkPct = (benchmarkVal / maxVal) * 100
      const isBetter = betterIfHigher ? platformVal >= benchmarkVal : platformVal <= benchmarkVal
      const diff = betterIfHigher
        ? platformVal > 0 ? Math.round(((platformVal - benchmarkVal) / benchmarkVal) * 100) : 0
        : benchmarkVal > 0 ? Math.round(((benchmarkVal - platformVal) / benchmarkVal) * 100) : 0

      return (
        <div className={styles.benchmarkCard}>
          <div className={styles.benchmarkTitle}>{title}</div>
          <div className={styles.benchmarkRow}>
            <div className={styles.benchmarkLabel}>You</div>
            <div className={styles.benchmarkBarTrack}>
              <div className={styles.benchmarkBarFill} style={{ width: `${platformPct}%`, background: isBetter ? COLORS.success : COLORS.quaternary }} />
            </div>
            <div className={styles.benchmarkValue}>{platformVal}{unit}</div>
          </div>
          <div className={styles.benchmarkRow}>
            <div className={styles.benchmarkLabel}>Industry</div>
            <div className={styles.benchmarkBarTrack}>
              <div className={styles.benchmarkBarFill} style={{ width: `${benchmarkPct}%`, background: COLORS.slate }} />
            </div>
            <div className={styles.benchmarkValue}>{benchmarkVal}{unit}</div>
          </div>
          <div className={`${styles.benchmarkVerdict} ${isBetter ? styles.verdictGood : styles.verdictBad}`}>
            {isBetter ? <Award size={14} /> : <TrendingDown size={14} />}
            {isBetter ? `${diff}% above benchmark` : `${Math.abs(diff)}% below benchmark`}
          </div>
        </div>
      )
    }

    return (
      <div className={styles.benchmarkGrid}>
        {d?.appsPerJob ? renderBenchmark('Applications per Job', d.appsPerJob.platform, d.appsPerJob.industryBenchmark, '', true) : null}
        {d?.timeToHire ? renderBenchmark('Time to Hire', d.timeToHire.platform, d.timeToHire.industryBenchmark, ' days', false) : null}
        <div className={styles.benchmarkCard}>
          <div className={styles.benchmarkTitle}>Cost per Hire</div>
          <div className={styles.noData} style={{ minHeight: 120 }}>
            <Lock size={24} className={styles.noDataIcon} />
            <div className={styles.noDataText}>Not available</div>
            <div className={styles.noDataHint}>Requires cost tracking data</div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // Main Render
  // ============================================================

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Platform Analytics</h1>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabBar}>
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className={styles.tabIcon}><Icon size={15} /></span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Controls Row */}
      <div className={styles.controlsRow}>
        <div className={styles.dateRangeBar}>
          {RANGES.map(r => (
            <button
              key={r.key}
              className={`${styles.rangeBtn} ${dateRange === r.key ? styles.rangeBtnActive : ''}`}
              onClick={() => handleRangeChange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section Content */}
      {activeTab === 'kpi' && renderKPI()}
      {activeTab === 'users' && renderUsers()}
      {activeTab === 'jobs' && renderJobs()}
      {activeTab === 'applications' && renderApplications()}
      {activeTab === 'revenue' && renderRevenue()}
      {activeTab === 'engagement' && renderEngagement()}
      {activeTab === 'benchmarks' && renderBenchmarks()}
    </div>
  )
}
