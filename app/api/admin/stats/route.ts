import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

// Admin queries live data — must not be statically prerendered.
export const dynamic = 'force-dynamic'

// Every count here excludes rows flagged is_test (the two standing fixture
// accounts), so nothing Paul quotes silently includes a fixture.
//
// Gone from this payload, deliberately (14 Aug 2026):
//   — monthlyRevenue: it multiplied by a hard-coded price for a price that
//     is deliberately undecided. Replaced by foundingSeats, the one
//     money-adjacent number that is real.
//   — subscriptions {active,trials}: every subscription row is 'inactive'
//     (founding = free year); the states those numbers keyed on are never
//     written, so the tile and pie could only ever show zero.
//   — expiringTrials / pastDuePayments alerts: same dead states.
//   — totalJobs as one number: replaced by a split that answers something —
//     live board / employer-posted / imported / retired.

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const db = createAdminClient(token)
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

  try {
    // The fixture ids, resolved once — application and job filters need them
    // because those tables carry no flag of their own.
    const [testCands, testEmps] = await Promise.all([
      db.from('candidate_profiles').select('user_id').eq('is_test', true),
      db.from('employer_profiles').select('user_id').eq('is_test', true),
    ])
    const testCandIds = (testCands.data || []).map(r => r.user_id)
    const testEmpIds = (testEmps.data || []).map(r => r.user_id)
    const notTestCandidate = (q: any) =>
      testCandIds.length ? q.not('candidate_id', 'in', `(${testCandIds.join(',')})`) : q
    const notTestEmployerJob = (q: any) =>
      testEmpIds.length ? q.not('employer_id', 'in', `(${testEmpIds.join(',')})`) : q

    const [
      candidatesTotal,
      candidatesWeek,
      candidatesMonth,
      employersTotal,
      employersWeek,
      employersMonth,
      jobsActive,
      jobsEmployerPosted,
      jobsImported,
      jobsImportedRetired,
      applicationsTotal,
      candidateGrowth,
      employerGrowth,
      manualJobGrowth,
      flaggedReviews,
    ] = await Promise.all([
      db.from('candidate_profiles').select('*', { count: 'exact', head: true }).eq('is_test', false),
      db.from('candidate_profiles').select('*', { count: 'exact', head: true }).eq('is_test', false).gte('created_at', weekAgo),
      db.from('candidate_profiles').select('*', { count: 'exact', head: true }).eq('is_test', false).gte('created_at', monthAgo),
      db.from('employer_profiles').select('*', { count: 'exact', head: true }).eq('is_test', false),
      db.from('employer_profiles').select('*', { count: 'exact', head: true }).eq('is_test', false).gte('created_at', weekAgo),
      db.from('employer_profiles').select('*', { count: 'exact', head: true }).eq('is_test', false).gte('created_at', monthAgo),
      db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      notTestEmployerJob(db.from('jobs').select('*', { count: 'exact', head: true }).eq('is_recruiter_posting', false)),
      db.from('jobs').select('*', { count: 'exact', head: true }).eq('is_recruiter_posting', true),
      db.from('jobs').select('*', { count: 'exact', head: true }).eq('is_recruiter_posting', true).eq('status', 'filled'),
      notTestCandidate(db.from('job_applications').select('*', { count: 'exact', head: true })),
      db.from('candidate_profiles').select('created_at').eq('is_test', false).gte('created_at', sixMonthsAgo).order('created_at'),
      db.from('employer_profiles').select('created_at').eq('is_test', false).gte('created_at', sixMonthsAgo).order('created_at'),
      // The postings chart shows what EMPLOYERS did, so the importer's rows
      // (scrape cadence) stay out of it.
      notTestEmployerJob(db.from('jobs').select('posted_at').eq('is_recruiter_posting', false).gte('posted_at', sixMonthsAgo).order('posted_at')),
      db.from('company_reviews').select('*', { count: 'exact', head: true }).eq('is_flagged', true),
    ])

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
      jobs: {
        liveBoard: jobsActive.count || 0,
        employerPosted: jobsEmployerPosted.count || 0,
        imported: jobsImported.count || 0,
        importedRetired: jobsImportedRetired.count || 0,
      },
      totalApplications: applicationsTotal.count || 0,
      // The founding offer is the one money claim being run: first 100
      // employers, 12 months free. Seats taken = real employer profiles.
      foundingSeats: { taken: employersTotal.count || 0, of: 100 },
      growth: {
        candidates: groupByMonth(candidateGrowth.data, 'created_at'),
        employers: groupByMonth(employerGrowth.data, 'created_at'),
        jobs: groupByMonth(manualJobGrowth.data, 'posted_at'),
      },
      alerts: {
        flaggedReviews: flaggedReviews.count || 0,
      },
    })
  } catch (error: any) {
    console.error('[Admin Stats]', error.message)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
