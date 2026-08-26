// ONE DEFINITION OF "WHAT IS THIS PERSON CALLED", BECAUSE THERE WERE FOUR.
//
// The same expression was copied into app/auth/callback/employee/route.ts,
// app/auth/callback/employer/route.ts, lib/authCallback.ts and
// components/SessionGuard.tsx:
//
//     user.user_metadata?.full_name || user.user_metadata?.name
//       || user.email?.split('@')[0] || 'User'
//
// ── WHY THE EMAIL FALLBACK HAD TO GO ─────────────────────────────────────
//
// It was harmless while every provider returned a name. Sign in with Apple
// does not: Apple hands over name and email ONCE, on first authorisation
// only, and many users take a private relay address like
// x7f9k2p3q1@privaterelay.appleid.com. So `email.split('@')[0]` becomes a
// random ten-character token — and that token was being WRITTEN to
// candidate_profiles.full_name, shown to employers across /candidates, and
// used to greet them by name in the welcome email.
//
// THE `|| 'User'` AT THE END IS THE WORSE HALF. It guaranteed the column was
// never empty, so nothing downstream could tell a real name from an invented
// one. A fake name in the database is worse than an absent one precisely
// because absence is detectable and a plausible-looking string is not. Same
// family as `area` vs `area_county` — the type system sees `string` either
// way and has nothing to say about what the value is FOR.
//
// So: if we were not told a name, we do not have one. Return null and let
// every caller decide honestly what to do about it.

/** The shape we need off a Supabase auth user. Deliberately structural so
 *  this works for both the server `User` and the client one. */
interface AuthUserish {
  user_metadata?: { full_name?: unknown; name?: unknown } | null
}

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/**
 * The name the identity provider actually gave us, or null.
 *
 * NEVER derives anything from the email address. If you find yourself wanting
 * to, the answer is to ask the person — see /welcome, which prompts for it.
 */
export function nameFromAuth(user: AuthUserish | null | undefined): string | null {
  if (!user) return null
  return clean(user.user_metadata?.full_name) ?? clean(user.user_metadata?.name)
}

/**
 * For greeting somebody in copy — an email, a dashboard header — when we may
 * not know their name.
 *
 * "there" rather than "User": a person reading "Hi there" understands it as a
 * turn of phrase, and a person reading "Hi User" understands that a database
 * field was empty. One is a greeting and the other is a leaked null.
 */
export function greetingName(name: string | null | undefined): string {
  return clean(name) ?? 'there'
}
