// GET /api/app/me/saved — the signed-in candidate's saved jobs, with the full
// advert, so the app can read them with no signal (design B2/B3). A job that
// has since closed is still returned, marked isClosed, until they remove it.

import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest, toAppJob, APP_JOB_COLUMNS } from '@/lib/appApi'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })

  const { data: saved, error } = await me.client
    .from('saved_jobs')
    .select('job_id, saved_at')
    .eq('candidate_id', me.userId)
    .order('saved_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'saved_unavailable' }, { status: 503 })

  const ids = (saved || []).map(s => s.job_id)
  if (ids.length === 0) return NextResponse.json({ saved: [], fetchedAt: new Date().toISOString() })

  const { data: rows } = await me.client.from('jobs').select(APP_JOB_COLUMNS).in('id', ids)
  const byId = new Map((rows || []).map((r: any) => [r.id, r]))
  const out = []
  for (const s of saved || []) {
    const row = byId.get(s.job_id)
    if (!row) continue
    out.push({ savedAt: s.saved_at, job: await toAppJob(row) })
  }
  return NextResponse.json({ saved: out, fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
}
