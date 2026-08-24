import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

// THE DOORBELL, NOT THE DOOR.
//
// This records a UK GDPR erasure request and tells a human about it. IT DELETES
// NOTHING. Erasure is a separate, deliberate script that enumerates every
// dependent row and every storage object and is run by a person; wiring it to
// an HTTP request would be the opposite of careful.
//
// WHY THIS EXISTS AT ALL. The control it serves used to be theatre: clicking
// "Confirm Request" fired ZERO network requests and then told the person
// "Data deletion request submitted. You will receive a confirmation email
// within 48 hours." Nothing was recorded, nobody was emailed, nothing was
// deleted, and the promised email gave them a reason not to chase. Measured on
// production 24 Aug 2026 by counting what left the browser.
//
// THE ROW IS THE PRIMARY ARTEFACT AND THE EMAIL IS THE NOTIFICATION, in that
// order. If Resend is down the request still exists and is still findable; the
// response says so honestly rather than reporting a failure the person cannot
// act on. The reverse — emailing and not recording — is how you end up with a
// request that lives only in one inbox.

export const dynamic = 'force-dynamic'

// UK GDPR allows one month. The Privacy Policy already publishes "within 30
// days", so that is what is promised here — the number we can keep, and the
// one already in writing. NOT the 48 hours the old copy invented.
const RESPONSE_DAYS = 30

// Proven to arrive. privacy@ was published in the policy for months and never
// existed — no mailbox, no catch-all, no bounce. Only contact@ and paul@ have
// ever been shown to receive anything, so nothing else goes here.
const NOTIFY = 'contact@thrivecareer.co.uk'

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  // The caller's own token, so the insert runs as them and RLS decides. The
  // service key is used only to look up whether a request is already open,
  // because that read has to be reliable even if a policy changes later.
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer /i, '')
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user }, error: userErr } = await asUser.auth.getUser()
  if (userErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const role = user.user_metadata?.role === 'employer' ? 'employer' : 'candidate'
  const email = user.email || ''

  // ALREADY OPEN IS NOT AN ERROR. Someone clicking twice because the first
  // click was not obvious enough is the most likely repeat, and telling them
  // "that failed" would be both false and alarming.
  const { data: existing } = await asUser
    .from('deletion_requests')
    .select('id, requested_at')
    .eq('user_id', user.id)
    .eq('status', 'open')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyOpen: true,
      requestedAt: existing.requested_at,
      responseDays: RESPONSE_DAYS,
    })
  }

  const { data: row, error: insErr } = await asUser
    .from('deletion_requests')
    .insert({ user_id: user.id, email, role })
    .select('id, requested_at')
    .single()

  if (insErr || !row) {
    // The unique partial index can also land here if two clicks race. Either
    // way the person is told the truth: we did not record it, try again.
    console.error('[deletion-request] insert failed:', insErr?.message)
    return NextResponse.json({ error: 'Could not record your request' }, { status: 500 })
  }

  // ── the notification. The row is already safe; this is best effort. ──
  let notified = false
  try {
    const admin = service ? createClient(url, service, { auth: { persistSession: false } }) : null
    const when = new Date(row.requested_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    const html =
      `<p><strong>A ${role} has asked for their account and data to be deleted.</strong></p>` +
      `<p>Email: ${email}<br>User id: ${user.id}<br>Requested: ${when}<br>` +
      `Request id: ${row.id}</p>` +
      `<p>They have been told we will reply within ${RESPONSE_DAYS} days.</p>` +
      `<p>Nothing has been deleted. This is a record and a notification only.</p>`
    const sent = await sendEmail(
      NOTIFY,
      `Data deletion request — ${email}`,
      html,
      NOTIFY,
      undefined,
      { emailType: 'deletion_request' },
    )
    notified = sent.success
    if (!sent.success && admin) {
      await admin.from('deletion_requests')
        .update({ note: `notify failed: ${sent.error || 'unknown'}` })
        .eq('id', row.id)
    }
  } catch (e: any) {
    // NEVER FAIL THE REQUEST BECAUSE THE EMAIL FAILED. The person exercised a
    // legal right and we have it in writing; a mail outage is our problem.
    console.error('[deletion-request] notify threw:', e?.message)
  }

  return NextResponse.json({
    ok: true,
    alreadyOpen: false,
    requestedAt: row.requested_at,
    responseDays: RESPONSE_DAYS,
    notified,
  })
}

// Does this person already have one outstanding? The screen asks on load so it
// can say "we have your request" rather than offering the button again — being
// left unsure a second time is the whole fault this replaces.
export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json({ open: null })

  const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '')
  if (!token) return NextResponse.json({ open: null })

  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ open: null })

  const { data } = await asUser
    .from('deletion_requests')
    .select('id, requested_at')
    .eq('user_id', user.id)
    .eq('status', 'open')
    .maybeSingle()

  return NextResponse.json({
    open: data ? { requestedAt: data.requested_at } : null,
    responseDays: RESPONSE_DAYS,
  })
}
