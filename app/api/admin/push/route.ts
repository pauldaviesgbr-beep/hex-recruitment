import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * THE PUSH DELIVERY LOG — ITS OWN SURFACE, NOT A SECOND EMAIL TABLE.
 *
 * push_log is not email_log's cousin, which is why it gets its own route:
 * it is addressed to a USER ID rather than a string, it has no recipient or
 * subject, and it carries `outcome` — a text column with no equivalent on the
 * email side, and the place where the actual information lives. `success` alone
 * says 45 failures; `outcome` says 34 of them had no device to send to, which
 * is a completely different fact about the product.
 *
 * SERVICE ROLE, SERVER SIDE: push_log has RLS ENABLED WITH ZERO POLICIES,
 * exactly like email_log. The service role is the only reader.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS TABLE CANNOT SEE, AND WHY THE PAGE MUST SAY SO.
 *
 * /api/diag-push/send — the on-device test — writes NOTHING here, by design,
 * so that a test cannot pollute the tables the heartbeat reads. On 13 Aug 2026
 * a real push reached a real handset through that route and left no row.
 *
 * Reading these rows without knowing that, you conclude "push has never
 * succeeded". That conclusion was reached, in good faith, from this exact data
 * on 15 Aug 2026, and it was wrong: the delivery chain works and it is the
 * AUTOMATIC path that has never had a recipient with a device. The page
 * carries that caveat for the next person, because the table cannot.
 * ────────────────────────────────────────────────────────────────────────────
 */
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const COLUMNS = 'id, user_id, notification_id, notification_type, title, success, outcome, provider_message_id, error, created_at'

export async function GET(req: NextRequest) {
  const { authorized } = await verifyAdmin(req)
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const failedOnly = sp.get('failed') === '1'
  const outcome = (sp.get('outcome') || '').trim()
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)

  try {
    const { data: all, error: allErr } = await supabaseAdmin
      .from('push_log')
      .select('outcome, success, created_at')
      .order('created_at', { ascending: true })
      .limit(10000)
    if (allErr) throw allErr

    const rows = all || []
    const byOutcome = Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.outcome] = (acc[r.outcome] || 0) + 1
        return acc
      }, {}),
    )
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)

    // hook_fires counts how many times the database trigger fired. The
    // dispatcher writes a row on EVERY path including its own failures, so
    // fires > attempts means the route was never reached at all — an
    // unreachable dispatcher, a rejected secret, a timeout. That difference is
    // the entire reason this counter exists, so it is surfaced rather than
    // computed and dropped.
    const { data: stats } = await supabaseAdmin
      .from('push_dispatch_stats')
      .select('hook_fires, last_fired_at')
      .maybeSingle()

    // One live subscription is the ceiling on what any of this can deliver.
    const { count: liveTokens } = await supabaseAdmin
      .from('device_tokens')
      .select('id', { count: 'exact', head: true })
      .is('revoked_at', null)

    const attempts = rows.length
    const delivered = rows.filter(r => r.success).length
    const hookFires = stats?.hook_fires ?? null
    const summary = {
      hookFires,
      attempts,
      delivered,
      noDevice: byOutcome.find(o => o.key === 'no_tokens')?.count ?? 0,
      liveTokens: liveTokens ?? 0,
      unlogged: hookFires == null ? null : Math.max(0, hookFires - attempts),
      lastFiredAt: stats?.last_fired_at ?? null,
      firstAt: rows[0]?.created_at ?? null,
    }

    let q = supabaseAdmin
      .from('push_log')
      .select(COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
    if (failedOnly) q = q.eq('success', false)
    if (outcome) q = q.eq('outcome', outcome)

    const start = (page - 1) * PAGE_SIZE
    const { data, count, error } = await q.range(start, start + PAGE_SIZE - 1)
    if (error) throw error

    return NextResponse.json({
      pushes: data || [],
      summary,
      byOutcome,
      page,
      pageSize: PAGE_SIZE,
      filteredCount: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
    })
  } catch (err: any) {
    console.error('[admin/push]', err?.message)
    return NextResponse.json({ error: err?.message || 'Failed to read push_log' }, { status: 500 })
  }
}
