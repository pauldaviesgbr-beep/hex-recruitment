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
    // SO A LOG LINE CAN TELL THE APP FROM A BROWSER.
    //
    // Without this the WKWebView sends the ordinary iOS user agent and is
    // indistinguishable from Safari. It cost an hour on 30 Aug 2026: an
    // Apple sign-in was captured in the production logs and nobody could
    // say which container it came from.
    //
    // The absence WAS inferable — Chrome on iOS carries CriOS, Safari
    // carries Version/, and a bare WKWebView carries neither — but an
    // inference from absence is not a positive mark, and it stops being
    // reliable the day Apple changes the default user agent.
    //
    // Under ios rather than at the top level: this is an iOS-only shell and
    // a top-level value would also claim to speak for a platform we do not
    // ship. tsc refused it under `server`, which is where it was tried
    // first — it is not a server property.
    appendUserAgent: 'ThriveApp',
    // The site paints its own background; this stops a white flash on launch
    // before the first paint arrives.
    backgroundColor: '#0f172a',
    // Let the site's own overscroll behaviour apply rather than the webview's
    // rubber-banding fighting the sticky header we just fixed.
    scrollEnabled: true,
    // 'never', AND THE PAGE IS NOW THE ONE THAT INSETS. Build 10.
    //
    // This said 'always' from the shell commit (135f0f5, files only, nothing
    // built) with no comment and no device behind it. 'always' makes the
    // WKWebView scroll view add its own top inset for the safe area.
    //
    // That was survivable while the page did NOT inset — the site had no
    // viewport-fit=cover, so env(safe-area-inset-top) was zero and only the
    // scroll view inset. It stopped being survivable the moment the page
    // started declaring cover and padding the header itself: BOTH LAYERS THEN
    // INSET, and they stack.
    //
    // OBSERVED ON BUILD 9 PLUS THE WEB HALF, on a handset — the only
    // instrument that can see it. The header came out around 175-190 CSS px
    // instead of the ~129 the arithmetic predicts, the hamburger was pushed
    // onto its own row above the logo, the nav resized during scroll, pages
    // with nothing to scroll scrolled slightly, and the side menu's items were
    // displaced from where they were drawn.
    //
    // So exactly one layer may own the inset, and it is the page: the CSS can
    // put it where it belongs (the header's padding, --nav-height, and the
    // seventeen rules that read it) where a scroll-view inset cannot.
    contentInset: 'never',
  },
}

export default config
