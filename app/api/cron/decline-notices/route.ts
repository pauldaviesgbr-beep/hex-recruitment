import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendDeclineNotice } from '@/lib/declineNotice'
import { WAITING_STATUSES } from '@/lib/applicantStages'

/**
 * THE CATCH-UP FOR A POLITE UPDATE THE BROWSER NEVER SENT (design 25,
 * decision 5). The page sends when the Undo toast times out, and again with
 * sendBeacon as it is hidden. If the app was killed inside those six seconds
 * neither happens, and the candidate would never hear. This sends anything
 * owed for more than a minute and not yet sent.
 *
 * Daily, like every other scheduled job here (vercel.json). The once-only
 * claim in lib/declineNotice means it can never send something the page
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
