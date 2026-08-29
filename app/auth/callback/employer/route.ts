import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { FREE_FOUNDING_MODE } from '@/lib/constants/cohort'
import { provisionFoundingEmployer } from '@/lib/foundingSignup'
import type { EmailClass } from '@/lib/emailDomains'
import { safeInternalPath } from '@/lib/safeRedirect'
import { parseAttrCookie, attributionColumns } from '@/lib/attribution'
import { geoColumnsFromRequest } from '@/lib/geo'
import { nameFromAuth } from '@/lib/displayName'
import { companyNameFromEmail } from '@/lib/emailDomains'

function getOrigin(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  if (host) return `${proto}://${host}`
  return new URL(req.url).origin
}

// See lib/emailDomains.ts. This was the second of three copies, and it had
// ALREADY DRIFTED from the first — same eight strings, different stem
// extraction. All three were about to be wrong the same new way.

// Google OAuth callback for the employer flow. Under free-founding-mode
// this now mirrors the email-confirmation callback in lib/authCallback.ts:
//   - business-domain Google account → provision tier='free', land on dashboard
//   - freemail-domain Google account → approval_status='pending', land on
//     /account-under-review, approval email sent to Paul
// Pre-pivot behaviour (force /register/employer/payment) is preserved
// for when FREE_FOUNDING_MODE flips off.
export async function GET(request: NextRequest) {
  const origin = getOrigin(request)
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  // Same-origin return path carried from the employer login page's OAuth
  // buttons (e.g. they were bounced off /post-job). Honoured only at the final
  // dashboard destination, and only for returning employers — see below.
  const safeNext = safeInternalPath(searchParams.get('next'))

  console.log('[employer-callback] GET', { origin, hasCode: Boolean(code), error })

  if (error) {
    return NextResponse.redirect(`${origin}/login/employer?error=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login/employer?error=no-code`)
  }

  // Placeholder redirect — final destination is decided below after we
  // know the approval status.
  const response = NextResponse.redirect(`${origin}/employer/dashboard`)

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
    console.error('[employer-callback] exchange failed', exchangeError?.message)
    // A FIXED TOKEN, NOT supabase-js's SENTENCE. This used to put
    // exchangeError.message straight into the URL, where it would have been
    // rendered verbatim the moment anything displayed this parameter — the
    // exact fault lib/loginErrors.ts exists to prevent, in a route written
    // before it. It also made the set of possible values infinite, so
    // "handle every value the routes can produce" was unanswerable.
    // The real message is still logged above, where it is useful and private.
    return NextResponse.redirect(`${origin}/login/employer?error=exchange-failed`)
  }

  const user = data.session.user
  const existingRole = user.user_metadata?.role as string | undefined

  // Wrong role on this Google account — bounce to login/employer
  if (existingRole && existingRole !== 'employer') {
    return NextResponse.redirect(`${origin}/login/employer?error=wrong-role&have=${existingRole}`)
  }

  // NO NAME IS BETTER THAN AN INVENTED ONE — see lib/displayName.ts.
  // This used to end `|| user.email?.split('@')[0] || 'User'`, which turns an
  // Apple private relay address into a random ten-character "name" and writes
  // it to the profile employers browse.
  const displayName = nameFromAuth(user)
  const companyName = companyNameFromEmail(user.email)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  // Stamp role for new users (safe to skip if already set)
  if (!existingRole) {
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role: 'employer', full_name: displayName },
    })
  }

  // Provision the founding signup under FREE_FOUNDING_MODE. For OAuth
  // there's no metadataClass stamp (the user didn't go through our
  // signup route), so provisionFoundingEmployer re-classifies the email.
  // Returns 'approved' / 'pending' / 'noop_legacy_mode'.
  let provision: Awaited<ReturnType<typeof provisionFoundingEmployer>> | null = null
  if (FREE_FOUNDING_MODE) {
    if (!existingRole) {
      provision = await provisionFoundingEmployer({
        admin,
        userId: user.id,
        email: user.email,
        companyName,
        contactName: displayName,
        metadataClass: user.user_metadata?.email_domain_class as EmailClass | undefined,
        siteUrl,
        // THE SAME HOLE AS THE CANDIDATE OAUTH ROUTE. This call omitted
        // `attribution` entirely, so every employer who signed up through
        // Google or LinkedIn recorded no channel and no country — while the
        // email path through lib/authCallback.ts passed both. Ricci's two
        // accounts are the worked example: Google and LinkedIn, both blank.
        //
        // Only sent when there is something to send. provisionFoundingEmployer
        // spreads this straight into an upsert, and an explicit null would
        // overwrite a real value on a returning user with a guess.
        attribution: (() => {
          const attr = parseAttrCookie(request.headers.get('cookie'))
          return {
            ...(attr ? attributionColumns(attr) : {}),
            ...geoColumnsFromRequest(request.headers),
          }
        })(),
      })
    } else {
      // Returning user — read current approval status to route correctly.
      const { data: profile } = await admin
        .from('employer_profiles')
        .select('approval_status')
        .eq('user_id', user.id)
        .maybeSingle()
      const status = profile?.approval_status
      if (status === 'pending' || status === 'rejected' || status === 'waitlisted') {
        const pendingRedirect = NextResponse.redirect(`${origin}/account-under-review`)
        response.cookies.getAll().forEach(c => pendingRedirect.cookies.set(c))
        return pendingRedirect
      }
    }
  } else {
    // Pre-pivot: bootstrap a placeholder subscription row, send to
    // /register/employer/payment for card collection.
    if (!existingRole) {
      await admin.from('employer_profiles').upsert(
        { user_id: user.id, company_name: companyName, contact_name: displayName, email: user.email || '' },
        { onConflict: 'user_id', ignoreDuplicates: true },
      )
      const { data: sub } = await admin
        .from('employer_subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!sub?.stripe_subscription_id) {
        const paymentRedirect = NextResponse.redirect(`${origin}/register/employer/payment`)
        response.cookies.getAll().forEach(c => paymentRedirect.cookies.set(c))
        return paymentRedirect
      }
    }
  }

  // Welcome email for genuinely new employers
  if (!existingRole && provision?.status === 'approved') {
    fetch(`${siteUrl}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: user.email, type: 'welcome', data: { contactName: displayName, companyName } }),
    }).catch(() => {})
  }

  // Final destination
  if (provision?.status === 'pending') {
    const pendingRedirect = NextResponse.redirect(`${origin}/account-under-review`)
    response.cookies.getAll().forEach(c => pendingRedirect.cookies.set(c))
    console.log('[employer-callback] new pending employer → under-review', { userId: user.id })
    return pendingRedirect
  }

  // Honour ?next= only for RETURNING employers, and only once every gating
  // state above (pending approval, payment) has been cleared — those must not
  // be skipped by a deep link. Mirrors the rule in lib/authCallback.ts: a
  // brand-new employer gets the standard first-run landing instead.
  if (existingRole && safeNext) {
    const nextRedirect = NextResponse.redirect(`${origin}${safeNext}`)
    response.cookies.getAll().forEach(c => nextRedirect.cookies.set(c))
    console.log('[employer-callback] employer → next', { userId: user.id, safeNext })
    return nextRedirect
  }

  console.log('[employer-callback] employer → dashboard', { userId: user.id, isNew: !existingRole, status: provision?.status })
  return response
}
