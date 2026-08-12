import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendWebPush, webPushConfigured } from '@/lib/webpush'

/**
 * Push a test notification TO THE CALLER AND ONLY THE CALLER.
 *
 * Exists because no automated browser can hold a real push subscription, so the
 * last link in the chain can only be closed on a real device. Paired with
 * /diag-push.
 *
 * THE RECIPIENT COMES FROM THE SESSION AND CANNOT BE SUPPLIED. There is no
 * user id in the request body and no admin override — the worst thing this
 * endpoint could possibly do is let someone push to a stranger, so it is not
 * capable of addressing anyone but whoever is signed in.
 *
 * It writes NOTHING: no notifications row, no push_log row. A test must not
 * pollute the tables the heartbeat reads, or tomorrow's receipt reports an
 * inconsistency that was really just us checking.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value },
        set(_n: string, _v: string, _o: CookieOptions) {},
        remove(_n: string, _o: CookieOptions) {},
      },
    },
  )
  let user = (await supabase.auth.getUser()).data.user
  if (!user) {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '')
    if (bearer) user = (await supabaseAdmin.auth.getUser(bearer)).data.user ?? null
  }
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  if (!webPushConfigured()) {
    return NextResponse.json({ error: 'no_vapid_keys', hint: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing on the server' }, { status: 503 })
  }

  const { data: subs } = await supabaseAdmin
    .from('device_tokens')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id)
    .not('endpoint', 'is', null)
    .is('revoked_at', null)

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: false, reason: 'no_subscription', hint: 'tap step 1 first' })
  }

  const results: { status: number; ok: boolean; error?: string }[] = []
  for (const s of subs) {
    const r = await sendWebPush(
      { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string },
      {
        title: 'Thrive test push',
        body: 'If you can read this, the whole chain works.',
        url: '/diag-push',
        tag: 'thrive-diag',
      },
    )
    results.push(r.ok ? { status: r.status, ok: true } : { status: r.status, ok: false, error: r.error })
    // A dead subscription is revoked here too, so a stale row from a previous
    // test does not keep reporting failure forever.
    if (!r.ok && r.gone) {
      await supabaseAdmin.from('device_tokens')
        .update({ revoked_at: new Date().toISOString() }).eq('id', s.id)
    }
  }

  return NextResponse.json({ ok: results.some(r => r.ok), subscriptions: subs.length, results })
}
