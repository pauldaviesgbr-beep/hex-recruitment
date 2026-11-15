import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendDeclineNotice } from '@/lib/declineNotice'
import { WAITING_STATUSES } from '@/lib/applicantStages'

/**
 * A BACKSTOP, NOT THE ROUTE AN UPDATE NORMALLY TAKES (design 25, decision 5).
 * The Not a fit route queues its own send on the server eight seconds after
 * the tap (waitUntil), so a closed tab does not delay the candidate; the page
 * also sends when its toast runs out and by beacon when hidden. This daily run
 * exists only for the case none of those could cover — the function that held
 * the queued send died mid-wait — and sends anything owed for more than a
 * minute and not yet sent.
 *
 * The once-only claim in lib/declineNotice means it can never send something
 * already sent, and an Undo clears what is owed, so it can never send that.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  // FAILS CLOSED: no secret configured means no run, never an open sender.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const cutoff = new Date(Date.now() - 60_000).toISOString()
  // Owed rows are still in their waiting status (the status changes at the
  // send) or already rejected (a send that stamped the status and then died).
  const { data: owed, error } = await supabaseAdmin
    .from('job_applications')
    .select('id')
    .in('status', [...WAITING_STATUSES, 'rejected'])
    .not('decline_notice_due_at', 'is', null)
    .is('decline_notice_sent_at', null)
    .lt('decline_notice_due_at', cutoff)
    .limit(200)
  if (error) return NextResponse.json({ error: 'read_failed' }, { status: 500 })
  let sent = 0
  for (const row of owed || []) {
    const r = await sendDeclineNotice(row.id)
    if (r.sent) sent++
  }
  console.log(`[cron/decline-notices] owed ${owed?.length ?? 0}, sent ${sent}`)
  return NextResponse.json({ ok: true, owed: owed?.length ?? 0, sent })
}
