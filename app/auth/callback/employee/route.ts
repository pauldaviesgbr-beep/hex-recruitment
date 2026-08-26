import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { safeInternalPath } from '@/lib/safeRedirect'
import { parseAttrCookie, attributionColumns } from '@/lib/attribution'
import { geoColumnsFromRequest } from '@/lib/geo'
import { applyDuplicateHold } from '@/lib/applyDuplicateHold'
import { nameFromAuth, greetingName } from '@/lib/displayName'

function getOrigin(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  if (host) return `${proto}://${host}`
  return new URL(req.url).origin
}

export async function GET(request: NextRequest) {
  const origin = getOrigin(request)
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  // Same-origin return path (e.g. a job's apply page) carried from the Google
  // button so an Apply-initiated sign-in lands back on the job, not /dashboard.
  const nextParam = searchParams.get('next')
  const safeNext = safeInternalPath(nextParam)

  if (error) {
    return NextResponse.redirect(`${origin}/login/employee?error=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login/employee?error=no-code`)
  }

  const redirectTo = `${origin}${safeNext || '/dashboard'}`
  const response = NextResponse.redirect(redirectTo)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.session?.user) {
    console.error('[employee-callback] exchange failed', exchangeError?.message)
    return NextResponse.redirect(`${origin}/login/employee?error=exchange-failed`)
  }

  const user = data.session.user
  const existingRole = user.user_metadata?.role as string | undefined

  if (existingRole === 'employee') {
    return response
  }

  if (existingRole && existingRole !== 'employee') {
    return NextResponse.redirect(`${origin}/login/employee?error=wrong-role&have=${existingRole}`)
  }

  // NO NAME IS BETTER THAN AN INVENTED ONE — see lib/displayName.ts.
  // This used to end `|| user.email?.split('@')[0] || 'User'`, which turns an
  // Apple private relay address into a random ten-character "name" and writes
  // it to the profile employers browse.
  const displayName = nameFromAuth(user)

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, role: 'employee', full_name: displayName },
  })

  // This upsert runs on EVERY OAuth login, not just the first, so anything
  // defaulted here has to be insert-only — otherwise a candidate who hid
  // themselves would be made visible again the next time they signed in.
  const { data: existingProfile } = await admin
    .from('candidate_profiles')
    .select('user_id, job_title, job_sector, preferred_areas')
    .eq('user_id', user.id)
    .maybeSingle()

  // WHERE THEY CAME FROM, AND WHERE FROM. This route was the hole: it is the
  // GOOGLE and LINKEDIN path, it creates the candidate profile, and it wrote
  // neither attribution nor country — so every OAuth signup landed with both
  // null while the email/magic-link path (lib/authCallback.ts) recorded them
  // correctly. Found on 18 Aug when the first signup after the country deploy
  // came in via Google with no country.
  //
  // Header first, cookie as the fallback: this runs on the server and the edge
  // has already resolved the country, but /auth/callback/* is excluded from
  // middleware so the cookie may be the only carrier on this request.
  //
  // The TIMEZONE comes off the cookie only — there is no header for it and no
  // browser on this request. It is set by FirstTouchCapture on the first page
  // they ever loaded, so it is present whenever they reached us through the
  // site and absent when they were deep-linked straight into an OAuth flow.
  const attr = parseAttrCookie(request.headers.get('cookie'))
  const geo = geoColumnsFromRequest(request.headers)

  // INSERT-ONLY, like is_discoverable above and for the same reason: this
  // upsert runs on EVERY OAuth login. Writing attribution on each one would
  // overwrite the channel that originally found them with wherever they
  // happened to be today, and first-touch is the whole point of attribution.
  const firstTouchCols = existingProfile
    ? {}
    : {
        is_discoverable: true,
        ...(attr ? attributionColumns(attr) : {}),
        ...geo,
      }

  await admin.from('candidate_profiles').upsert(
    {
      user_id: user.id,
      full_name: displayName,
      email: user.email || '',
      // New candidates are discoverable by default, and are told so on the
      // welcome screen they land on next.
      ...firstTouchCols,
    },
    { onConflict: 'user_id', ignoreDuplicates: false }
  )

  // FIRST INSERT ONLY — this upsert runs on every OAuth login, so the hold has
  // to gate on the same existingProfile the is_discoverable default gates on.
  if (!existingProfile) await applyDuplicateHold(admin, user.id, displayName)

  fetch(`${origin}/api/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: user.email, type: 'candidate_welcome', data: { candidateName: greetingName(displayName) } }),
  }).catch(() => {})

  // Brand-new candidate → the three-field welcome step, then straight into
  // jobs. This is the whole point of the change: OAuth used to create an empty
  // profile row and drop the candidate on a dashboard with nothing to act on.
  // Returning candidates never see it (they exit at the existingRole check
  // above), and an apply-gate return path is carried through so finishing the
  // step still lands them on the job they came for.
  if (!existingProfile) {
    const welcome = `${origin}/welcome${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`
    const welcomeResponse = NextResponse.redirect(welcome)
    // Carry the session cookies set during the code exchange.
    for (const cookie of response.cookies.getAll()) welcomeResponse.cookies.set(cookie)
    return welcomeResponse
  }

  return response
}
