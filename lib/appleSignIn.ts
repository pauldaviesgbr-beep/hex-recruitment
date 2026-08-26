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
