/**
 * IS SIGN IN WITH APPLE ACTUALLY USABLE YET?
 *
 * ONE ANSWER, IN ONE PLACE, because three surfaces ask it and three copies of
 * a boolean is how two of them end up disagreeing. Same argument as the three
 * copies of companyNameFromEmail, which had already drifted before anybody
 * looked.
 *
 * WHY A FLAG AT ALL. The button cannot work until a Services ID and a signing
 * key exist in the Supabase dashboard — those are Apple Developer portal
 * items, and they are Paul's to create. Until then signInWithOAuth returns
 * "Unsupported provider" and the person is left staring at an error on a
 * sign-in page. A sign-in button that signs nobody in is worse than no button:
 * it reads as our product being broken, on the screen where that costs most.
 *
 * IT FAILS CLOSED, AND THAT IS THE DELIBERATE DIRECTION. Anything other than
 * the exact string 'true' means off — unset, empty, 'false', 'TRUE', a typo.
 * The cost of being wrongly OFF is that Apple sign-in is missing for a while,
 * which is today's state anyway. The cost of being wrongly ON is a dead button
 * in front of real people.
 *
 * NEXT_PUBLIC_ because the buttons are client components. It says nothing
 * secret — only whether a provider is switched on.
 *
 * TWO CONSEQUENCES OF NEXT_PUBLIC_ THAT ARE EASY TO MISS, AND BOTH BIT US.
 *
 * IT IS INLINED AT BUILD TIME, NOT READ AT RUNTIME. Setting the variable in
 * Vercel changes nothing until something is REBUILT — and a build that reuses
 * a cache can reuse a module compiled when the variable was unset, which looks
 * exactly like the flag not working. "Set on the project" and "present in the
 * bundle" are different facts, and only the second one renders a button.
 *
 * SO MERGE AND GO-LIVE ARE NOW THE SAME EVENT. As of 26 Aug 2026 the flag is
 * true in Vercel and the Apple provider is configured in Supabase, which means
 * this code becomes REAL the moment it is deployed anywhere that renders it —
 * production included. There is no half-on state to land in first; the gate
 * fails closed on anything but the exact string, and it is now that string.
 * Whoever merges the Apple button is switching Apple sign-in on for every
 * visitor in the same action, and should say so out loud rather than discover
 * it afterwards.
 */
export function appleSignInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED === 'true'
}

/**
 * WHAT PAUL HAS TO DO BEFORE THE FLAG IS WORTH FLIPPING. Kept next to the flag
 * rather than only in a report, because a report is read once and this is read
 * by whoever next wonders why the button is hidden.
 *
 *   1. An App ID with "Sign in with Apple" enabled.
 *   2. A Services ID (the OAuth client id), with the Supabase callback URL
 *      registered as a Return URL:
 *        https://<project-ref>.supabase.co/auth/v1/callback
 *   3. A Sign in with Apple KEY (.p8) — downloadable once, and once only.
 *   4. Those three pasted into Supabase → Authentication → Providers → Apple.
 *
 * Only then does NEXT_PUBLIC_APPLE_SIGNIN_ENABLED=true do anything useful.
 *
 * SEPARATE FROM ALL OF THAT: registering our sending domain as an Apple email
 * SOURCE, with SPF. That governs whether mail we send to a private relay
 * address ARRIVES — it is not needed for the button to work, and it is needed
 * before any Apple user gets a single email from us. An unregistered domain
 * does not degrade; it BOUNCES.
 */
export const APPLE_PORTAL_PREREQUISITES = [
  'App ID with Sign in with Apple enabled',
  'Services ID with the Supabase callback registered as a Return URL',
  'Sign in with Apple key (.p8) — downloadable exactly once',
  'All three entered in Supabase → Authentication → Providers → Apple',
] as const

/**
 * ALL OF THE ABOVE IS DONE as of 26 Aug 2026. What Supabase's Secret Key field
 * wants is not the .p8 but a JWT SIGNED with it — see lib/appleClientSecret.ts
 * and `npm run apple:secret`. The .p8 never expires; the JWT lasts six months.
 *
 *   Team ID      7RTA2FH8C7
 *   Services ID  uk.co.thrivecareer.web     ← the WEB client id
 *   Bundle ID    uk.co.thrivecareer.app     ← the NATIVE client id
 *   Key ID       Z9HFBUW93X
 *
 * None of those is secret; they appear inside the JWT itself. The .p8 is the
 * secret, and it lives outside this repository.
 *
 * WHEN THE NATIVE APP EXISTS, THE BUNDLE ID JOINS THE CLIENT IDS FIELD,
 * comma-separated alongside the Services ID. Native Sign in with Apple
 * presents the BUNDLE ID as its client id, not the Services ID — so a build
 * that signs in perfectly on the web fails on the phone, with a token that is
 * valid and simply for a client Supabase was not told about.
 *
 * The `sub` claim of the client secret must match the client id being used, so
 * the native flow needs its OWN secret minted with clientId = the bundle id.
 * scripts/apple-client-secret.ts mints the web one and says so at the top; do
 * not "fix" it to use the bundle id, and do not assume one secret covers both.
 */
export const APPLE_IDENTIFIERS = {
  teamId: '7RTA2FH8C7',
  servicesId: 'uk.co.thrivecareer.web',
  bundleId: 'uk.co.thrivecareer.app',
  keyId: 'Z9HFBUW93X',
} as const

/**
 * WHEN THE CLIENT SECRET IN SUPABASE STOPS WORKING.
 *
 * ⚠️ THIS IS A REMINDER AGAINST A HARDCODED DATE. IT IS NOT A VERIFICATION OF
 * WHAT IS ACTUALLY IN SUPABASE, AND IT CANNOT BE.
 *
 * The minted JWT lives ONLY in the Supabase dashboard. There is no APPLE_*
 * variable in our environment, and the Management API does not hand the secret
 * back: `GET /v1/projects/<ref>/config/auth` returns `external_apple_secret`
 * as a 64-character opaque value with no dots — a handle or a hash, not the
 * JWT. Checked 28 Aug 2026. So nothing we run can read the real `exp`, and
 * this date is a record of what was minted rather than an observation of what
 * is live.
 *
 * WHICH MEANS IT LIES IN THE REASSURING DIRECTION IF IT IS WRONG. Rotate the
 * secret early without updating this line and the check goes on saying
 * everything is fine. IF YOU ROTATE, CHANGE THIS DATE IN THE SAME COMMIT.
 *
 * The figure: minted 27 Aug 2026 at DEFAULT_LIFETIME_SECONDS (180 days), which
 * lands on 23 Feb 2027. The 22nd is used deliberately — it is the date already
 * recorded in CLAUDE.md, it is the EARLIER of the two candidates, and warning a
 * day early is the safe direction for something whose failure mode is that
 * every Apple sign-in stops working at once.
 *
 * Watched by `applesecret:prove`, which goes RED inside the warning window.
 * That runs in `npm run verify`, so it is loud before every merge without a
 * cron, an email, or anything touching the secret.
 */
export const APPLE_CLIENT_SECRET_EXPIRES = '2027-02-22T00:00:00Z'

/** How long before expiry the check starts failing. Two months is enough to
 *  mint a new secret, paste it, and prove it, without being so early that the
 *  red becomes background noise people learn to merge past. */
export const APPLE_SECRET_WARN_DAYS = 60

/**
 * Days until the recorded expiry — negative once it has passed.
 * `now` is injected rather than read, so the check can be watched failing on
 * purpose without anyone touching the system clock.
 */
export function appleSecretDaysRemaining(now: Date = new Date()): number {
  const exp = new Date(APPLE_CLIENT_SECRET_EXPIRES).getTime()
  return Math.floor((exp - now.getTime()) / 86_400_000)
}
