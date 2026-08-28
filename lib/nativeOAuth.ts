'use client'

/**
 * OAUTH THAT LEAVES THE WEBVIEW — AND COMES BACK.
 *
 * WHY THIS EXISTS. Google REFUSES OAuth inside an embedded webview
 * (`disallowed_useragent`). It is deliberate, long-standing policy, not a bug
 * and not something a header fixes. So in the iOS shell a full-page redirect
 * to accounts.google.com fails, and Google is the provider most candidates
 * use. Shipped without this, most people could not sign in.
 *
 * ── WHY THE HAND-BACK WORKS, WHICH IS THE WHOLE DESIGN ───────────────────
 *
 * The session and the PKCE CODE-VERIFIER both live in COOKIES on
 * thrivecareer.co.uk — see lib/supabase.ts, which uses @supabase/ssr's
 * createBrowserClient so that client and server share one store. That is a
 * decision taken months ago for unrelated reasons (it removed a
 * drift/poisoning class of bug) and it is what makes this possible at all.
 * HAD THE VERIFIER STILL BEEN IN localStorage, the code could not be redeemed
 * from the webview and the session would be stranded in the system browser.
 *
 * So:
 *   1. The WEBVIEW starts the flow. The verifier cookie is written in the
 *      webview's jar, on our origin.
 *   2. The authorisation page opens in the SYSTEM BROWSER, which Google
 *      accepts.
 *   3. Google returns a `code`. It is a bearer artefact IN A URL, not a
 *      cookie — nothing has to be extracted from the system browser's jar.
 *   4. We navigate the WEBVIEW to /auth/callback/<role>?code=…
 *   5. That request carries the webview's cookies, verifier included, so the
 *      existing server route exchanges it and sets the session cookie in the
 *      webview's jar.
 *
 * Step 5 is the route that already runs in production for every web sign-in.
 * The only novel part is that step 2 happens in a different browser.
 *
 * ── SFSafariViewController, NOT ASWebAuthenticationSession ───────────────
 *
 * @capacitor/browser opens SFSafariViewController on iOS — Capacitor's own
 * documentation says so, in those words. It is NOT ASWebAuthenticationSession,
 * and the difference is worth knowing rather than glossing:
 *
 *   · Both are system browsers, so BOTH satisfy Google's policy. That part
 *     is unaffected.
 *   · ASWebAuthenticationSession hands the callback URL straight back to the
 *     caller and dismisses itself. SFSafariViewController does not — the
 *     custom-scheme redirect has to be caught by the APP, via
 *     @capacitor/app's appUrlOpen, and we close the sheet ourselves.
 *
 * That is why there are two plugins here rather than one. The alternative was
 * a community plugin wrapping ASWebAuthenticationSession; two official
 * Capacitor plugins is the lower-risk choice for a first proof.
 *
 * ── NOTHING HERE REACHES THE WEB BUNDLE ─────────────────────────────────
 *
 * `isNativeApp()` reads `window.Capacitor` rather than importing
 * @capacitor/core, and the plugins are imported DYNAMICALLY inside the native
 * branch only. So on the web the imports never execute, the bundle does not
 * grow, and the guard is a property read that returns false. That is
 * assertable rather than a promise — see scripts/prove-web-oauth-unchanged.mjs.
 */

/** The custom scheme iOS routes back to the app. Registered in
 *  ios/App/App/Info.plist under CFBundleURLTypes, and it must ALSO be in
 *  Supabase → Authentication → URL Configuration → Redirect URLs or the
 *  provider refuses the redirect and it looks exactly like our bug. */
export const NATIVE_CALLBACK_SCHEME = 'uk.co.thrivecareer.app'
export const NATIVE_CALLBACK_URL = `${NATIVE_CALLBACK_SCHEME}://auth/callback`

/**
 * Are we inside the iOS shell?
 *
 * Deliberately a `window` property read and NOT an import of
 * @capacitor/core. Importing would pull the runtime into the web bundle for
 * every visitor to a site that will never use it, and would make "the web is
 * unaffected" a claim rather than a fact.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  try {
    return Boolean(cap?.isNativePlatform?.())
  } catch {
    return false
  }
}

export type NativeOAuthOutcome =
  | { kind: 'signed-in' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: string }

/**
 * Run an OAuth flow through the system browser and land the session in the
 * webview.
 *
 * `authUrl` is what Supabase produces with skipBrowserRedirect — the provider
 * authorisation URL, with the PKCE challenge already in it and the verifier
 * already written to our cookie jar.
 *
 * `finishUrl(code)` builds the callback URL to navigate the webview to.
 *
 * EVERY PATH OUT OF HERE IS A VISIBLE OUTCOME. The worst failure this design
 * has is silence — the sheet closes and nothing happens, which reads as a
 * broken product and leaves nothing to report. So the promise resolves with a
 * verdict in all cases, including the timeout, and the caller must render it.
 */
export async function runNativeOAuth(
  authUrl: string,
  finishUrl: (code: string, state: string | null) => string,
  opts: { timeoutMs?: number } = {},
): Promise<NativeOAuthOutcome> {
  const timeoutMs = opts.timeoutMs ?? 180_000

  let Browser: typeof import('@capacitor/browser').Browser
  let App: typeof import('@capacitor/app').App
  try {
    ;({ Browser } = await import('@capacitor/browser'))
    ;({ App } = await import('@capacitor/app'))
  } catch (e) {
    return { kind: 'failed', reason: 'The in-app browser could not be opened.' }
  }

  return new Promise<NativeOAuthOutcome>((resolve) => {
    let settled = false
    let urlHandle: { remove: () => Promise<void> } | null = null
    let closeHandle: { remove: () => Promise<void> } | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (outcome: NativeOAuthOutcome) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      // Listeners are removed before resolving so a second redirect — a
      // double-tap, or a provider that fires twice — cannot re-enter and
      // spend the code a second time.
      void urlHandle?.remove()
      void closeHandle?.remove()
      resolve(outcome)
    }

    // THE RETURN. iOS routes uk.co.thrivecareer.app://… to the app and
    // @capacitor/app surfaces it here.
    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith(NATIVE_CALLBACK_SCHEME + '://')) return
      let code: string | null = null
      let state: string | null = null
      let providerError: string | null = null
      try {
        // A custom-scheme URL is not always parsed by URL(), so read the query
        // directly rather than trusting a parser with an unusual scheme.
        const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
        const params = new URLSearchParams(q)
        code = params.get('code')
        state = params.get('state')
        providerError = params.get('error_description') || params.get('error')
      } catch {
        providerError = 'The sign-in response could not be read.'
      }

      await Browser.close().catch(() => {})

      if (providerError) return finish({ kind: 'failed', reason: providerError })
      if (!code) return finish({ kind: 'failed', reason: 'Google did not return a sign-in code.' })

      // Hand the code to the webview. The server route exchanges it using the
      // verifier cookie that is already in this jar, and sets the session.
      finish({ kind: 'signed-in' })
      window.location.assign(finishUrl(code, state))
    }).then((h) => { urlHandle = h as typeof urlHandle })

    // THE CANCEL. Closing the sheet by hand fires this and nothing else would
    // — without it the caller sits on a spinner for ever.
    Browser.addListener('browserFinished', () => {
      // Fires on our own Browser.close() too, so it only means "cancelled" if
      // no redirect has already settled this.
      finish({ kind: 'cancelled' })
    }).then((h) => { closeHandle = h as typeof closeHandle })

    timer = setTimeout(() => {
      void Browser.close().catch(() => {})
      finish({ kind: 'failed', reason: 'Sign-in timed out. Please try again.' })
    }, timeoutMs)

    Browser.open({ url: authUrl, presentationStyle: 'popover' }).catch((e: unknown) => {
      finish({ kind: 'failed', reason: (e as Error)?.message || 'The in-app browser could not be opened.' })
    })
  })
}
