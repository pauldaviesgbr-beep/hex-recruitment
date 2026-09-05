// THE CONFIRM BANNER MUST NOT TELL SOMEBODY TO DO WHAT THEY HAVE DONE.
//
//   node scripts/prove-confirm-banner-does-not-assert.mjs <deployment-url>
//
// URL REQUIRED — this creates a throwaway account; it must not guess where.
//
// ── THE FAULT ────────────────────────────────────────────────────────────
//
// `thrive_pending_confirm` is written to localStorage at signup. It clears
// on three things, ALL of which need this browser: a session appearing, a
// password sign-in, or a seven-day expiry. Confirmation happens SERVER-side
// — and in the iOS shell it happens in SAFARI, because no universal link
// claims the domain. So the app can never learn it, and the banner said
// "Confirm your email to finish" to somebody who had confirmed an hour
// earlier. Every app user who registers by email walks that path.
//
// WE DO NOT FIX IT BY ASKING THE SERVER. An "is this address confirmed?"
// route answers for ANY address to ANY caller — an enumeration oracle, and
// a worse fault than the notice. The fix is to stop asserting: the copy
// carries the action and drops the claim, so it is true in BOTH states.
//
// ── WHAT THIS ASSERTS ────────────────────────────────────────────────────
//
// Not "the banner is gone" — it cannot go, and pretending otherwise would
// need the oracle. What must be true is that THE BANNER DOES NOT INSTRUCT.
// So: sign up in one browser context, confirm the token in a SECOND (the
// Safari half of the real sequence), return to the first, and read the
// words. The old copy states a fact; the new copy offers both branches.
//
// The two-context shape is the point. A single-context run would clear the
// flag when the session appeared and prove nothing.

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { withSeededStorage } from './lib/seed-storage.mjs'

const BASE = process.argv[2]
if (!BASE || !/^https:\/\//.test(BASE)) {
  console.log('SKIP  pass the deployment URL to drive.')
  process.exit(2)
}
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
if (!env.SUPABASE_SERVICE_ROLE_KEY) { console.log('SKIP  no service key'); process.exit(2) }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(58) + (detail ?? ''))
}

const stamp = Date.now()
const EMAIL = `proof@banner-probe-${stamp}.invalid`
const PASSWORD = randomBytes(12).toString('base64url')
let userId = null
const browser = await chromium.launch()
const extraHTTPHeaders = env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { 'x-vercel-protection-bypass': env.VERCEL_AUTOMATION_BYPASS_SECRET }
  : undefined

try {
  // ── CONTEXT ONE: the app. Write the flag exactly as signup does. ───────
  const app = await browser.newContext({ extraHTTPHeaders })
  const page = await app.newPage()
  await withSeededStorage(page, 'consentAccepted')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((email) => {
    localStorage.setItem('thrive_pending_confirm',
      JSON.stringify({ email, at: Date.now() }))
  }, EMAIL)

  // ── THE ACCOUNT, AND ITS CONFIRMATION IN A DIFFERENT BROWSER ──────────
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup', email: EMAIL, password: PASSWORD,
  })
  if (error) throw new Error('generateLink: ' + error.message)
  const hashed = data.properties?.hashed_token
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 })
  userId = listed.users.find(u => u.email === EMAIL)?.id ?? null
  check('a throwaway signup exists, unconfirmed', !!userId && !!hashed,
    userId ? userId.slice(0, 8) + '…' : 'none')

  const safari = await browser.newContext({ extraHTTPHeaders })
  await safari.request.get(
    `${BASE}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=signup&role=employee`,
    { maxRedirects: 0 })
  await safari.close()
  const { data: after } = await admin.auth.admin.getUserById(userId)
  check('…and it is CONFIRMED, in a different browser', !!after?.user?.email_confirmed_at,
    after?.user?.email_confirmed_at ? 'confirmed' : 'NOT confirmed')

  // ── BACK IN THE APP: read the words. ──────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 30000 })
  const banner = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')]
      .find(d => /signed up as/i.test(d.textContent || '') && d.querySelector('strong'))
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null
  })
  check('the banner is present (the flag survives, as it must)', !!banner,
    banner ? '' : 'no banner — the flag cleared, which this cannot prove anything from')
  if (banner) console.log(`      "${banner}"`)

  // THE ASSERTION: it must not INSTRUCT them to do the done thing.
  const instructs = /Confirm your email to finish/i.test(banner || '')
    || (/click the link/i.test(banner || '') && !/already/i.test(banner || ''))
  check('it does NOT instruct them to confirm what they have confirmed',
    !instructs, instructs ? 'still states it as a fact' : 'offers both branches')
  check('…and it names the sign-in they can actually use',
    /log in|sign in/i.test(banner || ''), '')
  await app.close()
} catch (e) {
  check('the proof ran to completion', false, e.message?.slice(0, 130))
} finally {
  await browser.close()
  if (userId) {
    await admin.from('candidate_profiles').delete().eq('user_id', userId).then(() => {}, () => {})
    await admin.from('employees').delete().eq('user_id', userId).then(() => {}, () => {})
    await admin.auth.admin.deleteUser(userId).catch(() => {})
    const { data: gone } = await admin.auth.admin.listUsers({ perPage: 200 })
    const removed = !gone.users.find(u => u.id === userId)
    check('teardown: the throwaway account is gone', removed, removed ? 'gone' : 'STILL THERE')
  }
}

console.log('')
console.log(bad ? `${bad} FAILED` : 'the banner offers both branches instead of asserting one')
process.exit(bad ? 1 : 0)
