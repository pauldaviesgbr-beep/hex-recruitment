// THE ONE-SHOT SIGN-IN RETRY, DRIVEN AGAINST A DEPLOYMENT.
//
//   node --env-file=.env.local scripts/drive-oauth-retry.mjs <url>
//
// The target is an argument and never a default.
//
// ── WHAT IS REAL AND WHAT IS NOT, STATED ONCE AND REPEATED IN THE OUTPUT ──
//
// SERVER HALF — A REAL SUPABASE FAILURE. Supabase looks a flow up ONLY by its
// code, so a code it never issued gets the same 404 flow_state_not_found the
// app meets in the field. Each case sends one through the deployed callback
// with a verifier cookie present (so supabase-js really calls /token) and reads
// the route's own Location header. That is the real route, the real library and
// a real answer from Supabase. What it is NOT is the field fault itself: there
// the code WAS issued and Supabase still could not find it.
//
// CLIENT HALF — A STUBBED APP. window.Capacitor is injected before any page
// script, as the shell's bridge does. It is still a desktop browser. The
// provider page is BLOCKED at the network, so no flow is ever started at
// Supabase or Google and no row is written anywhere. Closing the blocked popup
// stands in for the user cancelling the second sheet.
//
// Writes nothing. No sign-in completes. No email is sent.

import { chromium } from 'playwright'
import { randomUUID } from 'node:crypto'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
if (!BASE) { console.error('usage: node --env-file=.env.local scripts/drive-oauth-retry.mjs <url>'); process.exit(2) }
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const isPreview = BASE.includes('.vercel.app')
if (isPreview && !BYPASS) { console.error('SKIP  preview target and no VERCEL_AUTOMATION_BYPASS_SECRET'); process.exit(2) }
const REF = 'aaljufxcniacfggqiuls'
const VERIFIER = `sb-${REF}-auth-token-code-verifier`
const ERROR_COPY = 'Sign-in didn’t complete. Please try again.'
const FINISHING = 'Finishing sign-in…'

let bad = 0
const check = (label, ok, detail = '') => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(72) + detail)
}
const bypass = isPreview ? { 'x-vercel-protection-bypass': BYPASS } : {}

// ── SERVER HALF ──────────────────────────────────────────────────────────
console.log(`\nSERVER — the deployed callback, a REAL flow_state_not_found from Supabase\n  target ${BASE}`)

async function callback(role, query, { verifier = true } = {}) {
  const cookie = verifier ? `${VERIFIER}=${encodeURIComponent(JSON.stringify('drive-' + randomUUID()))}` : ''
  const res = await fetch(`${BASE}/auth/callback/${role}?${query}`, {
    redirect: 'manual',
    headers: { ...bypass, ...(cookie ? { cookie } : {}) },
  })
  const loc = res.headers.get('location') || ''
  return { status: res.status, loc: loc.replace(/^https?:\/\/[^/]+/, '') }
}
const junk = () => 'drive' + randomUUID().replace(/-/g, '').slice(0, 31)

const cases = [
  ['employee: app, first attempt, google → OFFERED', 'employee', `code=${junk()}&native=1&provider=google&attempt=1`, {},
    (l) => l === '/login/employee?error=exchange-failed&retry=google&retry_role=employee'],
  ['employer: app, first attempt, apple → OFFERED, role employer', 'employer', `code=${junk()}&native=1&provider=apple&attempt=1`, {},
    (l) => l === '/login/employer?error=exchange-failed&retry=apple&retry_role=employer'],
  ['return path is carried with the offer', 'employee', `code=${junk()}&next=%2Fjobs&native=1&provider=linkedin_oidc&attempt=1`, {},
    (l) => l === '/login/employee?error=exchange-failed&retry=linkedin_oidc&retry_role=employee&redirect=%2Fjobs'],
  ['attempt 2 (the retry itself failed) → no offer', 'employee', `code=${junk()}&native=1&provider=google&attempt=2`, {},
    (l) => l === '/login/employee?error=exchange-failed'],
  ['website callback (no native marker) → no offer', 'employee', `code=${junk()}`, {},
    (l) => l === '/login/employee?error=exchange-failed'],
  ['unknown provider → no offer', 'employee', `code=${junk()}&native=1&provider=github&attempt=1`, {},
    (l) => l === '/login/employee?error=exchange-failed'],
  ['no verifier cookie (a DIFFERENT failure) → no offer', 'employee', `code=${junk()}&native=1&provider=google&attempt=1`, { verifier: false },
    (l) => l === '/login/employee?error=exchange-failed'],
  ['provider error → no offer, never reaches the exchange', 'employee', `error=access_denied&native=1&provider=google&attempt=1`, {},
    (l) => l === '/login/employee?error=access_denied'],
  ['no code → no offer', 'employee', `native=1&provider=google&attempt=1`, {},
    (l) => l === '/login/employee?error=no-code'],
]
for (const [label, role, q, opts, want] of cases) {
  const r = await callback(role, q, opts)
  check(label, r.status >= 300 && r.status < 400 && want(r.loc), `${r.status} ${r.loc}`)
}

// ── CLIENT HALF ──────────────────────────────────────────────────────────
console.log('\nCLIENT — STUBBED APP (window.Capacitor injected), provider page BLOCKED')
const browser = await chromium.launch()

async function ctxFor(app) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: bypass })
  if (app) await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' } })
  const opened = []
  // Nothing reaches Supabase's authorize endpoint or Google, so no flow row.
  await ctx.route(/\/auth\/v1\/authorize|accounts\.google\.com|appleid\.apple\.com|linkedin\.com/, (route) => {
    opened.push(route.request().url())
    return route.abort()
  })
  return { ctx, opened }
}
const textOf = (page) => page.evaluate(() => document.body.innerText)

const OFFER_URL = `${BASE}/login?error=exchange-failed&retry=google&retry_role=employee`

{
  const { ctx, opened } = await ctxFor(true)
  const page = await ctx.newPage()
  const popupP = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null)
  await page.goto(OFFER_URL)
  // Wait on the sentence itself — false while the answer is missing.
  const sawFinishing = await page.waitForFunction((t) => document.body.innerText.includes(t), FINISHING, { timeout: 15000 }).then(() => true, () => false)
  const t1 = await textOf(page)
  check('app: the offer shows "Finishing sign-in…"', sawFinishing && t1.includes(FINISHING))
  check('app: …and NOT the error copy while it runs', !t1.includes(ERROR_COPY))
  const claim = await page.evaluate(() => sessionStorage.getItem('thrive_oauth_retry_claimed'))
  check('app: the one-retry claim is taken in sessionStorage', !!claim, String(claim))
  const popup = await popupP
  // The web Browser plugin opens the authorise URL as a popup; the network
  // block above records it without letting it through.
  await page.waitForTimeout(1500)
  const authUrl = opened.find((u) => u.includes('/auth/v1/authorize')) || popup?.url() || ''
  const au = authUrl ? new URL(authUrl) : null
  check('app: the retry restarts GOOGLE (the provider the callback named)', au?.searchParams.get('provider') === 'google', au?.searchParams.get('provider') || 'no authorize request seen')
  check('app: …as a fresh flow to the app scheme, with a new PKCE challenge',
    !!au && (au.searchParams.get('redirect_to') || '').startsWith('uk.co.thrivecareer.app://') && !!au.searchParams.get('code_challenge'))
  // Stand-in for the user cancelling the second sheet.
  if (popup) await popup.close()
  const ended = await page.waitForFunction((t) => document.body.innerText.includes(t), ERROR_COPY, { timeout: 15000 }).then(() => true, () => false)
  const t2 = await textOf(page)
  check('app: when the retry does not complete, the honest error appears', ended, popup ? 'popup closed' : 'no popup was opened')
  check('app: …and "Finishing sign-in…" is gone', !t2.includes(FINISHING))

  // SAME WEBVIEW, A SECOND OFFER (as if the retry's own callback had offered
  // again — it cannot, but the client guard must not rely on that).
  const before = opened.length
  await page.goto(OFFER_URL)
  await page.waitForFunction((t) => document.body.innerText.includes(t), ERROR_COPY, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const t3 = await textOf(page)
  check('app: a second offer in the same session does NOT retry (claim held)',
    t3.includes(ERROR_COPY) && !t3.includes(FINISHING) && opened.length === before, `authorize requests +${opened.length - before}`)
  await ctx.close()
}

{
  const { ctx, opened } = await ctxFor(false)
  const page = await ctx.newPage()
  await page.goto(OFFER_URL)
  await page.waitForFunction((t) => document.body.innerText.includes(t), ERROR_COPY, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const t = await textOf(page)
  check('website (no bridge): the offer is ignored — error shown, no retry',
    t.includes(ERROR_COPY) && !t.includes(FINISHING) && opened.length === 0, `authorize requests ${opened.length}`)
  await ctx.close()
}

await browser.close()
console.log(bad ? `\n${bad} FAILED` : '\nall passed')
console.log('  SERVER half: real deployed route, real Supabase 404 for a code it never issued.')
console.log('  CLIENT half: a STUBBED bridge in a desktop browser; the provider page was blocked; a closed popup stood in for a cancel.')
process.exitCode = bad ? 1 : 0
