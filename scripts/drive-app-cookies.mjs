// THE APP SETS NOTHING OPTIONAL AND SHOWS NO PROMPT; THE WEBSITE IS AS IT WAS.
//
//   node --env-file=.env.local scripts/drive-app-cookies.mjs <url>
//
// Drives a DEPLOYED build in a real browser. The target is an argument and
// never a default — this file is not allowed to guess where it runs.
//
// "IN THE APP" HERE IS A STUB, AND EVERY LINE THAT RELIES ON IT SAYS SO.
// window.Capacitor is injected before any page script, which is what the real
// shell's native bridge does — so it exercises the rule the site keys on. It
// is still a desktop browser, not the iOS app. The device check is the
// confirmation.
//
// THE SEEDED CASE IS THE ONE THAT MATTERS. A clear that never runs and a clear
// that runs on an empty jar look identical, so the jar is FILLED first,
// asserted full, then the page loads, then the jar is read.
//
// Reads the jar through context.cookies(), which includes HttpOnly cookies,
// not document.cookie, which does not.

import { chromium } from 'playwright'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
if (!BASE) { console.error('usage: node --env-file=.env.local scripts/drive-app-cookies.mjs <url>'); process.exit(2) }
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const isPreview = BASE.includes('.vercel.app')
if (isPreview && !BYPASS) { console.error('SKIP  preview target and no VERCEL_AUTOMATION_BYPASS_SECRET'); process.exit(2) }
const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD
const EMAIL = 'pauldavies.gbr+candidate@gmail.com'
const HOST = new URL(BASE).hostname

const OPTIONAL = ['thrive_country', 'thrive_tz', 'thrive_attr']
const CONSENT = 'hex_cookie_consent'
const ACCEPTED = encodeURIComponent(JSON.stringify({ essential: true, functional: true }))
// Set by Vercel's protection bypass on previews only — never on production.
const PREVIEW_ONLY = /^(_vercel_jwt|__vercel_live_token|_vercel_sso_nonce)$/

let bad = 0
const check = (label, ok, detail = '') => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(70) + detail)
}

const browser = await chromium.launch()

async function context({ app, seed }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...(isPreview ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  if (app) {
    await ctx.addInitScript(() => {
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }
    })
  }
  if (seed) {
    await ctx.addCookies([
      { name: CONSENT, value: ACCEPTED, domain: HOST, path: '/' },
      { name: 'thrive_country', value: 'GB', domain: HOST, path: '/' },
      { name: 'thrive_tz', value: 'Europe%2FLondon', domain: HOST, path: '/' },
      { name: 'thrive_attr', value: '%7B%22ref%22%3A%22li%22%7D', domain: HOST, path: '/' },
    ])
  }
  return ctx
}
const names = async ctx => (await ctx.cookies()).map(c => c.name).filter(n => !PREVIEW_ONLY.test(n)).sort()
// Hydration signal present on both web and app: the help-chat launcher, a
// client-only component mounted by the same provider as the banner.
const CHAT = '[aria-label*="Ask Thrive"]'
const hydrated = page => page.waitForSelector(CHAT, { state: 'attached', timeout: 30000 })

try {
  // ── A. APP (STUBBED BRIDGE), FRESH JAR ───────────────────────────────
  console.log('\nA. APP — STUBBED window.Capacitor, NOT THE REAL APP — fresh jar, ?ref=li on the URL')
  {
    const ctx = await context({ app: true })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?ref=li`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    // The banner is an effect too, so absence needs a window: on the website
    // (case C) it appears well inside this. Stated, not hidden.
    await page.waitForTimeout(3000)
    check('[stub] no cookie banner rendered', (await page.locator('[data-cookie-banner]').count()) === 0)
    check('[stub] no Cookie Settings control in the footer',
      (await page.getByRole('button', { name: 'Cookie Settings' }).count()) === 0)
    await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await page.waitForTimeout(1500)
    const jar = await names(ctx)
    check('[stub] no optional cookie written, across two navigations',
      OPTIONAL.every(n => !jar.includes(n)), `jar: ${jar.join(', ') || '(empty)'}`)
    check('[stub] no consent record written', !jar.includes(CONSENT))
    const ls = await page.evaluate(() => localStorage.getItem('thrive_attr'))
    check('[stub] no thrive_attr in local storage', ls === null, String(ls))
    await ctx.close()
  }

  // ── B. APP (STUBBED BRIDGE), SEEDED JAR — the clear must actually run ──
  console.log('\nB. APP — STUBBED window.Capacitor — jar SEEDED with an Accept and all three optional')
  {
    const ctx = await context({ app: true, seed: true })
    const before = await names(ctx)
    check('BEFORE load: the three optional cookies are in the jar', OPTIONAL.every(n => before.includes(n)), before.join(', '))
    check('BEFORE load: the consent cookie is in the jar', before.includes(CONSENT))
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    // Wait on the thing being tested: false while the clear has not run.
    const cleared = await page.waitForFunction(
      () => !/(^|; )(thrive_tz|thrive_attr|hex_cookie_consent)=/.test(document.cookie),
      null, { timeout: 30000 },
    ).then(() => true).catch(() => false)
    check('[stub] the clear ran (optional + consent gone from document.cookie)', cleared)
    await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await page.waitForTimeout(1500)
    const after = await names(ctx)
    check('[stub] AFTER a second navigation: no optional cookie, edge did not re-stamp',
      OPTIONAL.every(n => !after.includes(n)), `jar: ${after.join(', ') || '(empty)'}`)
    check('[stub] AFTER: no consent record', !after.includes(CONSENT))
    check('[stub] no banner', (await page.locator('[data-cookie-banner]').count()) === 0)
    await ctx.close()
  }

  // ── C. WEBSITE, FRESH, ACCEPT ─────────────────────────────────────────
  console.log('\nC. WEBSITE — no bridge — fresh jar, ?ref=li, Accept')
  {
    const ctx = await context({ app: false })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?ref=li`, { waitUntil: 'domcontentloaded' })
    const banner = await page.waitForSelector('[data-cookie-banner]', { timeout: 30000 }).then(() => true).catch(() => false)
    check('the banner renders', banner)
    check('the footer Cookie Settings control renders',
      (await page.getByRole('button', { name: 'Cookie Settings' }).count()) >= 1)
    const pre = await names(ctx)
    check('before choosing: no optional cookie (undecided is a no)', OPTIONAL.every(n => !pre.includes(n)), pre.join(', '))
    await page.getByRole('button', { name: 'Accept', exact: true }).first().click()
    await page.waitForFunction(() => /(^|; )thrive_tz=/.test(document.cookie), null, { timeout: 15000 }).catch(() => {})
    await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    const jar = await names(ctx)
    check('Accept: consent cookie written', jar.includes(CONSENT))
    check('Accept: thrive_tz written', jar.includes('thrive_tz'), jar.join(', '))
    check('Accept: thrive_attr written (arrived on ?ref=li)', jar.includes('thrive_attr'))
    check('Accept: thrive_country stamped at the edge on the next request',
      jar.includes('thrive_country'), isPreview ? '(needs a geo header on the preview)' : '')
    await ctx.close()
  }

  // ── D. WEBSITE, FRESH, DECLINE ────────────────────────────────────────
  console.log('\nD. WEBSITE — no bridge — fresh jar, ?ref=li, Decline')
  {
    const ctx = await context({ app: false })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?ref=li`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-cookie-banner]', { timeout: 30000 })
    await page.getByRole('button', { name: 'Decline optional' }).click()
    await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await page.waitForTimeout(1500)
    const jar = await names(ctx)
    check('Decline: no optional cookie written', OPTIONAL.every(n => !jar.includes(n)), jar.join(', '))
    check('Decline: the refusal is recorded', jar.includes(CONSENT))
    await ctx.close()
  }

  // ── E. WEBSITE, SEEDED ACCEPT — must NOT be cleared ──────────────────
  console.log('\nE. WEBSITE — no bridge — jar SEEDED with an Accept: nothing is removed')
  {
    const ctx = await context({ app: false, seed: true })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await page.waitForTimeout(2000)
    const jar = await names(ctx)
    check('an accepted website visitor keeps all three', OPTIONAL.every(n => jar.includes(n)), jar.join(', '))
    check('and keeps the consent record', jar.includes(CONSENT))
    check('and sees no banner (already answered)', (await page.locator('[data-cookie-banner]').count()) === 0)
    await ctx.close()
  }

  // ── F. APP (STUBBED), SIGNED IN — THE COMPLETE REMAINING JAR ──────────
  console.log('\nF. APP — STUBBED window.Capacitor — signed in with a password: every cookie left')
  if (!PASSWORD) {
    console.log('  SKIP  TEST_ACCOUNT_PASSWORD not set')
  } else {
    const ctx = await context({ app: true, seed: true })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('#login-email', EMAIL)
    await page.fill('#login-password', PASSWORD)
    const submit = page.locator('form:has(#login-password) button[type="submit"]:not([disabled])')
    await submit.waitFor({ timeout: 30000 })
    await submit.click()
    const signedIn = await page.waitForURL(u => !/\/login/.test(u.pathname), { timeout: 40000 }).then(() => true).catch(() => false)
    check('[stub] signed in', signedIn, page.url().replace(BASE, ''))
    await hydrated(page).catch(() => {})
    await page.waitForTimeout(2000)
    const all = (await ctx.cookies()).filter(c => !PREVIEW_ONLY.test(c.name))
    const optionalLeft = all.filter(c => OPTIONAL.includes(c.name) || c.name === CONSENT)
    check('[stub] signed in: no optional cookie and no consent record', optionalLeft.length === 0,
      optionalLeft.map(c => c.name).join(', '))
    console.log('\n  THE COMPLETE JAR, SIGNED IN, IN THE STUBBED APP (preview-only bypass cookies excluded):')
    for (const c of all.sort((a, b) => a.name.localeCompare(b.name))) {
      const life = c.expires === -1 ? 'session' : `${Math.round((c.expires - Date.now() / 1000) / 86400)}d`
      console.log(`    ${c.name.replace(/sb-[a-z0-9]+-/, 'sb-<ref>-').padEnd(38)} ${c.domain.padEnd(28)} ${life.padEnd(8)} httpOnly=${c.httpOnly}`)
    }
    // Sign out so the fixture's session does not linger in a context we close anyway.
    await ctx.close()
  }
} catch (e) {
  bad++
  console.log('  FAIL the drive threw: ' + (e && e.message ? e.message.split('\n')[0] : e))
}

await browser.close()
console.log(bad ? `\n${bad} FAILED` : '\nall passed')
process.exit(bad ? 1 : 0)
