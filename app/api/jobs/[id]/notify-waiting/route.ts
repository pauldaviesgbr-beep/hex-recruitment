import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import { sendDeclineNotice } from '@/lib/declineNotice'
import { stageOf, isListed } from '@/lib/applicantStages'

/**
 * "Advert removed — {n} people are still waiting to hear back. Send them a
 * polite update?" → Send updates (design 25, decision 7; layout agreed with
 * Claude Design, 15 Nov 2026).
 *
 * ONLY FOR AN ADVERT THAT IS NO LONGER LIVE. The prompt appears after Remove
 * ad succeeds; refusing a live advert here means the route cannot be used to
 * reject everyone on a job that is still open.
 *
 * "Still waiting" is the Applicants list's own definition — New, Shortlisted,
 * Interview, Offer — read through stageOf, never restated. Each one is marked
 * not a fit and owed its update NOW (no Undo here: the employer pressed a
 * button that says what it does), then sent through the same once-only sender
 * as a single Not a fit.
 *
 * The caller's session for the reads and the status writes, as in the Not a
 * fit route; RLS applies underneath.
 */

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CAP = 200

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id
  if (!jobId || !UUID.test(jobId)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => req.cookies.get(n)?.value, set(_n: string, _v: string, _o: CookieOptions) {}, remove(_n: string, _o: CookieOptions) {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (user.user_metadata?.role !== 'employer') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? user.id

  const { data: job } = await supabase
    .from('jobs').select('id, status').eq('id', jobId).eq('employer_id', ownerId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (job.status === 'active') return NextResponse.json({ error: 'still_live' }, { status: 409 })

  const { data: apps, error: readErr } = await supabase
    .from('job_applications')
    .select('id, status')
    .eq('job_id', jobId)
    .limit(CAP)
  if (readErr) return NextResponse.json({ error: 'read_failed' }, { status: 500 })
  const waiting = (apps || []).filter(a => isListed(stageOf(a.status)))

  const now = new Date().toISOString()
  let marked = 0, sent = 0
  for (const a of waiting) {
    const { data: updated } = await supabase
      .from('job_applications')
      .update({ status: 'rejected', status_updated_at: now, stage_entered_at: now, decline_notice_due_at: now, decline_notice_sent_at: null })
      .eq('id', a.id)
      .eq('status', a.status)
      .select('id')
    if (!updated?.length) continue
    marked++
    const r = await sendDeclineNotice(a.id)
    if (r.sent) sent++
  }
  return NextResponse.json({ ok: true, waiting: waiting.length, marked, sent })
}
