import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Stop pushing to this device. Called on sign-out and when someone turns push
 * off.
 *
 * DELETES rather than revokes, because this is the user asking. revoked_at is
 * for the other case — a token the PROVIDER told us is dead, which is kept so
 * that "no working device" and "never registered" stay distinguishable in the
 * data. A person switching push off should leave no row at all.
 *
 * Guarded on the session user AND the token, so a caller cannot unregister
 * somebody else's device by guessing a token.
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

  let body: { token?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const token = (body.token || '').toString().trim()
  if (!token) return NextResponse.json({ error: 'invalid_token' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('device_tokens')
    .delete()
    .eq('token', token)
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    console.error('[push/unregister] failed:', error.message)
    return NextResponse.json({ error: 'unregister_failed' }, { status: 500 })
  }
  // Zero rows is not an error — unregistering a token that is already gone is
  // the expected result of a retry, and the caller wanted it gone either way.
  return NextResponse.json({ ok: true, removed: data?.length ?? 0 })
}
