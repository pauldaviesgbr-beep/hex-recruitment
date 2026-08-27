// DOES A REAL SIGNUP ACTUALLY GET WELCOMED NOW?
//
// A code change that looks right is what has been there all along. This drives
// the path that has NEVER worked — email/password — and then asks email_log,
// which is a fact about what was sent rather than an inference from the code.
//
// WHY THIS PATH. The email/password route is the one whose failure was
// systematic rather than racy: the send sat inside `if (!existingRole)`, and
// CandidateSignupForm stamps role at signUp(), so the block was skipped every
// single time. 0 of 4 in the window email_log can see. If this now works, the
// gate fix is proven; the rate-limit and await fixes ride on the same call.
//
// TWO PHASES, because Supabase emails a confirmation link and the welcome only
// fires when that link is followed — which is the whole point: the fault lived
// at /auth/confirm.
//
//   node scripts/drive-welcome-email.mjs signup  <baseUrl>
//   node scripts/drive-welcome-email.mjs confirm <baseUrl> "<confirm-url>"
//   node scripts/drive-welcome-email.mjs clean   <baseUrl>
//
// It signs up as pauldavies.gbr+welcome<ts>@gmail.com — Paul's own alias, so
// every message it causes lands in his inbox and nowhere else.

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSeededStorage } from './lib/seed-storage.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
{
  const f = path.join(REPO, '.env.local')
  if (!existsSync(f)) { console.error('SKIP  .env.local not found'); process.exit(2) }
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const MODE = process.argv[2], BASE = process.argv[3], CONFIRM_URL = process.argv[4]
if (!MODE || !BASE) { console.error('usage: signup|confirm|clean <baseUrl> [confirmUrl]'); process.exit(2) }
if (!env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  no service key'); process.exit(2) }

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
const STATE = path.join(REPO, 'drive-shots', '.welcome-state.json')
mkdirSync(path.join(REPO, 'drive-shots'), { recursive: true })

let bad = 0
const check = (l, ok, d) => { if (!ok) bad++; console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(l).padEnd(56) + (d ?? '')); return ok }
const ctxOpts = {
  viewport: { width: 390, height: 844 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
}

if (MODE === 'signup') {
  const stamp = Date.now()
  const EMAIL = `pauldavies.gbr+welcome${stamp}@gmail.com`
  const PW = 'Drv!' + Math.random().toString(36).slice(2, 10) + '#Za7'

  // THE CONTROL FOR THE WHOLE EXERCISE, taken BEFORE anything runs: this
  // address has never been welcomed. Without it, finding a row afterwards
  // could be a row that was always there.
  const { data: before } = await admin.from('email_log')
    .select('id').eq('email_type', 'candidate_welcome').ilike('recipient', EMAIL)
  check('no welcome exists for this address yet', (before || []).length === 0, EMAIL)

  const browser = await chromium.launch()
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(e.message))
  await withSeededStorage(page, 'consentAccepted')

  console.log('\n1. SIGNING UP THE WAY A CANDIDATE DOES')
  await page.goto(`${BASE}/register/employee`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  await page.fill('input[placeholder="John Smith"]', `Wlcm Testperson${stamp}`)
  await page.fill('input[placeholder="you@email.com"]', EMAIL)
  await page.fill('input[placeholder="At least 8 characters"]', PW)
  await page.getByRole('button', { name: /Create account/i }).first().click()
  await page.waitForTimeout(9000)
  const text = await page.evaluate(() => document.body.innerText || '')
  check('the form accepted it', !/already exists|went wrong/i.test(text),
    (text.match(/[^\n]{0,60}(exists|wrong)[^\n]{0,20}/i) || ['clean'])[0])
  check('it asks us to confirm by email', /confirm|check your (inbox|email)/i.test(text),
    (text.match(/[^\n]*(confirm|inbox)[^\n]*/i) || ['NOT FOUND'])[0].slice(0, 56))
  check('nothing threw', errs.length === 0, errs.join(' | ') || 'clean')
  await page.screenshot({ path: 'drive-shots/welcome-signup.png' })

  const { data: u } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const made = (u?.users || []).find(x => (x.email || '').toLowerCase() === EMAIL.toLowerCase())
  check('an auth user exists', !!made, made?.id || 'not found')
  check('…and is NOT yet confirmed', !made?.email_confirmed_at, String(made?.email_confirmed_at))
  writeFileSync(STATE, JSON.stringify({ email: EMAIL, password: PW, userId: made?.id, stamp }))

  await browser.close()
  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  READ THE CONFIRMATION EMAIL sent to ' + EMAIL)
  console.log('  then: node scripts/drive-welcome-email.mjs confirm ' + BASE + ' "<link>"')
  process.exit(bad ? 1 : 0)
}

if (MODE === 'confirm') {
  if (!CONFIRM_URL) { console.error('need the confirmation URL from the email'); process.exit(2) }
  const st = JSON.parse(readFileSync(STATE, 'utf8'))
  const browser = await chromium.launch()
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()

  console.log('\n2. FOLLOWING THE LINK — this is where the welcome fires')
  await page.goto(CONFIRM_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(12000)
  check('landed somewhere in the app', !/error=/.test(page.url()), page.url().slice(0, 70))
  await page.screenshot({ path: 'drive-shots/welcome-confirmed.png' })

  const { data: u } = await admin.auth.admin.getUserById(st.userId)
  check('the account is now confirmed', !!u?.user?.email_confirmed_at, String(u?.user?.email_confirmed_at))

  console.log('\n3. email_log — a fact about what was SENT, not about the code')
  // Give the awaited send a moment to land its row.
  await new Promise(r => setTimeout(r, 5000))
  const { data: rows } = await admin.from('email_log')
    .select('created_at, email_type, recipient, subject, success, error')
    .ilike('recipient', st.email).order('created_at', { ascending: false })
  const welcome = (rows || []).find(r => r.email_type === 'candidate_welcome')
  check('A candidate_welcome ROW EXISTS', !!welcome,
    welcome ? welcome.subject : 'NONE — the fix did not work')
  if (welcome) {
    check('…and it SUCCEEDED', welcome.success === true, welcome.error || 'no error')
    check('…addressed to the candidate', String(welcome.recipient).toLowerCase() === st.email.toLowerCase())
  }
  console.log('  every row for this address: ' + (rows || []).map(r => r.email_type + (r.success ? '' : '(failed)')).join(', '))

  console.log('\n4. AND IT CANNOT SEND A SECOND ONE')
  // The half that stops the fix becoming a worse bug. Calling again must be
  // refused, or every returning candidate gets welcomed on every sign-in.
  const res = await fetch(`${BASE}/api/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
    },
    body: JSON.stringify({ to: st.email, type: 'candidate_welcome', data: { candidateName: 'Wlcm' } }),
  })
  const body = await res.json().catch(() => ({}))
  check('a repeat request is refused', body?.skipped === 'already_welcomed',
    JSON.stringify(body).slice(0, 60))
  const { data: after } = await admin.from('email_log')
    .select('id').eq('email_type', 'candidate_welcome').ilike('recipient', st.email)
  check('…and no second row was written', (after || []).length === 1, (after || []).length + ' row(s)')

  await browser.close()
  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  a real signup was greeted, once, and the second attempt was refused')
  console.log('  now: node scripts/drive-welcome-email.mjs clean ' + BASE)
  process.exit(bad ? 1 : 0)
}

if (MODE === 'clean') {
  const st = JSON.parse(readFileSync(STATE, 'utf8'))
  console.log('\n5. CLEAN UP — counted, not hoped')
  await admin.from('candidate_profiles').delete().eq('user_id', st.userId).then(() => {}, () => {})
  await admin.from('employees').delete().eq('user_id', st.userId).then(() => {}, () => {})
  await admin.auth.admin.deleteUser(st.userId).catch(() => {})
  const { data: p } = await admin.from('candidate_profiles').select('user_id').eq('user_id', st.userId).maybeSingle()
  check('candidate profile gone', !p)
  const { data: u } = await admin.auth.admin.getUserById(st.userId).catch(() => ({ data: null }))
  check('auth user gone', !u?.user, u?.user?.email || 'deleted')
  // email_log rows are LEFT ON PURPOSE: they are the evidence this worked, and
  // deleting them would remove the only durable record of the proof.
  console.log('  email_log rows left in place — they are the evidence')
  try { unlinkSync(STATE) } catch { /* already gone */ }
  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  nothing left behind but the proof')
  process.exit(bad ? 1 : 0)
}

console.error('unknown mode: ' + MODE)
process.exit(2)
