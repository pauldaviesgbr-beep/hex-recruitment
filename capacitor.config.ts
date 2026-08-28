import type { CapacitorConfig } from '@capacitor/cli'

// THE iOS SHELL. PHASE 1 — FILES ONLY, NOTHING HAS BEEN BUILT.
//
// WHY server.url AND NOT A STATIC EXPORT, which is the decision that shapes
// the whole app. Thrive is a server-rendered Next.js application: 60+ API
// routes, a middleware that refreshes the Supabase SSR auth cookie on every
// navigation, RLS that depends on that cookie, and server components that
// query the database at request time. `next build` here produces a server,
// not a folder of files — there is no `output: 'export'` in next.config.js
// and adding one would delete the product. A static export would take the
// API routes, the middleware, the auth and every server-rendered page with
// it, and what shipped would be a brochure.
//
// So the shell loads the live site. The webview's origin IS
// thrivecareer.co.uk, which is the property that makes everything else work:
// the Supabase auth cookie is a first-party cookie on that origin, so
// sessions, RLS and the middleware behave exactly as they do in Safari. A
// capacitor:// origin would have made every one of those a cross-origin
// problem to solve.
//
// WHAT IT COSTS, said plainly: a remote-URL shell is the configuration Apple
// looks at hardest under Guideline 4.2, minimum functionality. An app that
// loads a website and does nothing else is the most-rejected category on the
// store. The answer is native capability, and that is phase 3 work — it is
// not solved by anything in this file.
//
// webDir points at a local folder that is NOT `public/`. Anything in public/
// is served on thrivecareer.co.uk, and the shell's offline page has no
// business being a route on the website.

const config: CapacitorConfig = {
  // MUST MATCH the identifier already registered with Apple. Read from
  // lib/appleSignIn.ts (APPLE_IDENTIFIERS.bundleId), which is the same
  // constant the Sign in with Apple client secret is minted against — not
  // typed from memory. A mismatch here surfaces at upload, days later.
  appId: 'uk.co.thrivecareer.app',
  appName: 'Thrive',
  webDir: 'capacitor-shell/www',

  server: {
    url: 'https://thrivecareer.co.uk',
    // The apex only. A wildcard here would let the webview treat other hosts
    // as first-party, which is the opposite of what we want when the sign-in
    // flows hand off to Google and Apple.
    hostname: 'thrivecareer.co.uk',
    androidScheme: 'https',
    iosScheme: 'https',
    // No cleartext. Every origin this app touches is HTTPS.
    cleartext: false,
  },

  ios: {
    // The site paints its own background; this stops a white flash on launch
    // before the first paint arrives.
    backgroundColor: '#0f172a',
    // Let the site's own overscroll behaviour apply rather than the webview's
    // rubber-banding fighting the sticky header we just fixed.
    scrollEnabled: true,
    contentInset: 'always',
  },
}

export default config
