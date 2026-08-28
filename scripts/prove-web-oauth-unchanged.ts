// THE WEB SIGN-IN IS UNCHANGED BY THE NATIVE BRANCH.
//
//   npm run weboauth:prove
//
// WHY THIS IS THE CHECK THAT MATTERS MOST ON THIS BRANCH. The site is live,
// it works, and 27 candidate signups are real. An iOS app that does not exist
// yet is not worth risking a single one of them, and the change that could do
// it is a branch added to the middle of the Google sign-in path.
//
// "It only runs on native" is a claim. This makes it a measurement, three
// different ways, because any one of them alone can be satisfied by broken
// code:
//
//   1. THE GUARD RETURNS FALSE OFF-DEVICE — the REAL isNativeApp is IMPORTED
//      and called under every shape a browser can present.
//
//      IT WAS NEARLY WRITTEN THE OTHER WAY. The first version of this file
//      was .mjs and extracted the function's body with a regex to eval it,
//      because plain node cannot read TypeScript. That is reimplementing the
//      rule instead of importing it — the exact fault CLAUDE.md names — and
//      it failed twice on its own cleverness before the point landed: the
//      TypeScript cast contains nested braces AND an arrow type, so no
//      character-class regex extracts it safely. Running under tsx and
//      importing the real function is both simpler and the only version that
//      tests what actually ships.
//
//   2. NO STATIC IMPORT OF @capacitor/* REACHES THE WEB BUNDLE. The plugins
//      are imported dynamically INSIDE the native branch. A static import
//      would pull the Capacitor runtime into the bundle for every visitor to
//      a website that will never use it — and would make the guard
//      irrelevant, because the cost is paid at import time regardless of
//      what the guard returns.
//
//   3. THE WEB CALL IS STILL THE CALL IT WAS. The original
//      signInWithOAuth({ provider:'google', options:{ redirectTo, scopes }})
//      must still be there, WITHOUT skipBrowserRedirect — that flag on the
//      web path would mean the browser never navigates to Google and the
//      button silently does nothing.
//
// Filesystem, text, and one imported function. No network, no database, no
// device — so it belongs in `npm run verify` and runs on every machine.

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(60) + (detail ?? ''))
  return ok
}

async function main() {
  // ── 1. THE REAL GUARD, IMPORTED AND EXECUTED ──────────────────────────
  console.log('\n1. THE GUARD RETURNS FALSE IN EVERY SHAPE A BROWSER PRESENTS')

  const g = globalThis as unknown as { window?: unknown }
  const hadWindow = 'window' in g
  const originalWindow = g.window

  // Imported AFTER the stub exists is unnecessary — isNativeApp reads window
  // at call time, not module time, which is itself worth asserting: a guard
  // that captured window on import would be wrong in SSR.
  const { isNativeApp, NATIVE_CALLBACK_URL, NATIVE_CALLBACK_SCHEME } =
    await import('../lib/nativeOAuth')

  try {
    delete (g as { window?: unknown }).window
    check('server-side, with no window at all', isNativeApp() === false)

    const CASES: Array<[string, unknown]> = [
      ['a plain browser: no window.Capacitor', {}],
      ['window.Capacitor present but empty', { Capacitor: {} }],
      ['Capacitor says it is not native', { Capacitor: { isNativePlatform: () => false } }],
      ['isNativePlatform throws', { Capacitor: { isNativePlatform: () => { throw new Error('x') } } }],
      ['isNativePlatform is not a function', { Capacitor: { isNativePlatform: 'yes' } }],
    ]
    for (const [name, win] of CASES) {
      g.window = win
      let got: unknown
      try { got = isNativeApp() } catch (e) { got = 'THREW: ' + (e as Error).message }
      check(name, got === false, String(got))
    }

    // THE CONTROL. Without this, "always false" would pass — and a guard that
    // is a constant means the native path is dead code, which is a different
    // and equally serious fault.
    g.window = { Capacitor: { isNativePlatform: () => true } }
    let onDevice: unknown
    try { onDevice = isNativeApp() } catch (e) { onDevice = 'THREW' }
    check('CONTROL — it CAN return true, so every false above means something',
      onDevice === true, String(onDevice))
  } finally {
    if (hadWindow) g.window = originalWindow
    else delete (g as { window?: unknown }).window
  }

  check('the callback URL is built from the scheme, not typed twice',
    NATIVE_CALLBACK_URL.startsWith(NATIVE_CALLBACK_SCHEME + '://'), NATIVE_CALLBACK_URL)

  // ── 2. NOTHING CAPACITOR IS STATICALLY IMPORTED ──────────────────────
  console.log('\n2. THE WEB BUNDLE GAINS NO CAPACITOR')
  const STATIC_IMPORT = /^\s*import\s[^\n]*from\s+['"]@capacitor\//m
  const src = read('lib/nativeOAuth.ts')

  for (const f of ['lib/nativeOAuth.ts', 'components/GoogleSignInButton.tsx']) {
    check(`${f} has no STATIC @capacitor import`, !STATIC_IMPORT.test(read(f)))
  }
  check('lib/nativeOAuth.ts imports the plugins DYNAMICALLY',
    /await import\('@capacitor\/browser'\)/.test(src) &&
    /await import\('@capacitor\/app'\)/.test(src))

  // THE CLASS, NOT THE INSTANCE. Any other shipped file reaching for
  // Capacitor statically would defeat this, so the whole tree is scanned
  // rather than the two files I happen to have edited.
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${e}`
      if (statSync(join(ROOT, rel)).isDirectory()) {
        if (e !== 'node_modules' && e !== '.next') walk(rel, out)
      } else if (/\.(ts|tsx)$/.test(e)) out.push(rel)
    }
    return out
  }
  const shipped = [...walk('app'), ...walk('components'), ...walk('lib')]
  const offenders = shipped.filter(f => STATIC_IMPORT.test(read(f)))
  check(`${shipped.length} shipped files scanned, none statically import @capacitor`,
    offenders.length === 0, offenders.join(', '))

  // ── 3. THE WEB CALL IS STILL THE CALL IT WAS ─────────────────────────
  console.log('\n3. THE WEB PATH STILL MAKES THE CALL IT ALWAYS MADE')
  const btn = read('components/GoogleSignInButton.tsx')

  // Both branches contain signInWithOAuth, so counting that alone could not
  // distinguish the two states. These ask questions with different answers.
  check('exactly two signInWithOAuth calls — one per branch',
    (btn.match(/signInWithOAuth/g) || []).length === 2,
    String((btn.match(/signInWithOAuth/g) || []).length))
  check('skipBrowserRedirect appears ONCE — native only',
    (btn.match(/skipBrowserRedirect/g) || []).length === 1)
  check('the web call still passes the ORIGINAL redirectTo variable',
    /options:\s*\{\s*\n\s*redirectTo,\s*\n\s*scopes: 'email profile',/.test(btn))
  check('…and the native call passes the custom scheme instead',
    /redirectTo: NATIVE_CALLBACK_URL/.test(btn))
  check('the native branch is gated on isNativeApp()', /if \(isNativeApp\(\)\) \{/.test(btn))
  check('the role cookie is still set BEFORE either branch',
    btn.indexOf('oauth_intended_role=') < btn.indexOf('if (isNativeApp())'))

  console.log('')
  console.log(bad
    ? `  ${bad} FAILED — the web sign-in may not be what it was`
    : '  the web path is untouched: the guard is false off-device, no Capacitor enters the bundle, and the original call stands')
  process.exit(bad ? 1 : 0)
}

main()
