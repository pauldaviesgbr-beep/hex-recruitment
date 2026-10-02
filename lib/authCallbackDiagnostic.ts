import type { NextRequest } from 'next/server'

/**
 * TEMPORARY DIAGNOSTIC — REMOVE ONCE IT HAS ANSWERED THE QUESTION.
 *
 * Added 29 Aug 2026 to settle one thing and nothing else: when the auth
 * callback runs, WHICH COOKIES REACHED THE SERVER, and did the request come
 * from a top-level navigation or a nested one.
 *
 * WHY IT EXISTS. Google sign-in from the installed iOS PWA visibly lands back
 * on the login page before reaching the dashboard, and on 29 Aug at 09:21 UTC
 * it failed outright with `flow_state_not_found` — a PKCE exchange whose flow
 * state was created, had a code issued, and was never consumed. The server
 * logs cannot distinguish the PWA from Safari: one callback hit per run in
 * both, identical traces, only ~0.4s more latency in the PWA. The open
 * question is whether the code_verifier cookie arrives at all, and whether
 * @supabase/ssr has chunked it into `.0` / `.1`.
 *
 * THIS IS A DIAGNOSTIC, NOT A FEATURE, AND IT MUST COME OUT. It logs on every
 * callback request in production. When the six-run control has been read, the
 * whole file and its two call sites go.
 *
 * ── THE SAFETY PROPERTY, WHICH IS THE POINT OF PUTTING IT IN ONE FILE ──
 *
 * NAMES ONLY. NEVER A VALUE — not the verifier, not the session, not
 * truncated, not hashed, not a prefix. The code_verifier is a bearer artefact:
 * anything that logs it hands over the ability to complete somebody's sign-in,
 * into a log store neither of us controls.
 *
 * That rule is enforced structurally rather than by remembering it. `.name` is
 * read in a single expression and the cookie objects are discarded on the same
 * line, so nothing downstream is holding a value to leak. There is no code
 * path here that can reach `.value`, and there is deliberately no parameter
 * that could turn one on.
 *
 * Both callback routes call this rather than carrying a copy each. The two
 * routes are near-duplicates already and a second copy of a rule this sharp
 * is exactly how one of them ends up logging a value.
 */
export function logCallbackCookieNames(
  request: NextRequest,
  route: 'employee' | 'employer',
): void {
  // NAMES ONLY — the cookie objects do not survive this expression.
  const names = request.cookies.getAll().map((c) => c.name).sort()

  // @supabase/ssr splits a cookie over 4kB into `<name>.0`, `<name>.1`, …
  // A jar that carries one chunk and not the other reads as no cookie at all.
  const chunked = names.filter((n) => /\.\d+$/.test(n))

  console.log(
    '[cookie-diagnostic] ' +
      JSON.stringify({
        route,
        cookieNames: names,
        chunkedNames: chunked,
        isChunked: chunked.length > 0,
        cookieCount: names.length,
        // Top-level navigation versus a nested or cross-site context — the
        // difference we cannot otherwise see between Safari and the PWA.
        secFetchSite: request.headers.get('sec-fetch-site'),
        secFetchMode: request.headers.get('sec-fetch-mode'),
      }),
  )
}

/**
 * TEMPORARY DIAGNOSTIC, ADDED 2 OCT 2026 — REMOVE WITH THE REST OF THIS FILE.
 *
 * THE QUESTION. On a first in-app Google sign-in, Supabase answers our
 * exchange with `flow_state_not_found`, while the flow row it issued a code
 * for still exists, has its user set, and was written exactly once. Supabase
 * finds a flow ONLY by `auth_code = ?`, so the code that reaches this route
 * is not that row's code — or it is, and the fault is on Supabase's side.
 * Comparing this prefix with the surviving row's `left(auth_code, 8)` settles
 * which.
 *
 * WHY A PREFIX OF THE CODE IS ACCEPTABLE WHEN NO COOKIE VALUE EVER IS. The
 * rule above protects bearer secrets: the verifier and the session. The auth
 * code is different in kind — single-use, short-lived, and unredeemable
 * without the verifier, which never leaves the browser's cookie jar. Eight
 * characters of a 36-character code cannot be redeemed by anyone. It is still
 * capped at eight, by slice, in this one expression, and nothing else from
 * the URL is logged.
 *
 * `x-vercel-id` is the request identifier, so a line can be paired with the
 * Vercel request and the redirect that followed it.
 */
export function logCallbackCodePrefix(
  request: NextRequest,
  route: 'employee' | 'employer',
): void {
  const code8 = new URL(request.url).searchParams.get('code')?.slice(0, 8) ?? null
  console.log(
    '[code-diagnostic] ' +
      JSON.stringify({ route, code8, requestId: request.headers.get('x-vercel-id') }),
  )
}
