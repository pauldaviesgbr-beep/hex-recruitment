// THE ONE-SHOT SIGN-IN RETRY RETRIES ONCE, FOR ONE ERROR, IN THE APP ONLY.
//
//   npm run oauthretry:prove
//
// lib/oauthRetry.ts restarts an in-app OAuth sign-in once when Supabase answers
// the exchange with flow_state_not_found. A retry that fires on the wrong thing
// is worse than the fault it mitigates: a user who tapped Cancel thrown back at
// Google's screen, or a loop bouncing somebody between Google and the app. So
// every rule is asserted against the REAL functions, imported — never restated
// — and every "no" has a control proving the same function can say "yes".
//
// Filesystem, text and imported pure functions. No network, no database, no
// device, so it belongs in `npm run verify`. The live half — a real
// flow_state_not_found from Supabase through the real callback — is
// scripts/drive-oauth-retry.mjs, run against a deployment.

import { readFileSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
// Comments quote the code they describe; a text check must not read them.
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(72) + (detail ?? ''))
}

class MemStore {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
}

async function main() {
  const R = await import('../lib/oauthRetry')
  const ok = { native: '1', provider: 'google', attempt: '1' }

  // ── 2. ONLY THIS FAILURE ───────────────────────────────────────────────
  console.log('\n2. ONLY flow_state_not_found EARNS AN OFFER')
  check('CONTROL — the exact failure, first attempt, in the app: offered',
    R.retryOffer('flow_state_not_found', ok) === 'google')
  for (const c of ['bad_code_verifier', 'flow_state_expired', 'validation_failed', 'unexpected_failure', '', null, undefined]) {
    check(`exchange error code ${JSON.stringify(c)}: no offer`, R.retryOffer(c as string | null, ok) === null)
  }

  // THE ROUTE MUST DECIDE FROM THE CODE, AFTER THE EXCHANGE, AND THE EARLY
  // BRANCHES MUST NOT REACH IT. The provider-error and no-code redirects return
  // before exchangeCodeForSession is called, so they cannot produce an offer.
  for (const role of ['employee', 'employer'] as const) {
    const src = code(`app/auth/callback/${role}/route.ts`)
    const iErr = src.indexOf(`/login/${role}?error=\${encodeURIComponent(error)}`)
    const iNoCode = src.indexOf(`/login/${role}?error=no-code`)
    const iExchange = src.indexOf('exchangeCodeForSession(code)')
    const iOffer = src.indexOf('retryOffer(')
    check(`${role}: provider-error redirect returns BEFORE the exchange`, iErr > 0 && iErr < iExchange, `${iErr} < ${iExchange}`)
    check(`${role}: no-code redirect returns BEFORE the exchange`, iNoCode > 0 && iNoCode < iExchange, `${iNoCode} < ${iExchange}`)
    check(`${role}: the offer is decided only AFTER the exchange`, iOffer > iExchange, `${iOffer} > ${iExchange}`)
    check(`${role}: exactly one offer decision`, (src.match(/retryOffer\(/g) || []).length === 1)
    check(`${role}: decided from the parsed error CODE, not its message`,
      /const errorCode = \(exchangeError as \{ code\?: string \} \| null\)\?\.code \?\? null/.test(src) &&
      /retryOffer\(errorCode, retryCtx\)/.test(src))
    check(`${role}: the failure URL comes from the one builder`,
      src.includes(`exchangeFailedLoginUrl(origin, '${role}', offer, safeNext)`))
  }

  // THE CANCEL NEVER REACHES THE CALLBACK. In runNativeOAuth the only path
  // that navigates the webview is the one holding a code; the cancel resolves
  // 'cancelled' and goes nowhere. If a cancel could navigate, it could reach
  // the exchange — so this is the assertion that excludes it by construction.
  console.log('\n2b. A CANCEL NAVIGATES NOWHERE, SO IT CANNOT REACH THE CALLBACK')
  const nat = code('lib/nativeOAuth.ts')
  const assigns = nat.match(/window\.location\.assign\(/g) || []
  check('runNativeOAuth navigates the webview in exactly one place', assigns.length === 1, String(assigns.length))
  const iAssign = nat.indexOf('window.location.assign(')
  const iSignedIn = nat.lastIndexOf("finish({ kind: 'signed-in' })", iAssign)
  const iNoCodeReturn = nat.lastIndexOf('if (!code) return finish(', iAssign)
  check('…and only after a code was read and checked non-empty', iNoCodeReturn > 0 && iNoCodeReturn < iSignedIn && iSignedIn < iAssign)
  const cancelBlock = nat.slice(nat.indexOf("Browser.addListener('browserFinished'"), nat.indexOf('timer = setTimeout('))
  check("the browserFinished (cancel) handler resolves 'cancelled' and navigates nothing",
    cancelBlock.includes("finish({ kind: 'cancelled' })") && !cancelBlock.includes('location'))
  check('a provider error inside the sheet is caught BEFORE any navigation',
    nat.indexOf('if (providerError) return finish(') > 0 && nat.indexOf('if (providerError) return finish(') < iAssign)

  // ── 1. EXACTLY ONE RETRY ───────────────────────────────────────────────
  console.log('\n1. ONE RETRY, EVER — TWO INDEPENDENT GUARDS')
  check('server: attempt 2 is never offered another', R.retryOffer('flow_state_not_found', { ...ok, attempt: '2' }) === null)
  check('server: missing attempt is no offer (unreadable guard → no loop)', R.retryOffer('flow_state_not_found', { ...ok, attempt: null }) === null)
  check('server: an attempt that is not exactly "1" is no offer', R.retryOffer('flow_state_not_found', { ...ok, attempt: '01' }) === null)

  const s = new MemStore()
  const t0 = 1_800_000_000_000
  check('client: CONTROL — an empty store grants the claim', R.claimRetry(s, t0) === true)
  check('client: a second claim one second later is refused', R.claimRetry(s, t0 + 1000) === false)
  check('client: still refused at 9 minutes', R.claimRetry(s, t0 + 9 * 60_000) === false)
  check('client: granted again after the window (a sign-in hours later)', R.claimRetry(s, t0 + 11 * 60_000) === true)
  check('client: no store at all → no retry', R.claimRetry(null, t0) === false)
  const throwing = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('x') } }
  check('client: a store that throws on read → no retry', R.claimRetry(throwing, t0) === false)
  const readOnly = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded') } }
  check('client: a store that throws on write → no retry', R.claimRetry(readOnly, t0) === false)
  const dropping = { getItem: () => null, setItem: () => {} }
  check('client: a store that silently drops writes → no retry', R.claimRetry(dropping, t0) === false)
  const junk = new MemStore(); junk.setItem(R.RETRY_CLAIM_KEY, 'garbage')
  check('client: an unparseable claim is treated as live → no retry', R.claimRetry(junk, t0) === false)

  // The retry's callback carries attempt=2, so its own failure cannot offer.
  for (const f of ['Google', 'Apple', 'LinkedIn']) {
    const src = code(`components/${f}SignInButton.tsx`)
    // The press is autoRetry.attempt, DEFAULTING to 2. Only the app's native
    // sign-in sheet passes 1 (its first press is a first attempt) — asserted in 5.
    check(`${f}: the automatic press is attempt 2 unless told otherwise`, /void start\(autoRetry\.role, autoRetry\.attempt \?\? 2\)/.test(src))
    check(`${f}: a tap is attempt 1`, /onClick=\{\(\) => \{ void start\(role, 1\) \}\}/.test(src))
    check(`${f}: a ref holds the automatic press to one`, /if \(!autoRetry \|\| retriedRef\.current\) return\s*\n\s*retriedRef\.current = true/.test(src))
  }

  // ── 3. APP ONLY ────────────────────────────────────────────────────────
  console.log('\n3. APP ONLY — THE WEB CALLBACK CARRIES NOTHING, THE PAGE NEEDS THE BRIDGE')
  check('server: no native=1 → no offer', R.retryOffer('flow_state_not_found', { ...ok, native: null }) === null)
  check('server: native=true (not "1") → no offer', R.retryOffer('flow_state_not_found', { ...ok, native: 'true' }) === null)
  const yes = () => true
  check('client: CONTROL — native, visible, claimable → retries',
    R.shouldAutoRetry({ retryParam: 'google', native: true, visible: true, claim: yes }) === 'google')
  check('client: not native → no retry', R.shouldAutoRetry({ retryParam: 'google', native: false, visible: true, claim: yes }) === null)
  const panel = code('components/LoginPanel.tsx')
  check('the page reads the BRIDGE (lib/nativeShell), not the user agent',
    /native: isNativeApp\(\)/.test(panel) && /from '@\/lib\/nativeShell'/.test(panel))
  for (const [f, p] of [['Google', 'google'], ['Apple', 'apple'], ['LinkedIn', 'linkedin_oidc']] as const) {
    const src = code(`components/${f}SignInButton.tsx`)
    const iNative = src.indexOf('if (isNativeApp()) {')
    const iSuffix = src.indexOf('nativeFinishSuffix(')
    const iWebCall = src.indexOf('signInWithOAuth', src.indexOf('signInWithOAuth') + 1)
    check(`${f}: the native marker is added once, inside the native branch only`,
      (src.match(/nativeFinishSuffix\(/g) || []).length === 1 && iNative > 0 && iNative < iSuffix && iSuffix < iWebCall)
    // ── 6. SAME PROVIDER ──
    const started = (src.match(/provider: '([a-z_]+)'/g) || []).map(m => m.slice(11, -1))
    check(`${f}: the marker names the provider this button starts ('${p}')`,
      src.includes(`nativeFinishSuffix('${p}', attempt)`) && started.length === 2 && started.every(x => x === p),
      started.join(','))
    check(`${f}: the page hands it the retry only for '${p}'`, panel.includes(`autoRetry={autoRetryFor('${p}')}`))
  }

  // ── 6. THE SAME PROVIDER ───────────────────────────────────────────────
  console.log('\n6. THE SAME PROVIDER — UNKNOWN OR MISSING SHOWS THE ERROR')
  for (const p of R.RETRYABLE_PROVIDERS) {
    check(`'${p}' is offered back as '${p}'`, R.retryOffer('flow_state_not_found', { ...ok, provider: p }) === p)
  }
  for (const p of [null, '', 'Google', 'github', 'linkedin', 'google ']) {
    check(`provider ${JSON.stringify(p)}: no offer, no retry`,
      R.retryOffer('flow_state_not_found', { ...ok, provider: p }) === null &&
      R.shouldAutoRetry({ retryParam: p, native: true, visible: true, claim: yes }) === null)
  }

  // ── TRAP: AWAY FROM THE SCREEN ─────────────────────────────────────────
  console.log('\nTRAP. BACKGROUNDED → NO RETRY, AND A DECLINED RETRY NEVER SPENDS THE CLAIM')
  check('hidden page → no retry', R.shouldAutoRetry({ retryParam: 'google', native: true, visible: false, claim: yes }) === null)
  let claimed = 0
  const spy = () => { claimed++; return true }
  R.shouldAutoRetry({ retryParam: 'google', native: false, visible: true, claim: spy })
  R.shouldAutoRetry({ retryParam: 'google', native: true, visible: false, claim: spy })
  R.shouldAutoRetry({ retryParam: 'nope', native: true, visible: true, claim: spy })
  check('the claim is taken only when every other condition already holds', claimed === 0, `claimed ${claimed}`)
  check('claim refused → no retry', R.shouldAutoRetry({ retryParam: 'google', native: true, visible: true, claim: () => false }) === null)

  // ── 5. NO FALSE FAILURE ON SCREEN ──────────────────────────────────────
  console.log('\n5. THE ERROR IS HELD WHILE THE RETRY RUNS, AND SHOWN IF IT ENDS')
  check('the copy is one short line', R.FINISHING_COPY === 'Finishing sign-in…', R.FINISHING_COPY)
  check("the error copy renders only in phase 'none'",
    /const callbackNotice = retryState\.phase === 'none' \? callbackErrorCopy\(authError\) : null/.test(panel))
  check("a retry param starts in 'deciding', so the first paint holds the error",
    /\(retry \? \{ phase: 'deciding' \} : \{ phase: 'none' \}\)/.test(panel))
  check('every non-navigating end of the retry hands back (onEnded)',
    ['Google', 'Apple', 'LinkedIn'].every(f => {
      const src = code(`components/${f}SignInButton.tsx`)
      return /\.finally\(\(\) => \{\s*\n\s*if \(!navigatingRef\.current\) autoRetry\.onEnded\(cancelledRef\.current \? 'cancelled' : 'failed'\)/.test(src) &&
        /if \(outcome\.kind === 'signed-in'\) \{ navigatingRef\.current = true; return \}/.test(src)
    }))
  // THE RETRY ITSELF STAYS ATTEMPT 2: its autoRetry object names no attempt,
  // and the only `attempt: 1` on the page belongs to the native sheet's start.
  check('the retry passes no attempt, so it presses as attempt 2',
    /\? \{ role: retryState\.role, onEnded: retryEnded \}/.test(panel))
  check('attempt 1 appears once, in the native sheet branch only',
    (panel.match(/attempt: 1 as const/g) || []).length === 1 &&
    /: nativeStart === p\s*\r?\n\s*\? \{\s*\r?\n\s*role: 'employee' as const,\s*\r?\n\s*attempt: 1 as const/.test(panel))
  check('Apple switched off hands back at once rather than spinning',
    /if \(!appleSignInEnabled\(\)\) \{ autoRetry\.onEnded\(\); return \}/.test(code('components/AppleSignInButton.tsx')))

  // ── 4. LOUD ────────────────────────────────────────────────────────────
  console.log('\n4. EVERY OFFER AND EVERY RETRIED OUTCOME IS ONE COUNTABLE LINE')
  for (const role of ['employee', 'employer']) {
    const src = code(`app/auth/callback/${role}/route.ts`)
    check(`${role}: failure branch logs offered / not-offered / outcome:failed`,
      /event: retryCtx\.attempt === '2' \? 'outcome' : offer \? 'offered' : 'not-offered'/.test(src) &&
      /result: 'failed' as const/.test(src))
    check(`${role}: a retried success logs outcome:succeeded`, /event: 'outcome'[^\n]*result: 'succeeded'/.test(src))
  }
  const lines: string[] = []
  const orig = console.log
  console.log = (m: string) => { lines.push(m) }
  R.logRetry({ event: 'offered', route: 'employee', provider: 'google', attempt: '1', errorCode: 'flow_state_not_found' })
  console.log = orig
  check('the line is greppable and parseable', lines.length === 1 && lines[0].startsWith('[oauth-retry] {') &&
    JSON.parse(lines[0].slice(14)).event === 'offered', lines[0])

  // ── NOTHING CHANGES WITHOUT AN OFFER ───────────────────────────────────
  console.log('\nNO OFFER → THE URL THE ROUTE ALWAYS SENT')
  check('employee', R.exchangeFailedLoginUrl('https://x', 'employee', null, '/job/1') === 'https://x/login/employee?error=exchange-failed')
  check('employer', R.exchangeFailedLoginUrl('https://x', 'employer', null, null) === 'https://x/login/employer?error=exchange-failed')
  check('with an offer: retry, role and return path are carried',
    R.exchangeFailedLoginUrl('https://x', 'employer', 'apple', '/job/1') ===
      'https://x/login/employer?error=exchange-failed&retry=apple&retry_role=employer&redirect=%2Fjob%2F1')
  check('the login page passes retry and retry_role through',
    /retry=\{searchParams\.get\('retry'\)\}/.test(read('app/login/page.tsx')) &&
    /retryRole=\{searchParams\.get\('retry_role'\)\}/.test(read('app/login/page.tsx')))

  console.log(bad ? `\n${bad} FAILED` : '\nall passed')
  process.exitCode = bad ? 1 : 0
}

main().catch(e => { console.error(e); process.exitCode = 1 })
