// PUT / DELETE /api/app/me/saved/{jobId} — save or unsave a job from the app.
// Both are idempotent, so a save queued while offline can be replayed safely.

import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest } from '@/lib/appApi'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: { jobId: string } }) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })
  const { data: existing } = await me.client
    .from('saved_jobs').select('id').eq('candidate_id', me.userId).eq('job_id', params.jobId).maybeSingle()
  if (!existing) {
    const { error } = await me.client.from('saved_jobs').insert({ candidate_id: me.userId, job_id: params.jobId })
    if (error && error.code !== '23505') return NextResponse.json({ error: 'save_failed' }, { status: 503 })
  }
  return NextResponse.json({ saved: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { jobId: string } }) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })
  const { error } = await me.client.from('saved_jobs').delete().eq('candidate_id', me.userId).eq('job_id', params.jobId)
  if (error) return NextResponse.json({ error: 'unsave_failed' }, { status: 503 })
  return NextResponse.json({ saved: false })
}
