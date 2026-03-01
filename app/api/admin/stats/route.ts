import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const db = createAdminClient(token)
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const [
      candidatesTotal,
      candidatesWeek,
      candidatesMonth,
      employersTotal,
      employersWeek,
      employersMonth,
      jobsTotal,
      jobsActive,
      applicationsTotal,
      subsActive,
      subsTrialing,
      candidateGrowth,
      employerGrowth,
      jobGrowth,
      // Alerts data
      expiringTrials,
      pastDueSubs,
      flaggedReviews,
    ] = await Promise.all([
      db.from('candidate_profiles').select('*', { count: 'exact', head: true }),
      db.from('candidate_profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      db.from('candidate_profiles').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo),
      db.from('employer_profiles').select('*', { count: 'exact', head: true }),
      db.from('employer_profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      db.from('employer_profiles').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo),
      db.from('jobs').select('*', { count: 'exact', head: true }),
      db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      db.from('job_applications').select('*', { count: 'exact', head: true }),
      db.from('employer_subscriptions').select('subscription_tier').eq('subscription_status', 'active'),
      db.from('employer_subscriptions').select('subscription_tier').eq('subscription_status', 'trialing'),
      // Growth data
      db.from('candidate_profiles').select('created_at').gte('created_at', new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()).order('created_at'),
      db.from('employer_profiles').select('created_at').gte('created_at', new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()).order('created_at'),
      db.from('jobs').select('posted_at').gte('posted_at', new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()).order('posted_at'),
      // Alerts
      db.from('employer_subscriptions')
        .select('user_id, trial_ends_at')
        .eq('subscription_status', 'trialing')
        .lte('trial_ends_at', threeDaysFromNow)
        .gte('trial_ends_at', now.toISOString()),
      db.from('employer_subscriptions')
        .select('user_id')
        .eq('subscription_status', 'past_due'),
      db.from('company_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('is_flagged', true),
    ])

    // Count subscriptions by tier
    const allSubs = [...(subsActive.data || []), ...(subsTrialing.data || [])]
    const standardCount = allSubs.filter(s => s.subscription_tier === 'standard').length
    const professionalCount = allSubs.filter(s => s.subscription_tier === 'professional').length
    const trialCount = (subsTrialing.data || []).length
    const monthlyRevenue = (standardCount * 29.99) + (professionalCount * 59.99)

    // Build monthly growth data
    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(d.toISOString().slice(0, 7))
    }

    const groupByMonth = (items: { created_at?: string; posted_at?: string }[] | null, dateField: string) => {
      const counts: Record<string, number> = {}
      months.forEach(m => { counts[m] = 0 })
      ;(items || []).forEach(item => {
        const d = (item as any)[dateField]
        if (d) {
          const month = d.slice(0, 7)
          if (counts[month] !== undefined) counts[month]++
        }
      })
      return months.map(m => ({ month: m, count: counts[m] }))
    }

    return NextResponse.json({
      totalUsers: (candidatesTotal.count || 0) + (employersTotal.count || 0),
      totalCandidates: candidatesTotal.count || 0,
      totalEmployers: employersTotal.count || 0,
      newUsersWeek: (candidatesWeek.count || 0) + (employersWeek.count || 0),
      newUsersMonth: (candidatesMonth.count || 0) + (employersMonth.count || 0),
      totalJobs: jobsTotal.count || 0,
      activeJobs: jobsActive.count || 0,
      totalApplications: applicationsTotal.count || 0,
      subscriptions: {
        standard: standardCount,
        professional: professionalCount,
        trials: trialCount,
        total: allSubs.length,
      },
      monthlyRevenue,
      growth: {
        candidates: groupByMonth(candidateGrowth.data, 'created_at'),
        employers: groupByMonth(employerGrowth.data, 'created_at'),
        jobs: groupByMonth(jobGrowth.data, 'posted_at'),
      },
      alerts: {
        expiringTrials: (expiringTrials.data || []).length,
        pastDuePayments: (pastDueSubs.data || []).length,
        flaggedReviews: flaggedReviews.count || 0,
      },
    })
  } catch (error: any) {
    console.error('[Admin Stats]', error.message)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
