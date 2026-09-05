// A SPENT CONFIRM LINK MUST NOT CARRY A STRANGER'S SESSION ONWARD.
//
//   npx tsx scripts/prove-confirm-checks-whose-session.ts <deployment-url>
//
// URL REQUIRED — this mints real confirm tokens and creates a throwaway
// account; it must not guess where. Takes ~90 seconds: the stale case waits
// out the real freshness window rather than pretending to.
//
// ── THE FAULT ────────────────────────────────────────────────────────────
//
// /auth/confirm tolerates a spent token if a valid session is already in the
// jar, because one click fans out into several requests and the later ones
// legitimately find the token gone (25 Aug 2026, from a real employer's auth
// log). That tolerance accepted ANY session. On 4 Sept a signup was confirmed
// while the browser still held YESTERDAY'S session for a different account —
// the route inspected the stranger's session and continued as them, and the
// person typed their onboarding answers onto the wrong profile.
//
// ── THE THREE CASES, AND WHY EACH IS DRIVEN THE WAY IT IS ────────────────
//
// THE ROUTE'S OWN Location HEADER IS THE ASSERTION, never where the browser
// comes to rest — a downstream forward would confuse a resting-path check
// (the recovery-landing lesson).
//
//   FRESH — one click, FOUR CONCURRENT REQUESTS, one shared jar, launched
//           together rather than one-after-another with the cookie already
//           in place. This is the 25 Aug case and it must not regress: a fix
//           that bounces real single-click confirmations reinstates it. The
//           outcome of every request is printed, not just the verdict.
//   STALE — a session signed in for real, then AGED PAST THE WINDOW by
//           waiting, then presented with a spent token. Must bounce to
//           /login?error=link_already_used AND leave no auth cookie behind.
//           Waiting is the only honest way to make a session old.
//   NAKED — spent token, no session at all. Bounces as it always did.
//
// The browser context is Playwright's so the cookies are the real SSR ones
// the route reads; request.get(maxRedirects: 0) shares that jar and returns
// the raw Location.

import { chromium, type BrowserContext } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const BASE = process.argv[2]

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(58) + (detail ?? ''))
}

// Must match SIBLING_SESSION_MAX_AGE_MS in lib/authCallback.ts. Read from the
// source rather than retyped — a restated rule is a second copy of it.
const RULE = readFileSync('lib/authCallback.ts', 'utf8')
  .match(/SIBLING_SESSION_MAX_AGE_MS\s*=\s*([\d_]+)/)
const WINDOW_MS = RULE ? Number(RULE[1].replace(/_/g, '')) : 60_000

async function main() {
  if (!BASE || !/^https:\/\//.test(BASE)) {
    console.log('SKIP  pass the deployment URL to drive.')
    console.log('      This creates a throwaway account and refuses to guess where.')
    process.exit(2)
  }
  const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL_ || !SERVICE || !env.TEST_ACCOUNT_PASSWORD) {
    console.log('SKIP  service credentials or the fixture password are missing')
    process.exit(2)
  }
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  const extraHTTPHeaders = env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { 'x-vercel-protection-bypass': env.VERCEL_AUTOMATION_BYPASS_SECRET }
    : undefined

  const stamp = Date.now()
  const NEW_EMAIL = `proof@confirm-probe-${stamp}.invalid`
  const PASSWORD = randomBytes(12).toString('base64url')
  let newUserId: string | null = null
  const browser = await chromium.launch()

  const confirmUrl = (hash: string) =>
    `${BASE}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=signup&role=employee`

  const mint = async (email: string) => {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'signup', email, password: PASSWORD,
    })
    if (error) throw new Error('generateLink: ' + error.message)
    const hashed = (data.properties as { hashed_token?: string })?.hashed_token
    if (!hashed) throw new Error('no hashed_token on the generated link')
    return hashed
  }

  const authCookieCount = async (ctx: BrowserContext) =>
    (await ctx.cookies()).filter(c => /^sb-.*-auth-token/.test(c.name)).length

  try {
    console.log(`driving ${BASE}`)
    console.log(`freshness window read from the source: ${WINDOW_MS}ms`)
    console.log('')

    // ── FRESH: one click, four concurrent requests, one jar ──────────────
    console.log('FRESH — one click fanning out into four concurrent requests')
    const tokenHash = await mint(NEW_EMAIL)
    const { data: created } = await admin.auth.admin.listUsers({ perPage: 200 })
    newUserId = created.users.find(u => u.email === NEW_EMAIL)?.id ?? null
    check('a throwaway account and a real confirm token exist',
      !!newUserId && !!tokenHash, newUserId ? newUserId.slice(0, 8) + '…' : 'none')

    const burstCtx = await browser.newContext({ extraHTTPHeaders })
    const burst = await Promise.all([0, 1, 2, 3].map(() =>
      burstCtx.request.get(confirmUrl(tokenHash), { maxRedirects: 0 })))
    const locs = burst.map(r => (r.headers()['location'] ?? '(none)').replace(BASE, ''))
    for (const l of locs) console.log('      -> ' + l)
    const bounced = locs.filter(l => l.includes('/login')).length
    const carriedOn = locs.filter(l => !l.includes('/login') && l !== '(none)').length
    check('at least one request completed the confirmation', carriedOn >= 1, `${carriedOn} continued`)
    check('…and NONE of the duplicates was bounced', bounced === 0,
      bounced ? `${bounced} bounced — THE 25 AUG FAULT WOULD BE REINSTATED` : '0 bounced')
    await burstCtx.close()

    // ── STALE: a real session, genuinely aged past the window ────────────
    console.log('')
    console.log('STALE — a real session, aged past the window by waiting')
    const staleCtx = await browser.newContext({ extraHTTPHeaders })
    const page = await staleCtx.newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#login-email', { timeout: 30000 })
    await page.fill('#login-email', 'pauldavies.gbr+candidate@gmail.com')
    await page.fill('#login-password', env.TEST_ACCOUNT_PASSWORD)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForFunction(() => !location.pathname.includes('/login'), null, { timeout: 30000 })
    check('the fixture is signed in, with real SSR cookies',
      (await authCookieCount(staleCtx)) > 0, `${await authCookieCount(staleCtx)} auth cookie(s)`)

    const waitMs = WINDOW_MS + 5_000
    console.log(`      waiting ${Math.round(waitMs / 1000)}s so the session is genuinely older than the window…`)
    await new Promise(r => setTimeout(r, waitMs))

    // A SECOND throwaway token, spent by a first arrival, so the session in
    // the jar cannot possibly be the one this token made.
    const staleEmail = `proof@confirm-stale-${Date.now()}.invalid`
    const staleHash = await mint(staleEmail)
    const { data: created2 } = await admin.auth.admin.listUsers({ perPage: 200 })
    const staleUserId = created2.users.find(u => u.email === staleEmail)?.id ?? null
    // Spend it from a clean context, exactly as a preview fetcher would.
    const fetcher = await browser.newContext({ extraHTTPHeaders })
    await fetcher.request.get(confirmUrl(staleHash), { maxRedirects: 0 })
    await fetcher.close()

    const staleRes = await staleCtx.request.get(confirmUrl(staleHash), { maxRedirects: 0 })
    const staleLoc = (staleRes.headers()['location'] ?? '(none)').replace(BASE, '')
    console.log('      -> ' + staleLoc)
    check('a spent token + a STALE session bounces', staleLoc.includes('/login'), staleLoc)
    check('…and says the link was already used, not "try again"',
      staleLoc.includes('link_already_used'), staleLoc)
    check('…and the stale cookies are CLEARED, not carried',
      (await authCookieCount(staleCtx)) === 0, `${await authCookieCount(staleCtx)} auth cookie(s) left`)
    await staleCtx.close()

    if (staleUserId) {
      await admin.from('candidate_profiles').delete().eq('user_id', staleUserId).then(() => {}, () => {})
      await admin.from('employees').delete().eq('user_id', staleUserId).then(() => {}, () => {})
      await admin.auth.admin.deleteUser(staleUserId).catch(() => {})
    }

    // ── NAKED: unchanged behaviour ───────────────────────────────────────
    console.log('')
    console.log('NAKED — a spent token with no session at all')
    const nakedCtx = await browser.newContext({ extraHTTPHeaders })
    const nakedRes = await nakedCtx.request.get(confirmUrl(tokenHash), { maxRedirects: 0 })
    const nakedLoc = (nakedRes.headers()['location'] ?? '(none)').replace(BASE, '')
    console.log('      -> ' + nakedLoc)
    check('a spent token with no session still bounces', nakedLoc.includes('/login'), nakedLoc)
    await nakedCtx.close()
  } catch (e) {
    check('the proof ran to completion', false, (e as Error).message?.slice(0, 140))
  } finally {
    await browser.close()
    if (newUserId) {
      await admin.from('candidate_profiles').delete().eq('user_id', newUserId).then(() => {}, () => {})
      await admin.from('employees').delete().eq('user_id', newUserId).then(() => {}, () => {})
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      const { data: after } = await admin.auth.admin.listUsers({ perPage: 200 })
      const gone = !after.users.find(u => u.id === newUserId)
      check('teardown: the throwaway accounts are gone', gone, gone ? 'gone' : 'STILL THERE')
    }
  }

  console.log('')
  console.log(bad ? `${bad} FAILED` : 'the confirm callback checks WHOSE session it found')
  process.exit(bad ? 1 : 0)
}

main()
