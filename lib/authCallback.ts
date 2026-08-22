import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { applyDuplicateHold } from '@/lib/applyDuplicateHold'
import { FREE_FOUNDING_MODE } from '@/lib/constants/cohort'
import { provisionFoundingEmployer } from '@/lib/foundingSignup'
import type { EmailClass } from '@/lib/emailDomains'
import { parseAttrCookie, attributionColumns, type Attribution } from '@/lib/attribution'
import { geoColumnsFromRequest } from '@/lib/geo'
import { safeReturnPath } from '@/lib/safeRedirect'

// Shared OAuth callback logic. Used by:
// - /auth/callback (email flow — reads role from ?role= query param)
// - /auth/callback/employer (Google OAuth — role is always 'employer')
// - /auth/callback/employee (Google OAuth — role is always 'employee')

function getOrigin(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return new URL(req.url).origin
}

function companyNameFromEmail(email: string | undefined): string {
  if (!email) return 'My Company'
  const domain = email.split('@')[1] || ''
  const stem = domain.split('.')[0] || ''
  if (!stem || ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail'].includes(stem.toLowerCase())) {
    return 'My Company'
  }
  return stem.charAt(0).toUpperCase() + stem.slice(1)
}

export async function handleAuthCallback(
  req: NextRequest,
  hardcodedRole?: 'employer' | 'employee'
) {
  const origin = getOrigin(req)

  try {

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const otpType = url.searchParams.get('type') as
    | 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email' | 'email_change' | null
  const nextParam = url.searchParams.get('next')
  const errorParam = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description')

  // Role source priority: hardcoded (path-based) > query param (email flow)
  const roleParam = hardcodedRole || url.searchParams.get('role') as 'employer' | 'employee' | null

  console.log('[auth/callback] GET', {
    origin,
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    otpType,
    nextParam,
    roleParam,
    roleSource: hardcodedRole ? 'path' : 'query',
    errorParam,
  })

  if (errorParam) {
    return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(errorDesc || errorParam)}`)
  }
  if (!code && !tokenHash) {
    return NextResponse.redirect(`${origin}/login?auth_error=missing_code`)
  }

  // Build a placeholder redirect — cookies from exchangeCodeForSession are
  // written onto this response object so they survive the redirect.
  const response = NextResponse.redirect(`${origin}/dashboard`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) { response.cookies.set({ name, value, ...options }) },
        remove(name: string, options: CookieOptions) { response.cookies.set({ name, value: '', ...options }) },
      },
    }
  )
  if (tokenHash && otpType) {
    // Email-link OTP flow: link in the confirmation email points directly
    // at this route with a token_hash. verifyOtp consumes the hash and
    // writes session cookies onto `response` via the SSR cookie adapter.
    console.log('[auth/callback] step:verifyOtp')
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    })
    if (otpError) {
      console.error('[auth/callback] verifyOtp FAILED', otpError.message)
      return NextResponse.redirect(
        `${origin}/login?error=verification_failed&reason=${encodeURIComponent(otpError.message)}`
      )
    }
    console.log('[auth/callback] step:verifyOtp OK')
  } else {
    // Legacy/PKCE flow: emails sent before the template change land here
    // via Supabase /auth/v1/verify → 303 → /auth/confirm?code=...
    console.log('[auth/callback] step:exchange')
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code!)
    if (exchangeError) {
      console.error('[auth/callback] exchangeCodeForSession FAILED', exchangeError.message)
      return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(exchangeError.message)}`)
    }
    console.log('[auth/callback] step:exchange OK')
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    console.error('[auth/callback] getUser FAILED', userError?.message)
    return NextResponse.redirect(`${origin}/login?auth_error=no_user`)
  }
  console.log('[auth/callback] step:getUser OK', { userId: user.id, existingMetaRole: user.user_metadata?.role })

  const existingRole = (user.user_metadata?.role as 'employer' | 'employee' | undefined) || undefined

  if (existingRole && roleParam && existingRole !== roleParam) {
    console.warn('[auth/callback] step:mismatch', { existingRole, roleParam })
    await supabase.auth.signOut()
    const target = roleParam === 'employer' ? '/login/employer' : '/login/employee'
    return NextResponse.redirect(`${origin}${target}?error=wrong_account&have=${existingRole}`)
  }

  const role: 'employer' | 'employee' | undefined = existingRole || roleParam || undefined
  console.log('[auth/callback] step:resolveRole', { existingRole, roleParam, resolvedRole: role })

  if (!role) {
    console.warn('[auth/callback] step:noRole')
    return NextResponse.redirect(`${origin}/login?auth_error=missing_role`)
  }

  const displayName = (user.user_metadata?.full_name as string | undefined)
    || (user.user_metadata?.name as string | undefined)
    || (user.email?.split('@')[0] || 'User')

  // Service-role admin client lifted out of the !existingRole gate so
  // both the new-user setup block AND the always-on profile-row upsert
  // below can use it. The profile-row upsert MUST run for every
  // callback hit, not just first-time signups — email/password signups
  // stamp role into user_metadata at signUp time, so they reach this
  // point with existingRole already set, which used to skip the
  // profile-row creation entirely (the symptom that produced
  // gcal=error&reason=no_profile downstream).
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  // New user: stamp role, bootstrap subscription row, send welcome email
  if (!existingRole) {
    // Use admin.auth.admin.updateUserById to stamp role directly in the
    // database. The route-handler client's updateUser() updates metadata
    // but the new values aren't reflected in the session cookie that was
    // already set by exchangeCodeForSession — so the client-side
    // dashboard would see the old metadata (no role) and redirect away.
    console.log('[auth/callback] step:updateMeta', { userId: user.id, role })
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role, full_name: displayName },
    })
    if (metaError) {
      console.error('[auth/callback] updateUserById FAILED', metaError.message)
    } else {
      console.log('[auth/callback] step:updateMeta OK')
    }

    console.log('[auth/callback] step:refreshSession')
    const { error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) {
      console.error('[auth/callback] refreshSession FAILED', refreshError.message)
    } else {
      console.log('[auth/callback] step:refreshSession OK')
    }

    // Welcome email
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin
    if (role === 'employer') {
      const companyName = (user.user_metadata?.company_name as string | undefined) || companyNameFromEmail(user.email)
      fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.email, type: 'welcome', data: { contactName: displayName, companyName } }),
      }).catch(() => {})
    } else {
      fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.email, type: 'candidate_welcome', data: { candidateName: displayName } }),
      }).catch(() => {})
    }
  }

  // Defensive profile-row upsert — runs on EVERY callback hit, not just
  // first-time signups. The bug this guards against:
  // app/register/employer/page.tsx attempts a client-side upsert
  // immediately after signUp(), but signUp() returns no session when
  // email confirmation is required, so the upsert runs as anon, RLS
  // blocks it, and the error is silently dropped (no { error }
  // destructure). By the time the user clicks the email link and lands
  // here, role is already stamped in user_metadata, so the
  // !existingRole branch above is skipped — leaving the account
  // permanently profile-row-less. Downstream, Google Calendar OAuth
  // callback's UPDATE WHERE user_id = state returns zero rows and the
  // callback redirects to gcal=error&reason=no_profile. The defensive
  // upsert here closes the gap.
  //
  // ignoreDuplicates: true so we never clobber a returning user's
  // edited row — e.g. an employer who edited their company_name in
  // Settings shouldn't have it reset to the email-derived default on
  // their next sign-in.
  // Signup source attribution: prefer what was stamped into user_metadata at
  // signUp; fall back to the first-party thrive_attr cookie (covers OAuth signups
  // that never passed through our metadata-stamping route). Written at row
  // creation only — never overwrites a returning user's row.
  const attrFromMeta: Attribution = {
    signup_ref: (user.user_metadata?.signup_ref as string) || null,
    utm_source: (user.user_metadata?.utm_source as string) || null,
    utm_medium: (user.user_metadata?.utm_medium as string) || null,
    utm_campaign: (user.user_metadata?.utm_campaign as string) || null,
    heard_from: (user.user_metadata?.heard_from as string) || null,
    referrer_host: (user.user_metadata?.referrer_host as string) || null,
  }
  const attrFromCookie = parseAttrCookie(req.headers.get('cookie'))
  const attr: Attribution = {
    signup_ref: attrFromMeta.signup_ref || attrFromCookie?.signup_ref || null,
    utm_source: attrFromMeta.utm_source || attrFromCookie?.utm_source || null,
    utm_medium: attrFromMeta.utm_medium || attrFromCookie?.utm_medium || null,
    utm_campaign: attrFromMeta.utm_campaign || attrFromCookie?.utm_campaign || null,
    heard_from: attrFromMeta.heard_from || attrFromCookie?.heard_from || null,
    referrer_host: attrFromMeta.referrer_host || attrFromCookie?.referrer_host || null,
  }
  // Only write attribution when we actually captured something — never force
  // 'unknown' onto an existing row (e.g. a returning employer re-provisioning).
  // Reporting COALESCEs null -> 'unknown', so organic signups still read as such.
  //
  // referrer_host BELONGS IN THIS LIST. It is the weakest of the signals and
  // the only one that fires on our largest channel — the LinkedIn post whose
  // link is deleted once the card renders — so leaving it out would drop
  // exactly the signups the referrer was added to catch. sourceBasis records
  // that it was an inference, so nothing downstream can mistake it for a tag.
  const hasAttr = !!(attr.signup_ref || attr.utm_source || attr.utm_medium
                     || attr.utm_campaign || attr.heard_from || attr.referrer_host)
  const attrCols = hasAttr ? attributionColumns(attr) : {}

  // WHERE THEY SIGNED UP FROM. The header first, because this route runs on
  // the server and the edge has already resolved it; the cookie only as a
  // fallback for the case where middleware saw the country on an earlier
  // request but this particular one did not carry the header.
  //
  // Same rule as attribution above: write NOTHING when we have nothing. An
  // absent header is local development, and a returning user re-provisioning
  // must not have a real value overwritten with a guess.
  //
  // The TIMEZONE rides along in the same patch. It has no header — only the
  // browser knows it — so it arrives on the cookie FirstTouchCapture set on
  // the first page they loaded. Deliberately not derived from the country:
  // the US spans six zones and Australia five.
  const geoCols = geoColumnsFromRequest(req.headers)

  if (role === 'employer') {
    // Confirmation-time founding-row provisioning. Runs on EVERY callback
    // hit (not just !existingRole) because email signups stamp the role
    // into user_metadata at signUp time, so the user reaches /auth/confirm
    // with existingRole already set and the new-user gate skips. The
    // provisioning function is idempotent — every upsert uses
    // ignoreDuplicates, and approval_status is settled through a guarded
    // update that only fires when it is still NULL. So re-runs on a
    // returning user are no-ops.
    //
    // This claimed idempotency BEFORE it was true: the profile upsert used a
    // bare onConflict, which rewrites, so every sign-in reset approval_status
    // and bounced an approved employer to /account-under-review.
    // Under FREE_FOUNDING_MODE this is the FIRST and ONLY place a founding
    // row is written — form submit no longer creates one. The
    // classification stamped in user_metadata by /api/auth/employer-signup
    // decides whether the signup goes straight to approved + founding row,
    // or sits at approval_status='pending' awaiting manual review. See
    // lib/foundingSignup.ts for the full branching logic.
    const companyName = (user.user_metadata?.company_name as string | undefined) || companyNameFromEmail(user.email)
    const metadataClass = user.user_metadata?.email_domain_class as EmailClass | undefined
    const siteUrlForProvision = process.env.NEXT_PUBLIC_SITE_URL || origin

    if (FREE_FOUNDING_MODE) {
      await provisionFoundingEmployer({
        admin,
        userId: user.id,
        email: user.email,
        companyName,
        contactName: displayName,
        metadataClass,
        siteUrl: siteUrlForProvision,
        attribution: { ...attrCols, ...geoCols },
      })
    } else {
      // Pre-pivot path preserved for the flag-off future.
      await admin
        .from('employer_subscriptions')
        .upsert(
          { user_id: user.id, subscription_status: 'inactive', subscription_tier: 'standard' },
          { onConflict: 'user_id', ignoreDuplicates: true },
        )
      // Defensive profile upsert (kept for parity with pre-pivot behaviour
      // that the original code at this site provided).
      const { error: profileErr } = await admin
        .from('employer_profiles')
        .upsert(
          { user_id: user.id, company_name: companyNameFromEmail(user.email), contact_name: displayName, email: user.email || '' },
          { onConflict: 'user_id', ignoreDuplicates: true }
        )
      if (profileErr) console.error('[auth/callback] employer_profiles defensive upsert failed', profileErr)
    }
  } else {
    const { error: profileErr } = await admin
      .from('candidate_profiles')
      .upsert(
        {
          user_id: user.id,
          full_name: displayName,
          email: user.email || '',
          // New candidates are discoverable by default — they're told so on the
          // welcome screen and can switch it off with "Hide my profile".
          // ignoreDuplicates below means this only ever lands on insert, so a
          // candidate who hid themselves is never flipped back on.
          is_discoverable: true,
          ...attrCols,
          ...geoCols,
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
    if (profileErr) console.error('[auth/callback] candidate_profiles defensive upsert failed', profileErr)
    // ignoreDuplicates:true above means this upsert only ever lands on INSERT,
    // so reaching here on an existing row is impossible and no extra guard is
    // needed — the path itself is the guard.
    if (!profileErr) await applyDuplicateHold(admin, user.id, displayName)
  }

  // Route decision: under FREE_FOUNDING_MODE the founding cohort gets
  // dashboard access immediately — no card collection, no Stripe step —
  // UNLESS they're sitting at approval_status='pending'/'rejected'/
  // 'waitlisted', in which case they belong on the under-review page.
  // Pre-pivot behaviour (Stripe required before dashboard) is preserved
  // for when the flag is flipped off.
  // Honor ?next= only for returning users — same-origin only.
  //
  // THE TEST USED TO BE `existingRole`, AND THAT IS NOT WHAT "RETURNING"
  // MEANS. Email sign-ups stamp the role into user_metadata at signUp time
  // (see the comment above, and CandidateSignupForm's `data: { role }`), so
  // existingRole is true for somebody who has existed for ninety seconds and
  // has never seen a single screen. The first branch therefore always won for
  // them, and /welcome — the three-field step built precisely because
  // candidates were being left at name-only — was skipped by EVERY email
  // sign-up since it was written. It was never skipped for OAuth, where no
  // role is stamped until this route runs, so the two paths silently
  // disagreed and only the OAuth one behaved as designed.
  //
  // `type=signup` is the honest discriminator: that token is minted once, for
  // a first confirmation, and cannot be the artefact of a returning visit.
  // Recovery (`type=recovery` → /reset-password) and the OAuth code flow
  // (no otpType at all) both keep their existing behaviour exactly.
  const isFirstConfirmation = otpType === 'signup'
  let destination = '/dashboard'
  // safeReturnPath, not safeInternalPath: the confirmation template hands us
  // Supabase's `{{ .RedirectTo }}`, which is an absolute URL. `origin` comes
  // from the request, never from the query string.
  const safeNext = safeReturnPath(nextParam, origin)
  if (!isFirstConfirmation && existingRole && safeNext) {
    destination = safeNext
  } else if (role === 'employee') {
    // A candidate reaching this route is confirming their email — a one-time,
    // single-use link — so this is their first way in. Send them to the
    // three-field welcome step rather than a dashboard with an empty profile,
    // which is what left most candidates at name-only. Any apply-gate return
    // path is carried through so they still land on the job afterwards.
    destination = safeNext ? `/welcome?next=${encodeURIComponent(safeNext)}` : '/welcome'
  } else if (role === 'employer') {
    if (FREE_FOUNDING_MODE) {
      const { data: profile } = await admin
        .from('employer_profiles')
        .select('approval_status')
        .eq('user_id', user.id)
        .maybeSingle()
      const status = profile?.approval_status
      if (status === 'pending' || status === 'rejected' || status === 'waitlisted') {
        destination = '/account-under-review'
      } else {
        destination = '/employer/dashboard'
      }
    } else if (!existingRole) {
      destination = '/register/employer/payment'
    } else {
      const checkAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      )
      const { data: sub } = await checkAdmin
        .from('employer_subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle()
      destination = sub?.stripe_subscription_id
        ? '/employer/dashboard'
        : '/register/employer/payment'
    }
  }
  console.log('[auth/callback] success', { userId: user.id, role, destination, isNewUser: !existingRole })

  // Build the final redirect, copying session cookies from the exchange response
  const finalRedirect = NextResponse.redirect(`${origin}${destination}`)
  response.cookies.getAll().forEach(cookie => { finalRedirect.cookies.set(cookie) })
  return finalRedirect

  } catch (err: any) {
    console.error('[auth/callback] UNHANDLED ERROR', err?.message, err?.stack?.slice(0, 500))
    return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(err?.message || 'unknown_error')}`)
  }
}
