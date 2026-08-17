import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

// Admin queries live data — must not be statically prerendered.
export const dynamic = 'force-dynamic'

/**
 * WHEN CANDIDATES ARE ACTIVE, AND WHERE THEY COME FROM.
 *
 * All the work is in public.admin_activity(), because the sign-in times live
 * in auth.sessions and PostgREST only exposes `public` — no key, however
 * privileged, can select that table over the REST API.
 *
 * WHAT THE NUMBERS ARE, so nobody has to reverse-engineer it from a chart:
 *
 *   SIGN-INS are rows in auth.sessions, one written when a session STARTS.
 *   They are not visits: somebody who stays signed in and comes back next
 *   week creates no new row. So this measures how often people come back and
 *   log in, which is the closest honest proxy for "when are they active".
 *
 *   TIMES ARE UK LOCAL (Europe/London), converted per row so BST and GMT are
 *   each right. They are NOT UTC and NOT Paul's UTC+3 — the question is when
 *   the CANDIDATE was awake, and every candidate on this board is in the UK.
 *
 *   COUNTRIES fill forward only, from 17 Aug 2026. Every earlier row is null
 *   and is reported as its own "not recorded" number rather than folded into
 *   a total, which would understate every real country.
 *
 * WHY job_views IS NOT THE HEADLINE, having looked: it offers 161 events
 * against sign-ins' 67 and a much sharper midday peak — but ONE candidate
 * produced 37 of them and the top five produced 52%. That distribution is a
 * handful of people's browsing habit, not the population's, and the two
 * signals genuinely disagree (40% vs 24% in the 12:00–14:59 band). The
 * smaller, flatter signal is the honest one: 67 sign-ins across 58 people is
 * barely more than one each.
 */
export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const db = createAdminClient(token)
  const { data, error } = await db.rpc('admin_activity')

  if (error) {
    // A failure is a failure. The estate's own lesson: a route that swallows
    // its error into a 200 is why /admin/emails looked like an empty inbox
    // for weeks rather than a broken page.
    console.error('[admin/activity]', error.message)
    return NextResponse.json({ error: error.message || 'Failed to read activity' }, { status: 500 })
  }

  return NextResponse.json(data)
}
