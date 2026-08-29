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
