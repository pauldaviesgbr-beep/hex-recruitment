// GET /api/cron/report-alerts — the daily sweep for reports nobody was told about.
//
// ReportControl asks /api/report/alert to email Thrive straight after a report
// is filed. If that call never happens (the page closed, the signal dropped,
// the send failed), the report sits with alerted_at null and this sweep sends
// it. Daily is enough for Apple's 24-hour expectation; the immediate alert is
// the normal path.
//
// FAILS CLOSED: with no CRON_SECRET set it refuses, rather than letting anyone
// trigger it. It only ever emails Thrive (lib/reportAlert.ts).

import { NextRequest, NextResponse } from 'next/server'
import { alertReport, unalertedReportIds } from '@/lib/reportAlert'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ids = await unalertedReportIds()
  const tally: Record<string, number> = { sent: 0, already: 0, missing: 0, failed: 0 }
  for (const id of ids) tally[await alertReport(id)]++

  // One receipt line per run, so "it ran and found nothing" is visible.
  console.log(`[report-alerts] waiting ${ids.length} · sent ${tally.sent} · failed ${tally.failed}`)
  return NextResponse.json({ waiting: ids.length, ...tally })
}
