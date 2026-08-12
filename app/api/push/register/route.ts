import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Register this device's push token against the signed-in user.
 *
 * THE USER COMES FROM THE SESSION, never from the payload — the same rule as
 * the remove-ad endpoint. A caller supplying a user_id could otherwise register
 * their own handset against somebody else's account and receive that person's
 * notifications, which is the worst failure this endpoint could have.
 *
 * RE-REGISTRATION IS THE NORMAL CASE. FCM reissues a token on reinstall, on
 * restore, and periodically on its own, and the app will register on every
 * launch. So this is an upsert on the token: a repeat refreshes last_seen_at
 * and clears any revocation, rather than growing a second row that would send
 * the same person the same notification twice.
 */
export const dynamic = 'force-dynamic'

const PLATFORMS = new Set(['android', 'ios', 'web'])

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
  // COOKIES OR A BEARER TOKEN. The website holds a cookie session; an app —
  // which is the whole reason this endpoint exists — holds a bearer. Accepting
  // only cookies would 401 every real caller, which is exactly what happened
  // the first time this was driven.
  let user = (await supabase.auth.getUser()).data.user
  if (!user) {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '')
    if (bearer) user = (await supabaseAdmin.auth.getUser(bearer)).data.user ?? null
  }
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  let body: { token?: string; platform?: string; endpoint?: string; p256dh?: string; auth?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

  const platform = (body.platform || '').toString().trim()
  if (!PLATFORMS.has(platform)) return NextResponse.json({ error: 'invalid_platform' }, { status: 400 })

  // TWO TRANSPORTS, ONE ENDPOINT. A native app sends an FCM `token`; a browser
  // sends a Web Push subscription (endpoint + two keys). They are stored in
  // different columns and sent by different senders — see the device_tokens
  // migration for why they are not crammed into one field.
  const token = (body.token || '').toString().trim()
  const endpoint = (body.endpoint || '').toString().trim()
  const p256dh = (body.p256dh || '').toString().trim()
  const auth = (body.auth || '').toString().trim()
  const isWebPush = endpoint.length > 0

  if (isWebPush) {
    if (token) return NextResponse.json({ error: 'send_token_or_subscription_not_both' }, { status: 400 })
    if (!/^https:\/\//.test(endpoint)) return NextResponse.json({ error: 'invalid_endpoint' }, { status: 400 })
    // Validate the key SIZES here, not just their presence. A subscription with
    // a short auth secret encrypts to something the browser cannot read: the
    // push service accepts it, we count it as sent, and nothing is ever shown.
    // Rejecting at the door beats storing a row that can only fail silently.
    const p256dhLen = Buffer.from(p256dh, 'base64url').length
    const authLen = Buffer.from(auth, 'base64url').length
    if (p256dhLen !== 65 || authLen !== 16) {
      return NextResponse.json({ error: 'invalid_subscription_keys' }, { status: 400 })
    }
  } else if (!token || token.length < 20) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  // Service role for the write: the token is unique across ALL users, so an
  // upsert has to be able to see and replace a row that currently belongs to
  // someone else — the case where a handset is handed on or an account is
  // switched on the same device. RLS would hide that row and the upsert would
  // fail on the unique constraint instead of moving the token.
  const now = new Date().toISOString()
  const { data, error } = isWebPush
    ? await supabaseAdmin
        .from('device_tokens')
        .upsert(
          { user_id: user.id, token: null, endpoint, p256dh, auth, platform, revoked_at: null, last_seen_at: now },
          { onConflict: 'endpoint' },
        )
        .select('id')
    : await supabaseAdmin
        .from('device_tokens')
        .upsert(
          { user_id: user.id, token, endpoint: null, p256dh: null, auth: null, platform, revoked_at: null, last_seen_at: now },
          { onConflict: 'token' },
        )
        .select('id')

  if (error) {
    console.error('[push/register] failed:', error.message)
    return NextResponse.json({ error: 'register_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: data?.[0]?.id ?? null })
}
