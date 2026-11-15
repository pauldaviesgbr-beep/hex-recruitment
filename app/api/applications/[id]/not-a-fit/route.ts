import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import { sendDeclineNotice } from '@/lib/declineNotice'
import { WAITING_STATUSES } from '@/lib/applicantStages'
import { waitUntil } from '@vercel/functions'

/**
 * "Not a fit" on the Applicants list (design 25, decision 5). Three actions:
 *
 *   decline  make the polite update OWED six seconds from now. The STATUS DOES
 *            NOT CHANGE YET, and nothing is sent.
 *   undo     clear what is owed. That is the whole undo, because nothing else
 *            was written. Refused once the send has begun (409 already_sent).
 *   send     mark the application rejected and send the update. Called when
 *            the toast times out, and by sendBeacon as the page is hidden.
 *            Idempotent: the sender claims the row, so a second call sends
 *            nothing.
 *
 * WHY THE STATUS WAITS FOR THE SEND. Setting status = 'rejected' fires
 * trg_cascade_application_status, which CANCELS the person's live interviews
 * and WITHDRAWS a pending offer. An Undo that only put the status back would
 * leave those cancelled — the booking quietly gone, on a tap the employer took
 * back. Writing only decline_notice_due_at during the window fires no trigger
 * at all (they run only when status changes), so Undo is exact by
 * construction. Found 15 Nov 2026 by reading the trigger before driving the
 * branch; the first version wrote the status at once.
 *
 * The list shows an owed row as Not a fit straight away (effectiveStage in
 * lib/applicantStages); the candidate sees nothing until the update is sent.
 *
 * THE SERVER QUEUES ITS OWN SEND (Paul, 15 Nov 2026: an employer closing the
 * tab must not delay a candidate's update until the daily catch-up). After a
 * decline is recorded, the response returns at once and this function stays
 * alive (waitUntil) to send SERVER_SEND_AFTER_MS later — the six-second Undo
 * plus two seconds' grace, so an Undo tapped at the last moment and slow to
 * arrive still lands before the send. The page also sends when its toast runs
 * out and by beacon when hidden; all three go through one claim, so the
 * candidate hears once. The daily cron is a backstop only, for a function
 * that died mid-wait.
 *
 * THE CALLER'S OWN SESSION, NOT THE SERVICE ROLE, for every read and write of
 * the application — the same choice /api/jobs/[id]/remove makes. RLS still
 * applies underneath, so a team member without manage_pipeline is refused by
 * the database whatever this file does, and the status trigger records who
 * moved it. Only the send (which writes the candidate's message and bell
 * notice) uses the service role, inside lib/declineNotice.
 *
 * The body is read as text and parsed, because sendBeacon cannot set a JSON
 * content type.
 */

export const dynamic = 'force-dynamic'
// The queued send keeps the function alive ~8 s after it responds, plus the
// send itself (email, message, notice). 30 s leaves room on any plan.
export const maxDuration = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OWED_AFTER_MS = 6000
const SERVER_SEND_AFTER_MS = OWED_AFTER_MS + 2000

type Client = ReturnType<typeof createServerClient>

/** Make an owed, still-waiting row rejected AS THE CALLER (so the status log
 *  names them), then claim and send. An Undo that got in first leaves nothing
 *  owed: neither statement matches and nothing is sent. */
async function sendNow(supabase: Client, id: string) {
  const nowIso = new Date().toISOString()
  await supabase
    .from('job_applications')
    .update({ status: 'rejected', status_updated_at: nowIso, stage_entered_at: nowIso })
    .eq('id', id)
    .in('status', WAITING_STATUSES)
    .not('decline_notice_due_at', 'is', null)
    .is('decline_notice_sent_at', null)
  return sendDeclineNotice(id)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  if (!id || !UUID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let body: any = {}
  try { body = JSON.parse((await req.text()) || '{}') } catch { body = {} }
  const action = String(body.action || '')

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => req.cookies.get(n)?.value, set(_n: string, _v: string, _o: CookieOptions) {}, remove(_n: string, _o: CookieOptions) {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (user.user_metadata?.role !== 'employer') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? user.id

  // The application, read in the caller's own scope, and its job pinned to
  // the caller's employer. Another employer's id lands here as "no row".
  const { data: app } = await supabase
    .from('job_applications')
    .select('id, status, stage_entered_at, job_id, decline_notice_due_at, decline_notice_sent_at')
    .eq('id', id)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { data: job } = await supabase
    .from('jobs').select('id').eq('id', app.job_id).eq('employer_id', ownerId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const now = new Date()

  if (action === 'decline') {
    if (!WAITING_STATUSES.includes(app.status)) return NextResponse.json({ error: 'not_waiting' }, { status: 409 })
    // ONLY the owed column. No status change, so no trigger fires.
    const { data: updated, error } = await supabase
      .from('job_applications')
      .update({
        decline_notice_due_at: new Date(now.getTime() + OWED_AFTER_MS).toISOString(),
        decline_notice_sent_at: null,
      })
      .eq('id', id)
      .eq('status', app.status)
      .select('id')
    if (error) return NextResponse.json({ error: 'write_failed' }, { status: 500 })
    if (!updated?.length) return NextResponse.json({ error: 'changed_underneath' }, { status: 409 })
    // Queue the send on the server, so a closed tab cannot delay it.
    waitUntil(
      new Promise(resolve => setTimeout(resolve, SERVER_SEND_AFTER_MS))
        .then(() => sendNow(supabase, id))
        .catch(() => { /* the daily catch-up still owes it */ }),
    )
    return NextResponse.json({ ok: true })
  }

  if (action === 'undo') {
    // Clear what is owed, only while the send has not begun: the status is
    // still a waiting one and nothing has been stamped sent.
    const { data: cleared, error } = await supabase
      .from('job_applications')
      .update({ decline_notice_due_at: null })
      .eq('id', id)
      .in('status', WAITING_STATUSES)
      .not('decline_notice_due_at', 'is', null)
      .is('decline_notice_sent_at', null)
      .select('id')
    if (error) return NextResponse.json({ error: 'write_failed' }, { status: 500 })
    if (!cleared?.length) return NextResponse.json({ error: 'already_sent' }, { status: 409 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'send') {
    // From the page: its toast ran out, or it is being hidden. The status
    // changes here, as the caller (sendNow); the sender then claims and sends,
    // and makes that move itself only for the catch-up, which has no caller.
    const result = await sendNow(supabase, id)
    return NextResponse.json({ ok: true, result })
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
}
