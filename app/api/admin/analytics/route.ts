import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

// ============================================================
// Types
// ============================================================

interface SparklinePoint { period: string; value: number }

interface KPIMetric {
  value: number
  change: number
  sparkline: SparklinePoint[]
}

// ============================================================
// Utility Functions
// ============================================================

function getDateRange(range: string): { startDate: string; granularity: 'day' | 'week' | 'month' } {
  const now = new Date()
  let start: Date
  let granularity: 'day' | 'week' | 'month'
  switch (range) {
    case '7d':
      start = new Date(now.getTime() - 7 * 86400000)
      granularity = 'day'
      break
    case '30d':
      start = new Date(now.getTime() - 30 * 86400000)
      granularity = 'day'
      break
    case '90d':
      start = new Date(now.getTime() - 90 * 86400000)
      granularity = 'week'
      break
    case '12m':
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      granularity = 'month'
      break
    case 'all':
    default:
      start = new Date('2020-01-01')
      granularity = 'month'
      break
  }
  return { startDate: start.toISOString(), granularity }
}

function generatePeriodKeys(startDate: string, granularity: 'day' | 'week' | 'month'): string[] {
  const keys: string[] = []
  const start = new Date(startDate)
  const now = new Date()
  if (granularity === 'day') {
    const d = new Date(start)
    d.setHours(0, 0, 0, 0)
    while (d <= now) {
      keys.push(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 1)
    }
  } else if (granularity === 'week') {
    const d = new Date(start)
    d.setHours(0, 0, 0, 0)
    const day = d.getDay()
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
    while (d <= now) {
      keys.push(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 7)
    }
  } else {
    const d = new Date(start.getFullYear(), start.getMonth(), 1)
    while (d <= now) {
      keys.push(d.toISOString().slice(0, 7))
      d.setMonth(d.getMonth() + 1)
    }
  }
  return keys
}

function toPeriodKey(dateStr: string, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'month') return dateStr.slice(0, 7)
  if (granularity === 'day') return dateStr.slice(0, 10)
  // week: find Monday of that week
  const d = new Date(dateStr)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

function groupByPeriod(
  items: any[] | null,
  dateField: string,
  granularity: 'day' | 'week' | 'month',
  periodKeys: string[]
): { period: string; count: number }[] {
  const counts: Record<string, number> = {}
  periodKeys.forEach(k => { counts[k] = 0 })
  ;(items || []).forEach(item => {
    const d = item[dateField]
    if (d) {
      const key = toPeriodKey(d, granularity)
      if (counts[key] !== undefined) counts[key]++
    }
  })
  return periodKeys.map(k => ({ period: k, count: counts[k] || 0 }))
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

const STANDARD_PRICE = 29.99
const PROFESSIONAL_PRICE = 59.99

// ============================================================
// Section Handlers
// ============================================================

async function fetchKPI(db: any, startDate: string, granularity: 'day' | 'week' | 'month') {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString()
  const prevMonthStart = new Date(now.getTime() - 60 * 86400000).toISOString()
  const prevMonthEnd = new Date(now.getTime() - 30 * 86400000).toISOString()

  // 12 sparkline periods
  const sparkKeys = generatePeriodKeys(
    new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString(),
    'month'
  )
  const sparkStart = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString()

  const [
    candidatesAll, employersAll,
    candidatesRecent, employersRecent,
    candidatesPrevMonth, employersPrevMonth,
    candidatesWeek, employersWeek,
    candidatesPrevWeek, employersPrevWeek,
    candidatesMonth, employersMonth,
    activeJobs, prevActiveJobs,
    totalApps, prevApps,
    totalViews,
    subscriptions,
    offeredApps,
    candidatesSpark, employersSpark,
    jobsSpark, appsSpark,
    recentApplicants, recentPosters,
    prevApplicants, prevPosters,
  ] = await Promise.all([
    // Total users
    db.from('candidate_profiles').select('*', { count: 'exact', head: true }),
    db.from('employer_profiles').select('*', { count: 'exact', head: true }),
    // Active users last 30d (candidates who applied)
    db.from('job_applications').select('candidate_id').gte('applied_at', thirtyDaysAgo),
    // Active users last 30d (employers who posted)
    db.from('jobs').select('employer_id').gte('posted_at', thirtyDaysAgo),
    // Previous 30d candidates (30-60 days ago)
    db.from('candidate_profiles').select('*', { count: 'exact', head: true }).gte('created_at', sixtyDaysAgo).lt('created_at', thirtyDaysAgo),
    db.from('employer_profiles').select('*', { count: 'exact', head: true }).gte('created_at', sixtyDaysAgo).lt('created_at', thirtyDaysAgo),
    // Signups this week
    db.from('candidate_profiles').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    db.from('employer_profiles').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    // Signups prev week
    db.from('candidate_profiles').select('*', { count: 'exact', head: true }).gte('created_at', fourteenDaysAgo).lt('created_at', sevenDaysAgo),
    db.from('employer_profiles').select('*', { count: 'exact', head: true }).gte('created_at', fourteenDaysAgo).lt('created_at', sevenDaysAgo),
    // Signups this month
    db.from('candidate_profiles').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    db.from('employer_profiles').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    // Active jobs now
    db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    // Active jobs 30 days ago (approximate: posted before then, not expired)
    db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active').lt('posted_at', thirtyDaysAgo),
    // Total applications
    db.from('job_applications').select('*', { count: 'exact', head: true }),
    // Previous period applications
    db.from('job_applications').select('*', { count: 'exact', head: true }).lt('applied_at', thirtyDaysAgo),
    // Total views
    db.from('job_views').select('*', { count: 'exact', head: true }),
    // Subscriptions for MRR + churn
    db.from('employer_subscriptions').select('subscription_tier, subscription_status, created_at, cancel_at, trial_ends_at'),
    // Offered apps with timing
    db.from('job_applications').select('applied_at').eq('status', 'offered'),
    // Sparkline data
    db.from('candidate_profiles').select('created_at').gte('created_at', sparkStart),
    db.from('employer_profiles').select('created_at').gte('created_at', sparkStart),
    db.from('jobs').select('posted_at').gte('posted_at', sparkStart),
    db.from('job_applications').select('applied_at').gte('applied_at', sparkStart),
    // Active users - recent applicants
    db.from('job_applications').select('candidate_id').gte('applied_at', thirtyDaysAgo),
    db.from('jobs').select('employer_id').gte('posted_at', thirtyDaysAgo),
    // Active users - previous period
    db.from('job_applications').select('candidate_id').gte('applied_at', sixtyDaysAgo).lt('applied_at', thirtyDaysAgo),
    db.from('jobs').select('employer_id').gte('posted_at', sixtyDaysAgo).lt('posted_at', thirtyDaysAgo),
  ])

  const totalUsers = (candidatesAll.count || 0) + (employersAll.count || 0)
  const prevTotalUsers = totalUsers - ((candidatesMonth.count || 0) + (employersMonth.count || 0))

  // Active users: unique candidates who applied + unique employers who posted in last 30d
  const activeCanIds = new Set((candidatesRecent.data || []).map((r: any) => r.candidate_id))
  const activeEmpIds = new Set((employersRecent.data || []).map((r: any) => r.employer_id))
  const activeUsers30d = activeCanIds.size + activeEmpIds.size

  const prevActiveCanIds = new Set((prevApplicants.data || []).map((r: any) => r.candidate_id))
  const prevActiveEmpIds = new Set((prevPosters.data || []).map((r: any) => r.employer_id))
  const prevActiveUsers = prevActiveCanIds.size + prevActiveEmpIds.size

  const newSignupsWeek = (candidatesWeek.count || 0) + (employersWeek.count || 0)
  const prevSignupsWeek = (candidatesPrevWeek.count || 0) + (employersPrevWeek.count || 0)
  const newSignupsMonth = (candidatesMonth.count || 0) + (employersMonth.count || 0)
  const prevSignupsMonth = (candidatesPrevMonth.count || 0) + (employersPrevMonth.count || 0)

  const totalActiveJobsCount = activeJobs.count || 0
  const totalAppsCount = totalApps.count || 0
  const totalViewsCount = totalViews.count || 0
  const conversionRate = totalViewsCount > 0 ? Math.round((totalAppsCount / totalViewsCount) * 1000) / 10 : 0
  const prevAppsCount = prevApps.count || 0
  const newApps30d = totalAppsCount - prevAppsCount
  const prevConversion = totalViewsCount > 0 ? (prevAppsCount / Math.max(totalViewsCount, 1)) * 100 : 0

  // MRR calculation
  const subs = subscriptions.data || []
  const activeSubs = subs.filter((s: any) => s.subscription_status === 'active')
  const standardActive = activeSubs.filter((s: any) => s.subscription_tier === 'standard').length
  const proActive = activeSubs.filter((s: any) => s.subscription_tier === 'professional').length
  const mrr = Math.round((standardActive * STANDARD_PRICE + proActive * PROFESSIONAL_PRICE) * 100) / 100

  // Churn: canceled in last 30d / active at start of period
  const canceledLast30 = subs.filter((s: any) =>
    s.cancel_at && new Date(s.cancel_at) >= new Date(thirtyDaysAgo)
  ).length
  const activeAtStart = subs.filter((s: any) =>
    new Date(s.created_at) < new Date(thirtyDaysAgo) &&
    (!s.cancel_at || new Date(s.cancel_at) >= new Date(thirtyDaysAgo))
  ).length
  const churnRate = activeAtStart > 0 ? Math.round((canceledLast30 / activeAtStart) * 1000) / 10 : 0

  // Avg time to hire (days from applied_at to now for offered apps)
  const offeredList = offeredApps.data || []
  let avgTimeToHire = 0
  if (offeredList.length > 0) {
    const total = offeredList.reduce((sum: number, a: any) => {
      const days = (now.getTime() - new Date(a.applied_at).getTime()) / 86400000
      return sum + days
    }, 0)
    avgTimeToHire = Math.round(total / offeredList.length)
  }

  const avgAppsPerJob = totalActiveJobsCount > 0 ? Math.round((totalAppsCount / totalActiveJobsCount) * 10) / 10 : 0

  // Build sparklines
  const candSpark = groupByPeriod(candidatesSpark.data, 'created_at', 'month', sparkKeys)
  const empSpark = groupByPeriod(employersSpark.data, 'created_at', 'month', sparkKeys)
  const userSparkline = candSpark.map((c, i) => ({ period: c.period, value: c.count + (empSpark[i]?.count || 0) }))
  const jobSparkline = groupByPeriod(jobsSpark.data, 'posted_at', 'month', sparkKeys).map(j => ({ period: j.period, value: j.count }))
  const appSparkline = groupByPeriod(appsSpark.data, 'applied_at', 'month', sparkKeys).map(a => ({ period: a.period, value: a.count }))

  return {
    totalUsers: { value: totalUsers, change: pctChange(totalUsers, prevTotalUsers), sparkline: userSparkline },
    activeUsers30d: { value: activeUsers30d, change: pctChange(activeUsers30d, prevActiveUsers), sparkline: userSparkline },
    newSignupsWeek: { value: newSignupsWeek, change: pctChange(newSignupsWeek, prevSignupsWeek), sparkline: userSparkline },
    newSignupsMonth: { value: newSignupsMonth, change: pctChange(newSignupsMonth, prevSignupsMonth), sparkline: userSparkline },
    totalActiveJobs: { value: totalActiveJobsCount, change: pctChange(totalActiveJobsCount, prevActiveJobs.count || 0), sparkline: jobSparkline },
    totalApplications: { value: totalAppsCount, change: pctChange(newApps30d, Math.max(prevAppsCount, 1)), sparkline: appSparkline },
    conversionRate: { value: conversionRate, change: pctChange(conversionRate, prevConversion), sparkline: appSparkline },
    mrr: { value: mrr, change: 0, sparkline: [] },
    churnRate: { value: churnRate, change: 0, sparkline: [] },
    avgTimeToHire: { value: avgTimeToHire, change: 0, sparkline: [] },
    avgAppsPerJob: { value: avgAppsPerJob, change: 0, sparkline: [] },
  }
}

async function fetchUsers(db: any, startDate: string, granularity: 'day' | 'week' | 'month') {
  const now = new Date()
  const periodKeys = generatePeriodKeys(startDate, granularity)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString()

  const [candidates, employers, cohortCandidates, cohortApps, dauApps, dauJobs, wauApps, wauJobs, mauApps, mauJobs] = await Promise.all([
    db.from('candidate_profiles').select('created_at, location').gte('created_at', startDate),
    db.from('employer_profiles').select('created_at, location').gte('created_at', startDate),
    // Cohort: candidates from last 6 months
    db.from('candidate_profiles').select('user_id, created_at').gte('created_at', sixMonthsAgo),
    db.from('job_applications').select('candidate_id, applied_at').gte('applied_at', sixMonthsAgo),
    // DAU
    db.from('job_applications').select('candidate_id').gte('applied_at', todayStart),
    db.from('jobs').select('employer_id').gte('posted_at', todayStart),
    // WAU
    db.from('job_applications').select('candidate_id').gte('applied_at', weekAgo),
    db.from('jobs').select('employer_id').gte('posted_at', weekAgo),
    // MAU
    db.from('job_applications').select('candidate_id').gte('applied_at', monthAgo),
    db.from('jobs').select('employer_id').gte('posted_at', monthAgo),
  ])

  // User growth
  const candGrowth = groupByPeriod(candidates.data, 'created_at', granularity, periodKeys)
  const empGrowth = groupByPeriod(employers.data, 'created_at', granularity, periodKeys)
  const userGrowth = periodKeys.map((k, i) => ({
    period: k,
    candidates: candGrowth[i]?.count || 0,
    employers: empGrowth[i]?.count || 0,
  }))

  // Retention cohorts (6 months)
  const cohortMonths: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    cohortMonths.push(d.toISOString().slice(0, 7))
  }

  const candidatesByMonth: Record<string, Set<string>> = {}
  cohortMonths.forEach(m => { candidatesByMonth[m] = new Set() })
  ;(cohortCandidates.data || []).forEach((c: any) => {
    const m = c.created_at?.slice(0, 7)
    if (m && candidatesByMonth[m]) candidatesByMonth[m].add(c.user_id)
  })

  const appsByCandidate: Record<string, string[]> = {}
  ;(cohortApps.data || []).forEach((a: any) => {
    if (!a.candidate_id || !a.applied_at) return
    if (!appsByCandidate[a.candidate_id]) appsByCandidate[a.candidate_id] = []
    appsByCandidate[a.candidate_id].push(a.applied_at.slice(0, 7))
  })

  const retentionCohorts = cohortMonths.map(cohortMonth => {
    const users = candidatesByMonth[cohortMonth]
    const size = users.size
    if (size === 0) return { cohort: cohortMonth, size: 0, retention: [] as number[] }

    const retention: number[] = []
    const cohortIdx = cohortMonths.indexOf(cohortMonth)
    for (let offset = 0; offset <= 5 - cohortIdx; offset++) {
      const targetMonth = cohortMonths[cohortIdx + offset]
      if (!targetMonth) break
      let active = 0
      users.forEach(uid => {
        const months = appsByCandidate[uid] || []
        if (offset === 0 || months.includes(targetMonth)) active++
      })
      retention.push(size > 0 ? Math.round((active / size) * 100) : 0)
    }
    return { cohort: cohortMonth, size, retention }
  })

  // Geographic distribution
  const locationCounts: Record<string, number> = {}
  const allProfiles = [...(candidates.data || []), ...(employers.data || [])]
  allProfiles.forEach((p: any) => {
    const loc = p.location?.trim()
    if (loc) {
      const region = loc.split(',').pop()?.trim() || loc
      locationCounts[region] = (locationCounts[region] || 0) + 1
    }
  })
  const geoDistribution = Object.entries(locationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([region, count]) => ({ region, count }))

  // Active users
  const dau = new Set([
    ...(dauApps.data || []).map((r: any) => r.candidate_id),
    ...(dauJobs.data || []).map((r: any) => r.employer_id),
  ]).size
  const wau = new Set([
    ...(wauApps.data || []).map((r: any) => r.candidate_id),
    ...(wauJobs.data || []).map((r: any) => r.employer_id),
  ]).size
  const mau = new Set([
    ...(mauApps.data || []).map((r: any) => r.candidate_id),
    ...(mauJobs.data || []).map((r: any) => r.employer_id),
  ]).size

  return {
    userGrowth,
    retentionCohorts,
    geoDistribution,
    activeUsers: { dau, wau, mau },
    signupSource: null,
    engagementHistogram: null,
  }
}

async function fetchJobs(db: any, startDate: string, granularity: 'day' | 'week' | 'month') {
  const periodKeys = generatePeriodKeys(startDate, granularity)

  const [jobsAll, jobsForSalary, jobsForTags] = await Promise.all([
    db.from('jobs').select('posted_at, category, location, employmentType, status, salaryMin, salaryMax').gte('posted_at', startDate).limit(5000),
    db.from('jobs').select('category, salaryMin, salaryMax').not('salaryMin', 'is', null).not('salaryMax', 'is', null),
    db.from('jobs').select('tags').not('tags', 'is', null),
  ])

  const jobs = jobsAll.data || []

  // Jobs over time
  const jobsOverTime = groupByPeriod(jobs, 'posted_at', granularity, periodKeys)
    .map(j => ({ period: j.period, count: j.count }))

  // Jobs by sector
  const sectorCounts: Record<string, number> = {}
  jobs.forEach((j: any) => {
    if (j.category) sectorCounts[j.category] = (sectorCounts[j.category] || 0) + 1
  })
  const jobsBySector = Object.entries(sectorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([sector, count]) => ({ sector, count }))

  // Jobs by location
  const locCounts: Record<string, number> = {}
  jobs.forEach((j: any) => {
    const loc = j.location?.trim()
    if (loc) {
      const city = loc.split(',')[0]?.trim() || loc
      locCounts[city] = (locCounts[city] || 0) + 1
    }
  })
  const jobsByLocation = Object.entries(locCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([location, count]) => ({ location, count }))

  // Avg salary by sector
  const salaryData = jobsForSalary.data || []
  const salarySectors: Record<string, { totalMin: number; totalMax: number; count: number }> = {}
  salaryData.forEach((j: any) => {
    if (j.category && j.salaryMin && j.salaryMax) {
      if (!salarySectors[j.category]) salarySectors[j.category] = { totalMin: 0, totalMax: 0, count: 0 }
      salarySectors[j.category].totalMin += j.salaryMin
      salarySectors[j.category].totalMax += j.salaryMax
      salarySectors[j.category].count++
    }
  })
  const avgSalaryBySector = Object.entries(salarySectors)
    .filter(([, v]) => v.count >= 1)
    .map(([sector, v]) => ({
      sector,
      avgMin: Math.round(v.totalMin / v.count),
      avgMax: Math.round(v.totalMax / v.count),
      avgMid: Math.round((v.totalMin + v.totalMax) / (2 * v.count)),
    }))
    .sort((a, b) => b.avgMid - a.avgMid)
    .slice(0, 12)

  // Salary distribution (£5k buckets)
  const salaryBuckets: Record<string, number> = {}
  const bucketRanges = ['<15k', '15k-20k', '20k-25k', '25k-30k', '30k-35k', '35k-40k', '40k-45k', '45k-50k', '50k-60k', '60k-70k', '70k-80k', '80k+']
  bucketRanges.forEach(r => { salaryBuckets[r] = 0 })
  salaryData.forEach((j: any) => {
    if (j.salaryMin != null && j.salaryMax != null) {
      const mid = (j.salaryMin + j.salaryMax) / 2
      if (mid < 15000) salaryBuckets['<15k']++
      else if (mid < 20000) salaryBuckets['15k-20k']++
      else if (mid < 25000) salaryBuckets['20k-25k']++
      else if (mid < 30000) salaryBuckets['25k-30k']++
      else if (mid < 35000) salaryBuckets['30k-35k']++
      else if (mid < 40000) salaryBuckets['35k-40k']++
      else if (mid < 45000) salaryBuckets['40k-45k']++
      else if (mid < 50000) salaryBuckets['45k-50k']++
      else if (mid < 60000) salaryBuckets['50k-60k']++
      else if (mid < 70000) salaryBuckets['60k-70k']++
      else if (mid < 80000) salaryBuckets['70k-80k']++
      else salaryBuckets['80k+']++
    }
  })
  const salaryDistribution = bucketRanges.map(range => ({ range, count: salaryBuckets[range] }))

  // Job type breakdown
  const typeCounts: Record<string, number> = {}
  jobs.forEach((j: any) => {
    const t = j.employmentType || 'Unknown'
    typeCounts[t] = (typeCounts[t] || 0) + 1
  })
  const jobTypeBreakdown = Object.entries(typeCounts).map(([type, count]) => ({ type, count }))

  // Popular tags
  const tagCounts: Record<string, number> = {}
  ;(jobsForTags.data || []).forEach((j: any) => {
    if (Array.isArray(j.tags)) {
      j.tags.forEach((t: string) => { tagCounts[t] = (tagCounts[t] || 0) + 1 })
    }
  })
  const popularTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }))

  // Filled vs expired
  const statusCounts = { filled: 0, expired: 0, active: 0 }
  jobs.forEach((j: any) => {
    if (j.status === 'filled') statusCounts.filled++
    else if (j.status === 'archived' || j.status === 'expired') statusCounts.expired++
    else if (j.status === 'active') statusCounts.active++
  })

  // Avg days active
  const now = new Date()
  const activeDays = jobs
    .filter((j: any) => j.posted_at && (j.status === 'filled' || j.status === 'archived'))
    .map((j: any) => (now.getTime() - new Date(j.posted_at).getTime()) / 86400000)
  const avgDaysActive = activeDays.length > 0 ? Math.round(activeDays.reduce((a: number, b: number) => a + b, 0) / activeDays.length) : null

  return {
    jobsOverTime,
    jobsBySector,
    jobsByLocation,
    avgSalaryBySector,
    salaryDistribution,
    jobTypeBreakdown,
    popularTags,
    avgDaysActive,
    filledVsExpiredRatio: statusCounts,
  }
}

async function fetchApplications(db: any, startDate: string, granularity: 'day' | 'week' | 'month') {
  const periodKeys = generatePeriodKeys(startDate, granularity)

  const [apps, jobsWithCategory] = await Promise.all([
    db.from('job_applications').select('applied_at, status, job_id').gte('applied_at', startDate).limit(10000),
    db.from('jobs').select('id, category'),
  ])

  const appList = apps.data || []
  const jobMap: Record<string, string> = {}
  ;(jobsWithCategory.data || []).forEach((j: any) => {
    if (j.id && j.category) jobMap[j.id] = j.category
  })

  // Funnel
  const statusOrder = ['pending', 'viewed', 'shortlisted', 'interview', 'offered']
  const statusCounts: Record<string, number> = {}
  statusOrder.forEach(s => { statusCounts[s] = 0 })
  statusCounts['rejected'] = 0
  appList.forEach((a: any) => {
    if (statusCounts[a.status] !== undefined) statusCounts[a.status]++
  })

  const totalForFunnel = appList.length
  const funnel = statusOrder.map((stage, i) => {
    const count = statusCounts[stage]
    const prev = i === 0 ? totalForFunnel : statusCounts[statusOrder[i - 1]]
    const dropOff = prev > 0 ? Math.round(((prev - count) / prev) * 100) : 0
    return { stage: stage.charAt(0).toUpperCase() + stage.slice(1), count, dropOff }
  })
  funnel.push({ stage: 'Rejected', count: statusCounts['rejected'], dropOff: 0 })

  // Avg time per stage (approximation: days from applied_at to now)
  const now = new Date()
  const stageTimings: Record<string, number[]> = {}
  statusOrder.forEach(s => { stageTimings[s] = [] })
  appList.forEach((a: any) => {
    if (a.applied_at && stageTimings[a.status]) {
      const days = (now.getTime() - new Date(a.applied_at).getTime()) / 86400000
      stageTimings[a.status].push(days)
    }
  })
  const avgTimePerStage = statusOrder.map(stage => ({
    stage: stage.charAt(0).toUpperCase() + stage.slice(1),
    avgDays: stageTimings[stage].length > 0
      ? Math.round(stageTimings[stage].reduce((a, b) => a + b, 0) / stageTimings[stage].length)
      : 0,
  }))

  // Conversion by sector
  const sectorApps: Record<string, { applications: number; offers: number }> = {}
  appList.forEach((a: any) => {
    const sector = jobMap[a.job_id]
    if (sector) {
      if (!sectorApps[sector]) sectorApps[sector] = { applications: 0, offers: 0 }
      sectorApps[sector].applications++
      if (a.status === 'offered') sectorApps[sector].offers++
    }
  })
  const conversionBySector = Object.entries(sectorApps)
    .filter(([, v]) => v.applications >= 3)
    .map(([sector, v]) => ({
      sector,
      applications: v.applications,
      offers: v.offers,
      rate: v.applications > 0 ? Math.round((v.offers / v.applications) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.applications - a.applications)
    .slice(0, 12)

  // Applications over time
  const applicationsOverTime = groupByPeriod(appList, 'applied_at', granularity, periodKeys)
    .map(a => ({ period: a.period, count: a.count }))

  // Peak application times (heatmap)
  const heatmapCounts: Record<string, number> = {}
  appList.forEach((a: any) => {
    if (a.applied_at) {
      const d = new Date(a.applied_at)
      const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1 // Mon=0, Sun=6
      const hour = d.getHours()
      const key = `${dayOfWeek}-${hour}`
      heatmapCounts[key] = (heatmapCounts[key] || 0) + 1
    }
  })
  const peakApplicationTimes: { dayOfWeek: number; hour: number; count: number }[] = []
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      peakApplicationTimes.push({ dayOfWeek: d, hour: h, count: heatmapCounts[`${d}-${h}`] || 0 })
    }
  }

  return {
    funnel,
    avgTimePerStage,
    conversionBySector,
    applicationsOverTime,
    peakApplicationTimes,
    successRateByExperience: null,
  }
}

async function fetchRevenue(db: any, startDate: string, granularity: 'day' | 'week' | 'month') {
  const [subsResult] = await Promise.all([
    db.from('employer_subscriptions').select('subscription_tier, subscription_status, created_at, cancel_at, trial_ends_at'),
  ])

  const subs = subsResult.data || []
  const now = new Date()

  // MRR over time (reconstruct monthly)
  const mrrMonths: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    mrrMonths.push(d.toISOString().slice(0, 7))
  }

  const mrrOverTime = mrrMonths.map(month => {
    const endOfMonth = new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0, 23, 59, 59)
    const startOfMonth = new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)) - 1, 1)

    let standard = 0
    let professional = 0
    subs.forEach((s: any) => {
      const created = new Date(s.created_at)
      const canceled = s.cancel_at ? new Date(s.cancel_at) : null
      const isActive = created <= endOfMonth &&
        (s.subscription_status === 'active' || s.subscription_status === 'trialing') &&
        (!canceled || canceled > startOfMonth)
      if (isActive) {
        if (s.subscription_tier === 'standard') standard++
        else if (s.subscription_tier === 'professional') professional++
      }
    })

    return {
      period: month,
      mrr: Math.round((standard * STANDARD_PRICE + professional * PROFESSIONAL_PRICE) * 100) / 100,
      standard: Math.round(standard * STANDARD_PRICE * 100) / 100,
      professional: Math.round(professional * PROFESSIONAL_PRICE * 100) / 100,
    }
  })

  // Trial conversion
  const trialing = subs.filter((s: any) => s.trial_ends_at)
  const convertedFromTrial = trialing.filter((s: any) => s.subscription_status === 'active')
  const trialConversion = {
    totalTrials: trialing.length,
    converted: convertedFromTrial.length,
    rate: trialing.length > 0 ? Math.round((convertedFromTrial.length / trialing.length) * 1000) / 10 : 0,
  }

  // ARPE
  const currentActive = subs.filter((s: any) => s.subscription_status === 'active').length
  const currentMRR = mrrOverTime[mrrOverTime.length - 1]?.mrr || 0
  const arpe = currentActive > 0 ? Math.round((currentMRR / currentActive) * 100) / 100 : 0

  // Churn over time
  const churnOverTime = mrrMonths.map(month => {
    const startOfMonth = new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)) - 1, 1)
    const endOfMonth = new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0, 23, 59, 59)

    const activeAtStart = subs.filter((s: any) => {
      const created = new Date(s.created_at)
      const canceled = s.cancel_at ? new Date(s.cancel_at) : null
      return created < startOfMonth && (!canceled || canceled >= startOfMonth)
    }).length

    const churned = subs.filter((s: any) => {
      if (!s.cancel_at) return false
      const canceled = new Date(s.cancel_at)
      return canceled >= startOfMonth && canceled <= endOfMonth
    }).length

    return {
      period: month,
      churnRate: activeAtStart > 0 ? Math.round((churned / activeAtStart) * 1000) / 10 : 0,
      churned,
      total: activeAtStart,
    }
  })

  // LTV estimate
  const recentChurn = churnOverTime.slice(-3)
  const avgChurnRate = recentChurn.length > 0
    ? recentChurn.reduce((sum, c) => sum + c.churnRate, 0) / recentChurn.length / 100
    : 0
  const ltvEstimate = avgChurnRate > 0 ? Math.round(arpe / avgChurnRate) : arpe > 0 ? 99999 : 0

  // Revenue forecast (linear regression on last 6 months)
  const recentMRR = mrrOverTime.slice(-6).map(m => m.mrr)
  let forecast: { period: string; projected: number }[] = []
  if (recentMRR.length >= 3) {
    const n = recentMRR.length
    const xs = Array.from({ length: n }, (_, i) => i)
    const sumX = xs.reduce((a, b) => a + b, 0)
    const sumY = recentMRR.reduce((a, b) => a + b, 0)
    const sumXY = xs.reduce((sum, x, i) => sum + x * recentMRR[i], 0)
    const sumX2 = xs.reduce((sum, x) => sum + x * x, 0)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    for (let i = 1; i <= 3; i++) {
      const projected = Math.max(0, Math.round((intercept + slope * (n - 1 + i)) * 100) / 100)
      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
      forecast.push({ period: futureDate.toISOString().slice(0, 7), projected })
    }
  }

  return {
    mrrOverTime,
    revenueByTier: mrrOverTime,
    trialConversion,
    arpe,
    churnOverTime,
    ltvEstimate,
    revenueForecast: forecast,
  }
}

async function fetchEngagement(db: any, startDate: string, granularity: 'day' | 'week' | 'month') {
  const periodKeys = generatePeriodKeys(startDate, granularity)

  const [messagesResult, reviewsResult, reviewsByCompany] = await Promise.all([
    db.from('messages').select('created_at').gte('created_at', startDate).limit(10000),
    db.from('company_reviews').select('created_at, overall_rating').gte('created_at', startDate).limit(5000),
    db.from('company_reviews').select('employer_id, overall_rating, company_name').limit(5000),
  ])

  // Messages over time
  const messagesOverTime = groupByPeriod(messagesResult.data, 'created_at', granularity, periodKeys)
    .map(m => ({ period: m.period, count: m.count }))

  // Reviews over time with avg rating
  const reviewsList = reviewsResult.data || []
  const reviewsByPeriod: Record<string, { count: number; totalRating: number }> = {}
  periodKeys.forEach(k => { reviewsByPeriod[k] = { count: 0, totalRating: 0 } })
  reviewsList.forEach((r: any) => {
    if (r.created_at) {
      const key = toPeriodKey(r.created_at, granularity)
      if (reviewsByPeriod[key]) {
        reviewsByPeriod[key].count++
        reviewsByPeriod[key].totalRating += (r.overall_rating || 0)
      }
    }
  })
  const reviewsOverTime = periodKeys.map(k => ({
    period: k,
    count: reviewsByPeriod[k].count,
    avgRating: reviewsByPeriod[k].count > 0
      ? Math.round((reviewsByPeriod[k].totalRating / reviewsByPeriod[k].count) * 10) / 10
      : 0,
  }))

  // Most reviewed companies
  const companyMap: Record<string, { name: string; count: number; totalRating: number }> = {}
  ;(reviewsByCompany.data || []).forEach((r: any) => {
    const key = r.employer_id || r.company_name || 'Unknown'
    const name = r.company_name || 'Unknown'
    if (!companyMap[key]) companyMap[key] = { name, count: 0, totalRating: 0 }
    companyMap[key].count++
    companyMap[key].totalRating += (r.overall_rating || 0)
  })
  const mostReviewedCompanies = Object.values(companyMap)
    .filter(c => c.count >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(c => ({
      company: c.name,
      reviewCount: c.count,
      avgRating: Math.round((c.totalRating / c.count) * 10) / 10,
    }))

  return {
    messagesOverTime,
    avgResponseTime: null,
    reviewsOverTime,
    mostReviewedCompanies,
    searchQueries: null,
    pageViews: null,
    errorRate: null,
  }
}

async function fetchBenchmarks(db: any) {
  const [totalApps, activeJobs, offeredApps] = await Promise.all([
    db.from('job_applications').select('*', { count: 'exact', head: true }),
    db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('job_applications').select('applied_at').eq('status', 'offered'),
  ])

  const totalAppsCount = totalApps.count || 0
  const activeJobsCount = activeJobs.count || 0
  const appsPerJob = activeJobsCount > 0 ? Math.round((totalAppsCount / activeJobsCount) * 10) / 10 : 0

  // Avg time to hire
  const offered = offeredApps.data || []
  const now = new Date()
  let avgDaysToHire = 0
  if (offered.length > 0) {
    const total = offered.reduce((sum: number, a: any) => {
      return sum + (now.getTime() - new Date(a.applied_at).getTime()) / 86400000
    }, 0)
    avgDaysToHire = Math.round(total / offered.length)
  }

  return {
    appsPerJob: {
      platform: appsPerJob,
      industryBenchmark: 18,
    },
    timeToHire: {
      platform: avgDaysToHire,
      industryBenchmark: 36,
    },
    costPerHire: null,
  }
}

// ============================================================
// Route Handler
// ============================================================

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const db = createAdminClient(token)
  const url = new URL(req.url)
  const section = url.searchParams.get('section') || 'kpi'
  const range = url.searchParams.get('range') || '30d'
  const { startDate, granularity } = getDateRange(range)

  // Override granularity for users section if specified
  const userGranularity = (url.searchParams.get('granularity') as 'day' | 'week' | 'month') || granularity

  try {
    let data: any
    switch (section) {
      case 'kpi':
        data = await fetchKPI(db, startDate, granularity)
        break
      case 'users':
        data = await fetchUsers(db, startDate, userGranularity)
        break
      case 'jobs':
        data = await fetchJobs(db, startDate, granularity)
        break
      case 'applications':
        data = await fetchApplications(db, startDate, granularity)
        break
      case 'revenue':
        data = await fetchRevenue(db, startDate, granularity)
        break
      case 'engagement':
        data = await fetchEngagement(db, startDate, granularity)
        break
      case 'benchmarks':
        data = await fetchBenchmarks(db)
        break
      default:
        return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 })
    }
    return NextResponse.json(data)
  } catch (error: any) {
    console.error(`[Admin Analytics] Section=${section}`, error.message)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
