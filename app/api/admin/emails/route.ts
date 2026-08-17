import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * OUR OWN DELIVERY LOG, NOT RESEND'S.
 *
 * This route used to GET https://api.resend.com/emails and could only ever
 * fail: the key is send-scoped, so Resend answers 401 on /emails, /domains and
 * /api-keys alike — every read endpoint, not just the list one. Confirmed on
 * 15 Aug 2026 by calling it with the key the route actually held. The page had
 * therefore never rendered a single row, and because the failure was caught
 * and returned as HTTP 200 with an `error` string, it looked like an empty
 * inbox rather than a broken page.
 *
 * SERVICE ROLE, SERVER SIDE, DELIBERATELY. public.email_log has RLS ENABLED
 * WITH ZERO POLICIES, which denies every role RLS applies to and leaves the
 * service role as the only reader. That is intentional — the table holds every
 * address the product has ever mailed — so this route reads it here and returns
 * only what the page renders. Do not add a policy; do not read it from the
 * client.
 *
 * WHAT THESE NUMBERS ARE NOT: `success` means the Resend API ACCEPTED the send.
 * There is no webhook, so nothing anywhere records a delivery, an open or a
 * bounce. The page says so; see the footnote it renders.
 *
 * THE SHAPE IS FIXED BY A DEPENDENCY, not just by taste: the activation cron
 * (app/api/cron/activation-emails) reads this table as a dedupe guard on
 * (recipient, email_type, success). Those columns must keep their meaning.
 */
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

// Selected from information_schema rather than from memory. A select naming a
// column that does not exist gets the WHOLE request rejected by PostgREST, not
// just that field, and tsc offers no protection on column names.
const COLUMNS = 'id, recipient, email_type, subject, success, provider_message_id, error, created_at'

export async function GET(req: NextRequest) {
  const { authorized } = await verifyAdmin(req)
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const failedOnly = sp.get('failed') === '1'
  const type = (sp.get('type') || '').trim()
  const recipient = (sp.get('recipient') || '').trim()
  const from = (sp.get('from') || '').trim()
  const to = (sp.get('to') || '').trim()
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)

  try {
    // ── The headline, over the WHOLE log ───────────────────────────────────
    // Deliberately not over the current filter: "Failed 1" has to keep meaning
    // "one send has ever failed" when you are looking at a filtered view, or
    // the cards quietly become a second, disagreeing answer to the same
    // question — the /admin/analytics fault in miniature.
    const { data: all, error: allErr } = await supabaseAdmin
      .from('email_log')
      .select('recipient, email_type, success, created_at')
      .order('created_at', { ascending: true })
      .limit(10000)
    if (allErr) throw allErr

    const rows = all || []
    // `sent` WAS rows.length — EVERY ROW, INCLUDING THE FAILURE — sitting
    // beside a separate `failed` card. Add the two cards up and you got 92
    // events against 91 rows, and the page's own footnote already said a send
    // counted here is "one the provider ACCEPTED", which the number then
    // contradicted. Three words, three different facts:
    //   attempted  every row: we tried
    //   accepted   the provider took it
    //   failed     it did not
    // accepted + failed === attempted, by construction rather than by hope.
    const accepted = rows.filter(r => r.success).length
    const failed = rows.filter(r => !r.success).length
    const summary = {
      attempted: rows.length,
      accepted,
      failed,
      types: new Set(rows.map(r => r.email_type)).size,
      recipients: new Set(rows.map(r => r.recipient)).size,
      firstAt: rows[0]?.created_at ?? null,
      lastAt: rows[rows.length - 1]?.created_at ?? null,
    }
    // Offered as filter options so the page never has to guess what exists.
    const typeCounts = Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.email_type] = (acc[r.email_type] || 0) + 1
        return acc
      }, {}),
    )
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)

    // ── The filtered page ──────────────────────────────────────────────────
    let q = supabaseAdmin
      .from('email_log')
      .select(COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })

    if (failedOnly) q = q.eq('success', false)
    if (type) q = q.eq('email_type', type)
    if (recipient) q = q.ilike('recipient', `%${recipient}%`)
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)

    const start = (page - 1) * PAGE_SIZE
    const { data, count, error } = await q.range(start, start + PAGE_SIZE - 1)
    if (error) throw error

    return NextResponse.json({
      emails: data || [],
      summary,
      typeCounts,
      page,
      pageSize: PAGE_SIZE,
      filteredCount: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
    })
  } catch (err: any) {
    // The old route swallowed its failure into a 200 with an `error` string,
    // which is precisely why nobody noticed it had never worked. A failure here
    // is a failure: it gets a 500 and says so.
    console.error('[admin/emails]', err?.message)
    return NextResponse.json({ error: err?.message || 'Failed to read email_log' }, { status: 500 })
  }
}
