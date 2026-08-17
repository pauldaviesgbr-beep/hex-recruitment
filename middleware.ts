import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { countryFromHeaders, COUNTRY_COOKIE, COUNTRY_MAX_AGE_DAYS } from '@/lib/geo'

// Keeps the SSR auth cookie in step with the browser's localStorage session.
//
// THE PROBLEM THIS SOLVES
// The browser Supabase client (lib/supabase.ts) runs with autoRefreshToken and
// persistSession, so it rotates its token in localStorage indefinitely. The SSR
// auth cookie, by contrast, was only ever written at login — by
// /api/auth/set-session for the password flow, and by the OAuth / confirm
// callbacks. Nothing refreshed it afterwards.
//
// Supabase refresh tokens are single-use. So over days the client rotates away
// from the token still sitting in the cookie, the cookie's access_token expires,
// and its refresh_token is already spent. The server-side guard in
// app/employer/layout.tsx then gets null from getUser() and redirects to
// /login/employer — while the login page reads the perfectly valid localStorage
// session and pushes straight back to the dashboard. That disagreement is the
// login->dashboard flash, and with a sufficiently dead cookie it becomes an
// outright redirect loop.
//
// Running getUser() here, on every matched navigation, makes @supabase/ssr
// refresh the session while the cookie is still usable and write the rotated
// tokens back onto the response. The cookie therefore never gets the chance to
// drift out of date, which is what removes the flash.
//
// SCOPE NOTE: this prevents drift going forward. It cannot repair a cookie that
// has ALREADY drifted — once the refresh token in the cookie is spent, no amount
// of refreshing recovers it. See the report accompanying this branch.

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  // ── WHERE THE REQUEST CAME FROM ──────────────────────────────────────────
  // The edge tells us the country on every request and we used to throw it
  // away. Carried to the client in a first-party cookie because the candidate
  // and employer signup forms run in the BROWSER and cannot read a request
  // header — the identical problem `thrive_attr` already solves, solved the
  // same way rather than with a second mechanism.
  //
  // STAMPED AT BOTH EXITS, not once at the top: `response` is REASSIGNED by
  // the Supabase cookie adapters below, so anything set on the original object
  // is discarded. And there is an early return above them.
  const country = countryFromHeaders(request.headers)
  const withCountry = (res: NextResponse) => {
    // Absent header means local development, not "unknown" — write nothing,
    // or a dev session looks like a real signup from nowhere.
    if (country) {
      res.cookies.set(COUNTRY_COOKIE, country, {
        path: '/',
        maxAge: COUNTRY_MAX_AGE_DAYS * 86400,
        sameSite: 'lax',
        // Readable by the signup forms, so NOT httpOnly. It is a two-letter
        // country code the browser's own request already revealed — there is
        // nothing here an attacker could not obtain by loading the page.
        httpOnly: false,
      })
    }
    return res
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Mirrors the lazy env guard in lib/supabase.ts: a Preview env without the
  // NEXT_PUBLIC_* vars should degrade to "no refresh", never throw on every
  // request and take the whole site down.
  if (!url || !key) return withCountry(response)

  const supabase = createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value
      },
      // Write the rotated cookie to BOTH the inbound request (so anything later
      // in this same request — layouts, route handlers — reads the fresh value)
      // and the outbound response (so the browser stores it). This is the
      // documented @supabase/ssr middleware pattern; unlike a server component,
      // middleware is allowed to set cookies, which is why the equivalent
      // attempt in app/employer/layout.tsx has to sit in a try/catch and gets
      // silently dropped.
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options })
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options })
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value: '', ...options })
      },
    },
  })

  // The call itself is the point: it validates the access_token and, when it is
  // near or past expiry, transparently refreshes and triggers the cookie
  // adapters above. We deliberately do NOT branch on the result — this
  // middleware refreshes, it does not authorise. Authorisation stays where it
  // already lives (app/employer/layout.tsx and the per-page checks), so this
  // change cannot introduce a new redirect of its own.
  await supabase.auth.getUser()

  return withCountry(response)
}

export const config = {
  matcher: [
    /*
     * Run on everything EXCEPT:
     *
     *   _next/static, _next/image  - build output; no session needed, and
     *                                touching them would cost latency on every
     *                                asset request.
     *   favicon.ico, *.png/jpg/... - static files served from /public.
     *   auth/callback, auth/confirm - these routes establish the session
     *                                themselves via their own cookie-writing
     *                                server clients. Refreshing mid-exchange
     *                                risks consuming the single-use code or
     *                                refresh token before the callback does,
     *                                which is precisely the
     *                                "refresh_token_already_used" failure this
     *                                codebase already hit once (see
     *                                lib/hydrateSessionFromCookies.ts).
     *   api/auth/set-session       - the password-login bridge. It writes the
     *                                cookie from tokens in the POST body;
     *                                middleware must not race it.
     *   reset-password             - lands carrying a single-use recovery code
     *                                and exchanges it client-side. Exactly the
     *                                same hazard as the two callback routes
     *                                above; it was simply missed when they were
     *                                excluded, and a real employer was locked
     *                                out of a reset on 27 Jul before anyone
     *                                noticed the inconsistency.
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|auth/confirm|reset-password|api/auth/set-session|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
}
