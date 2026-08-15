/**
 * U4 hardening verification — three-browser signout flow.
 * Runs Chromium desktop, WebKit desktop, and Mobile Safari (iPhone 13
 * emulation via WebKit + device descriptor). For each:
 *   1. Clean state → login → capture sb-* cookies + localStorage
 *   2. Signout via UI dropdown → recapture; PASS if both empty
 *   3. Re-login → navigate to /employer/dashboard → PASS if it loads
 *
 * Run: node scripts/verify-u4-signout.js [base-url]
 * Default base-url: http://localhost:3000
 */

const { chromium, webkit, devices } = require('playwright')

const BASE = process.argv[2] || 'http://localhost:3000'
// THIS SCRIPT IS CURRENTLY DEAD, AND IT IS WORTH SAYING SO RATHER THAN
// QUIETLY LEAVING IT. It signed in as pauldavies.gbr+thrivetest8@gmail.com,
// an account deleted some time before 15 Aug 2026 — checked, zero rows. So it
// cannot pass against its own default and never will again.
//
// The password was a hardcoded literal that sat in a public repo from 10 May.
// Both now come from the environment: give it a real account or leave it
// alone, but it will no longer publish a credential or pretend it can run.
const EMAIL = process.env.U4_EMAIL
const PASSWORD = process.env.U4_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('SKIP  set U4_EMAIL and U4_PASSWORD. The original fixture account no longer exists.')
  process.exit(2)
}

const CONTEXTS = [
  { name: 'Chromium desktop', engine: chromium, options: { viewport: { width: 1280, height: 800 } } },
  { name: 'WebKit desktop', engine: webkit, options: { viewport: { width: 1280, height: 800 } } },
  { name: 'Mobile Safari (iPhone 13)', engine: webkit, options: { ...devices['iPhone 13'] } },
]

async function snapshot(page) {
  return await page.evaluate(() => {
    const sbCookieRe = /^sb-/
    const cookieNames = document.cookie.split(';').map(c => c.trim().split('=')[0]).filter(n => n && sbCookieRe.test(n))
    const lsKeys = Object.keys(localStorage).filter(k => sbCookieRe.test(k))
    return { cookieNames, lsKeys }
  })
}

async function clearAll(page) {
  // First navigate to a same-origin page so localStorage is accessible.
  await page.evaluate(() => {
    try { localStorage.clear() } catch {}
    try { sessionStorage.clear() } catch {}
  })
  const ctx = page.context()
  await ctx.clearCookies()
}

async function login(page, baseUrl) {
  // Navigate to a page that loads the supabase browser client + hybridStorage,
  // then sign in directly via the JS client. Skips the form-React-state issue
  // headless Playwright has with controlled inputs.
  await page.goto(`${baseUrl}/login/employer`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => typeof (window).__SUPABASE_BROWSER__ !== 'undefined' || typeof (window).supabase !== 'undefined' || document.querySelector('input[type=email]'),
    null,
    { timeout: 15000 },
  ).catch(() => {})
  // Use Supabase JS via the same anon key the app uses. We re-create the
  // client locally so its `storage: localStorage` writes the same sb-* key
  // that hybridStorage in the app uses for the token (key derives from
  // project ref).
  const result = await page.evaluate(async ({ email, password }) => {
    // The supabase-js module isn't exposed on window, so import from a CDN.
    // We construct a minimal client purely to call signInWithPassword.
    const mod = await import('https://esm.sh/@supabase/supabase-js@2')
    const SUPABASE_URL = 'https://aaljufxcniacfggqiuls.supabase.co'
    // Anon key is publishable; embedded in the app bundle as NEXT_PUBLIC_SUPABASE_ANON_KEY.
    // We can read it from a freshly-fetched page chunk.
    let anon = null
    try {
      const r = await fetch('/_next/static/chunks/main-app.js', { cache: 'no-store' }).then(r => r.text())
      anon = r.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}/)?.[0] || null
    } catch {}
    if (!anon) {
      // Fallback: probe other common chunks
      try {
        const r = await fetch('/_next/static/chunks/app/layout.js', { cache: 'no-store' }).then(r => r.text())
        anon = r.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}/)?.[0] || null
      } catch {}
    }
    if (!anon) return { ok: false, reason: 'no anon key found in chunks' }
    const client = mod.createClient(SUPABASE_URL, anon, {
      auth: { persistSession: true, storage: localStorage, storageKey: `sb-aaljufxcniacfggqiuls-auth-token` },
    })
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    return { ok: !error, error: error?.message, userId: data?.user?.id }
  }, { email: EMAIL, password: PASSWORD })
  if (!result.ok) {
    console.log('  [login failed]', JSON.stringify(result))
    return false
  }
  // Verify session persisted to localStorage
  const ok = await page.waitForFunction(
    () => Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)),
    null,
    { timeout: 5000 },
  ).catch(() => null)
  // Navigate to the dashboard so the app picks up the session via its own supabase client init
  await page.goto(`${baseUrl}/employer/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  return !!ok
}

async function signOut(page) {
  // Try the UI path: open the profile menu and click "Log out".
  // Header dropdown trigger is the avatar/initials button labelled "Open profile menu".
  const trigger = page.locator('button[aria-label="Open profile menu"]').first()
  await trigger.waitFor({ timeout: 10000 })
  await trigger.click()
  await page.waitForTimeout(400)
  const logoutBtn = page.getByRole('button', { name: /^Log out$/i }).first()
  await logoutBtn.click({ timeout: 5000 })
  // Wait for redirect away from authenticated route
  await page.waitForTimeout(3000)
}

async function runOne(name, engine, options) {
  console.log(`\n=== ${name} ===`)
  const browser = await engine.launch()
  const ctx = await browser.newContext(options)
  const page = await ctx.newPage()
  const result = { name, login: null, postLogin: null, postSignout: null, reloginOk: null, pass: false, notes: [] }
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await clearAll(page)

    // Login round 1
    await login(page, BASE)
    result.postLogin = await snapshot(page)
    console.log('  postLogin:', JSON.stringify(result.postLogin))

    // Signout
    await signOut(page)
    result.postSignout = await snapshot(page)
    console.log('  postSignout:', JSON.stringify(result.postSignout))
    const signoutClean = result.postSignout.cookieNames.length === 0 && result.postSignout.lsKeys.length === 0

    // Negative case: re-login + access dashboard
    await login(page, BASE)
    // login() already navigates to /employer/dashboard; rely on that. Brief
    // re-navigation can race with internal router.replace on WebKit.
    await page.waitForTimeout(2000)
    const finalUrl = page.url()
    const onDashboard = /\/employer\/dashboard/.test(finalUrl)
    result.reloginOk = { finalUrl, onDashboard }
    console.log('  reloginOk:', JSON.stringify(result.reloginOk))

    result.pass = signoutClean && onDashboard
    if (!signoutClean) result.notes.push('signout left residue')
    if (!onDashboard) result.notes.push(`relogin dashboard load failed, landed at ${finalUrl}`)
  } catch (err) {
    result.notes.push(`exception: ${err.message?.slice(0, 200)}`)
  } finally {
    await browser.close()
  }
  return result
}

;(async () => {
  const results = []
  for (const c of CONTEXTS) {
    const r = await runOne(c.name, c.engine, c.options)
    results.push(r)
  }
  console.log('\n=== MATRIX ===')
  for (const r of results) {
    console.log(`${r.name}: ${r.pass ? 'PASS' : 'FAIL'}${r.notes.length ? ' — ' + r.notes.join('; ') : ''}`)
  }
  const overall = results.every(r => r.pass)
  console.log('\nOVERALL:', overall ? 'PASS' : 'FAIL')
  console.log('\n--- JSON ---')
  console.log(JSON.stringify({ base: BASE, results, overall }, null, 2))
  process.exit(overall ? 0 : 1)
})()
