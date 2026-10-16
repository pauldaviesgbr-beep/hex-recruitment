// GET /api/app/me/applications — the signed-in candidate's applications for
// the app's native Applications screen (design B4/B6).
//
// Labels come from lib/applicationStatus (the website's own). "stages" lists
// only the stages actually REACHED, each with its date where one is recorded
// (design B6: stages still to come are not shown). The advert travels with each
// application so "View the job" works offline.

import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest, toAppJob, APP_JOB_COLUMNS } from '@/lib/appApi'
import { APPLICATION_STATUS_LABELS, normalizeApplicationStatus } from '@/lib/applicationStatus'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })

  const { data: apps, error } = await me.client
    .from('job_applications')
    .select('id, job_id, status, applied_at, viewed_at, shortlisted_at, job_title, company, jobs(employer_id)')
    .eq('candidate_id', me.userId)
    .order('applied_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'applications_unavailable' }, { status: 503 })

  const ids = Array.from(new Set((apps || []).map(a => a.job_id).filter(Boolean)))
  const { data: rows } = ids.length
    ? await me.client.from('jobs').select(APP_JOB_COLUMNS).in('id', ids)
    : { data: [] as any[] }
  const byId = new Map((rows || []).map((r: any) => [r.id, r]))

  const out = []
  for (const a of apps || []) {
    const status = normalizeApplicationStatus(a.status)
    const stages: { key: string; label: string; at: string | null }[] = [
      { key: 'applied', label: APPLICATION_STATUS_LABELS.applied, at: a.applied_at },
    ]
    if (a.viewed_at || status !== 'applied') stages.push({ key: 'viewed', label: APPLICATION_STATUS_LABELS.viewed, at: a.viewed_at })
    if (a.shortlisted_at) stages.push({ key: 'shortlisted', label: APPLICATION_STATUS_LABELS.shortlisted, at: a.shortlisted_at })
    if (!['applied', 'viewed', 'shortlisted'].includes(status)) {
      stages.push({ key: status, label: APPLICATION_STATUS_LABELS[status], at: null })
    }
    const row = byId.get(a.job_id)
    out.push({
      id: a.id,
      status,
      statusLabel: APPLICATION_STATUS_LABELS[status],
      appliedAt: a.applied_at,
      stages,
      title: row?.title || a.job_title || '',
      company: row?.company || a.company || '',
      employerId: (a as any).jobs?.employer_id ?? null,
      job: row ? await toAppJob(row) : null,
    })
  }
  return NextResponse.json({ applications: out, fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
}
