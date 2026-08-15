/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
  // /register on its own is a dead-end (no app/register/page.tsx). Send
  // visitors to the employer signup since employers are the paying side;
  // candidates have their own discovery path via /jobs → Apply → signup
  // prompt. Temporary 307 keeps room for a role-chooser later.
  //
  // Dormant Stripe pages: under free-founding-mode pricing is intentionally
  // unset publicly, but /subscribe, /register/employer/payment, and
  // /renew-subscription still render "£99/month" and card-collection UI.
  // 307 them to the free signup so the price isn't reachable by URL,
  // without deleting any Stripe code. permanent: false (not 308) so
  // browsers don't cache hard.
  //
  // ⚠️ These four redirects are one half of a switch. The other half is
  // FREE_FOUNDING_MODE in lib/constants/cohort.ts. Removing these entries
  // alone does NOT revive paid signup, and setting that flag to false
  // alone silently breaks card collection — the code would send employers
  // to /register/employer/payment and this block would bounce them
  // straight back out to the free signup. Change both together, in the
  // same commit. The full explanation is in the comment above that flag.
  // THREE URLS THAT WERE NEVER ROUTES. /pricing, /for-employers and /employers
  // returned 404 while serving robots="index, follow" — a 404 still renders the
  // root layout, so Google was being invited to index three pages that don't
  // exist, carrying the £99 that used to sit in the root description.
  //
  // 308s rather than noindex, deliberately. noindex is more correct in the
  // abstract and throws away whatever link equity those URLs have picked up; a
  // permanent redirect consolidates it onto a page that exists. /pricing goes
  // home because there IS no pricing page and won't be one until the tiers are
  // decided; the two employer URLs go to the signup they were clearly aiming at.
  //
  // permanent: true (308) here, unlike the four below — these are not a switch
  // that gets flipped back, they are URLs that will never be routes.
  redirects: async () => [
    { source: '/pricing', destination: '/', permanent: true },
    { source: '/for-employers', destination: '/register/employer-free', permanent: true },
    { source: '/employers', destination: '/register/employer-free', permanent: true },
    { source: '/register', destination: '/register/employer-free', permanent: false },
    { source: '/subscribe', destination: '/register/employer-free', permanent: false },
    { source: '/register/employer/payment', destination: '/register/employer-free', permanent: false },
    { source: '/renew-subscription', destination: '/register/employer-free', permanent: false },
    // ADDED 15 Aug 2026, AND IT BELONGS TO THE SAME SWITCH AS THE FOUR ABOVE.
    // /register/employer used to redirect ITSELF, from an unconditional
    // useEffect inside app/register/employer/page.tsx. That page was deleted
    // with the rest of the paid-signup surfaces, which turned the path into a
    // 404 — and tsc reported nothing, because a dead href is a string.
    // Requested and confirmed: 404 before this line, 307 after.
    // When billing revives, this entry comes out WITH the other four.
    { source: '/register/employer', destination: '/register/employer-free', permanent: false },
  ],
  headers: async () => [
    {
      source: '/_next/static/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      ],
    },
  ],
}

module.exports = nextConfig


