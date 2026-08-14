import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

// The numbers that say whether the platform WORKS, as opposed to how big it
// is: the candidate funnel, per-employer responsiveness, and which employers
// are alive at all. Everything here is computed from data that already
// exists; the only filter is is_test, so the two standing fixtures never
// inflate a number Paul quotes.
//
// HONEST-LABEL NOTE, load-bearing: job_applications.viewed_at is stamped when
// the employer's applicant LIST loads, not when one application is read. The
// UI labels it "list opened" for exactly that reason — keep it that way.

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const db = createAdminClient(token)

  try {
    const [candProfiles, cvRows, apps, jobs, employers] = await Promise.all([
      db.from('candidate_profiles').select('user_id, cv_url, is_test'),
      db.from('candidate_cvs').select('user_id'),
      db.from('job_applications').select('id, candidate_id, job_id, status, viewed_at, applied_at'),
      db.from('jobs').select('id, employer_id, is_recruiter_posting'),
      db.from('employer_profiles').select('user_id, company_name, is_test, created_at'),
    ])

    const testCandidates = new Set((candProfiles.data || []).filter(c => c.is_test).map(c => c.user_id))
    const testEmployers = new Set((employers.data || []).filter(e => e.is_test).map(e => e.user_id))
    const jobById = new Map((jobs.data || []).map(j => [j.id, j]))

    const realCandidates = (candProfiles.data || []).filter(c => !c.is_test)
    const cvSet = new Set((cvRows.data || []).map(r => r.user_id))
    // A real application: real candidate, and not aimed at the test employer.
    const realApps = (apps.data || []).filter(a => {
      if (testCandidates.has(a.candidate_id)) return false
      const job = jobById.get(a.job_id)
      return !(job && testEmployers.has(job.employer_id))
    })

    // ── The funnel ─────────────────────────────────────────────────────────
    const responded = (a: { viewed_at: string | null; status: string }) =>
      a.viewed_at !== null || a.status !== 'pending'
    const appliedIds = new Set(realApps.map(a => a.candidate_id))
    const respondedIds = new Set(realApps.filter(responded).map(a => a.candidate_id))
    const hiredIds = new Set(realApps.filter(a => a.status === 'hired').map(a => a.candidate_id))
    const funnel = {
      signups: realCandidates.length,
      withProfile: realCandidates.length, // a profile row IS the signup record
      withCv: realCandidates.filter(c => c.cv_url || cvSet.has(c.user_id)).length,
      applied: appliedIds.size,
      gotResponse: respondedIds.size,
      hired: hiredIds.size,
    }

    // ── Per-employer responsiveness, worst first ───────────────────────────
    type Row = {
      employerId: string; company: string; received: number
      listOpened: number; actioned: number; medianHoursToOpen: number | null
    }
    const byEmployer = new Map<string, Row & { openLags: number[] }>()
    for (const a of realApps) {
      const job = jobById.get(a.job_id)
      if (!job) continue
      const emp = (employers.data || []).find(e => e.user_id === job.employer_id)
      if (!emp || emp.is_test) continue
      let row = byEmployer.get(emp.user_id)
      if (!row) {
        row = { employerId: emp.user_id, company: emp.company_name, received: 0, listOpened: 0, actioned: 0, medianHoursToOpen: null, openLags: [] }
        byEmployer.set(emp.user_id, row)
      }
      row.received++
      if (a.viewed_at) {
        row.listOpened++
        row.openLags.push((new Date(a.viewed_at).getTime() - new Date(a.applied_at).getTime()) / 3600000)
      }
      if (a.status !== 'pending') row.actioned++
    }
    const responsiveness = Array.from(byEmployer.values()).map(r => {
      const lags = r.openLags.sort((x, y) => x - y)
      const median = lags.length ? lags[Math.floor((lags.length - 1) / 2)] : null
      const { openLags: _drop, ...rest } = r
      return { ...rest, medianHoursToOpen: median === null ? null : Math.round(median * 10) / 10 }
    }).sort((a, b) => (b.received - b.listOpened) - (a.received - a.listOpened))

    // ── Employers alive, stalest first ─────────────────────────────────────
    // last_sign_in_at comes from auth; it is the LAST sign-in only — there is
    // no history anywhere (auth.audit_log_entries is empty on this project).
    const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const lastSignIn = new Map((authList?.users || []).map(u => [u.id, u.last_sign_in_at || null]))
    const openedByEmployer = new Set(
      realApps.filter(a => a.viewed_at).map(a => jobById.get(a.job_id)?.employer_id).filter(Boolean)
    )
    const manualPosters = new Set(
      (jobs.data || []).filter(j => !j.is_recruiter_posting && !testEmployers.has(j.employer_id)).map(j => j.employer_id)
    )
    const employersAlive = (employers.data || [])
      .filter(e => !e.is_test)
      .map(e => ({
        company: e.company_name,
        approvedAt: e.created_at,
        lastSignIn: lastSignIn.get(e.user_id) || null,
        hasPosted: manualPosters.has(e.user_id),
        hasOpenedApplications: openedByEmployer.has(e.user_id),
      }))
      .sort((a, b) => (a.lastSignIn || '0').localeCompare(b.lastSignIn || '0'))

    return NextResponse.json({ funnel, responsiveness, employersAlive })
  } catch (error: any) {
    console.error('[Admin Health]', error.message)
    return NextResponse.json({ error: 'Failed to compute health data' }, { status: 500 })
  }
}
