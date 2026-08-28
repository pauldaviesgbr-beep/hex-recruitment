// THE WEB GOOGLE SIGN-IN STILL DOES WHAT IT DID, DRIVEN ON PRODUCTION.
//
//   node scripts/drive-google-signin-web.mjs <baseUrl>
//
// WHAT THIS CAN AND CANNOT PROVE, SAID FIRST SO THE RESULT IS NOT READ AS
// MORE THAN IT IS.
//
// IT CANNOT COMPLETE A SIGN-IN. Completing one needs a Google account's
// password. There are 40 Google identities in this database and every one
// belongs to a REAL CANDIDATE; neither test fixture has a Google identity,
// and Paul's own account is not ours to drive. So the furthest honest point
// is Google's own sign-in page — reached, with our parameters intact.
//
// THAT IS STILL THE CHECK THAT MATTERS, because the fault this branch could
// have introduced is precisely here: a native branch added to the middle of
// the button. If the web path were broken it would fail BEFORE Google —
// wrong redirect_uri, a missing PKCE challenge, skipBrowserRedirect
// swallowing the navigation, or an exception in the guard. Every one of
// those is visible from where this stops.
//
// The one thing it cannot see is a fault AFTER Google returns, and that path
// is untouched by this branch: /auth/callback is the same route it always
// was, and the session cookie is written the same way.

import { chromium } from 'playwright'

const BASE = process.argv[2]
if (!BASE) {
  console.error('usage: node scripts/drive-google-signin-web.mjs <baseUrl>')
  process.exit(2)
}

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(56) + (detail ?? ''))
  return ok
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

try {
  console.log('\n1. THE BUTTON IS THERE AND THE GUARD IS FALSE IN A REAL BROWSER')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const acc = page.getByRole('button', { name: /^accept all$/i }).first()
  if (await acc.count()) { await acc.click(); await page.waitForTimeout(900) }

  // THE GUARD, EVALUATED IN THE ACTUAL PAGE rather than in node. This is the
  // difference between "our unit check says false" and "the shipped bundle,
  // in a browser, says false".
  const nativeFlag = await page.evaluate(() => {
    const cap = window.Capacitor
    return { hasCapacitor: Boolean(cap), isNative: Boolean(cap && cap.isNativePlatform && cap.isNativePlatform()) }
  })
  check('window.Capacitor is absent on the web', nativeFlag.hasCapacitor === false)
  check('…so the native branch cannot be entered', nativeFlag.isNative === false)

  const btn = page.getByRole('button', { name: /continue with google/i }).first()
  check('the Google button renders', (await btn.count()) > 0)

  console.log('\n2. CLICKING IT REALLY NAVIGATES TO GOOGLE — the web path intact')
  // If skipBrowserRedirect had leaked onto the web path, or the guard threw,
  // this navigation would never happen and the button would silently do
  // nothing. That is the exact failure mode being tested for.
  await btn.click()
  await page.waitForURL(u => /accounts\.google\.com|supabase\.co/.test(u.toString()), { timeout: 30000 })
    .catch(() => {})
  await page.waitForTimeout(3000)

  const url = page.url()
  const host = (() => { try { return new URL(url).host } catch { return '(unparseable)' } })()
  check('it left our origin', !host.includes('thrivecareer.co.uk'), host)
  check('it reached Google', host.includes('accounts.google.com'), host)

  console.log('\n3. THE PARAMETERS GOOGLE WAS GIVEN')
  const q = (() => { try { return new URL(url).searchParams } catch { return new URLSearchParams() } })()
  const redirectUri = q.get('redirect_uri') || ''
  check('a client_id was sent', Boolean(q.get('client_id')),
    (q.get('client_id') || '').slice(0, 12) + '…')
  check('redirect_uri points at Supabase, not at us',
    redirectUri.includes('supabase.co/auth/v1/callback'), redirectUri)
  check('response_type=code — the PKCE flow, not implicit',
    q.get('response_type') === 'code', String(q.get('response_type')))
  check('a state was sent', Boolean(q.get('state')))
  check('the scopes are the ones the button asks for',
    /email/.test(q.get('scope') || '') && /profile/.test(q.get('scope') || ''),
    q.get('scope') || '')

  console.log('\n4. GOOGLE IS SHOWING A SIGN-IN, NOT AN ERROR')
  const text = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ')
  check('no disallowed_useragent — this is a real browser',
    !/disallowed_useragent/i.test(text))
  check('no OAuth configuration error from Google',
    !/(error 400|invalid_request|redirect_uri_mismatch|unauthorized)/i.test(text),
    (text.match(/error[^.]{0,40}/i) || [''])[0])
  check('it is asking someone to sign in', /sign in|choose an account|email or phone/i.test(text))

  console.log('\n  STOPPED HERE ON PURPOSE — completing this needs a real')
  console.log('  candidate’s Google password, which is not ours to use.')
} catch (e) {
  console.error('\n  THREW: ' + (e?.message || e))
  bad++
} finally {
  await ctx.close().catch(() => {})
  await browser.close().catch(() => {})
}

console.log('')
console.log(bad
  ? `  ${bad} FAILED — the web Google sign-in is NOT what it was`
  : '  the web sign-in reaches Google with the right parameters, exactly as before')
process.exit(bad ? 1 : 0)
