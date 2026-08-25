// DOES A RECOVERY LINK LAND WHERE A PASSWORD CAN BE SET, WHEN `next` SAYS OTHERWISE?
//
// The link is minted with next=/dashboard ON PURPOSE. A link that already
// pointed at /reset-password would land there whether the fix exists or not,
// and would prove nothing — the two states have to give different answers or
// the check cannot tell which one it is in.
//
// SO THIS RUNS TWICE, AGAINST TWO HOSTS:
//   PRODUCTION is the positive control — the code WITHOUT the fix. It is
//   expected to land on /dashboard. If it does not, the instrument is wrong
//   about what the old behaviour was and nothing below can be trusted.
//   PREVIEW carries the fix and must land on /reset-password from the same
//   shaped link.
// Same script, same link shape, opposite answers. That is the proof.
//
// LANDING IS ONLY HALF OF IT. Supabase's "secure password change" refuses
// updateUser({password}) on an ORDINARY session — it wants the current
// password, which is precisely what a locked-out person does not have. The
// session this route hands over is minted server-side by verifyOtp, not by the
// browser's implicit flow, and whether THAT counts as a recovery session is
// the load-bearing question. A fix that lands someone on a form which then
// refuses them is not a fix. So this sets a password and signs in with it.
//
// ON THE TEST EMPLOYER ONLY. Never Adrian, never a real account. It changes
// the fixture's password and puts it back, and the last check proves the
// standing password works again — a restore that is not verified is a hope.
// Both hosts share one database, so the account is the same account on each.
//
//   node scripts/drive-recovery-landing.mjs <previewBase> [prodBase]

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Reads .env.local. Values stay in this object — never log one. */
function loadEnv() {
  const out = {}
  const file = path.join(REPO, '.env.local')
  if (!existsSync(file)) { console.error('SKIP  .env.local not found'); process.exit(2) }
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = loadEnv()
const PREVIEW = process.argv[2]
const PROD = process.argv[3] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const STANDING = env.TEST_EMPLOYER_PASSWORD || env.TEST_ACCOUNT_PASSWORD
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY

if (!PREVIEW) { console.error('usage: node scripts/drive-recovery-landing.mjs <previewBase> [prodBase]'); process.exit(2) }
if (!STANDING) { console.error('SKIP  TEST_EMPLOYER_PASSWORD not in .env.local'); process.exit(2) }
if (!SERVICE) { console.error('SKIP  SUPABASE_SERVICE_ROLE_KEY not in .env.local'); process.exit(2) }

mkdirSync('drive-shots', { recursive: true })

const TEMP = 'Thrive-recovery-drive-' + Date.now()
let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(56) + (detail ?? ''))
  return ok
}

const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } })

/**
 * Mint a recovery link in the token_hash form the email template uses.
 * NOT the admin `action_link` — that goes through Supabase's own /verify
 * endpoint and would not exercise our route at all.
 */
async function mintRecovery(base, next) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: EMAIL,
    options: { redirectTo: `${base}/auth/confirm` },
  })
  if (error) throw new Error('generateLink failed: ' + error.message)
  const hash = data?.properties?.hashed_token
  if (!hash) throw new Error('generateLink returned no hashed_token')
  const url = new URL(`${base}/auth/confirm`)
  url.searchParams.set('token_hash', hash)
  url.searchParams.set('type', 'recovery')
  url.searchParams.set('next', next)
  return url.toString()
}

const browser = await chromium.launch()
const ctxFor = base => ({
  viewport: { width: 1280, height: 900 },
  ...(BYPASS && base.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } }
    : {}),
})

/** Click a recovery link in a clean context and record every main-frame hop. */
async function followRecovery(base, next) {
  const link = await mintRecovery(base, next)
  const ctx = await browser.newContext(ctxFor(base))
  const page = await ctx.newPage()
  const chain = []
  page.on('response', r => {
    if (r.request().resourceType() !== 'document') return
    const loc = r.headers()['location']
    chain.push(`${r.status()} ${r.url().replace(base, '').split('token_hash=')[0].replace(/[?&]$/, '')}`
      + (loc ? `  → ${loc.replace(base, '')}` : ''))
  })
  await page.goto(link, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)
  // WHERE /auth/confirm SENT THEM, not where they came to rest. Those are
  // different questions and only the first is under test: an employer landing
  // on /dashboard is forwarded on to /employer/dashboard by the app itself,
  // which is correct and has nothing to do with this route's decision. Asserting
  // the resting path made the control read FAIL on behaviour that was exactly
  // right. The route's own Location header cannot be confused that way.
  const decided = chain
    .map(h => h.split('→')[1]?.trim())
    .filter(loc => loc && !loc.startsWith('/auth/confirm'))
    .pop() || null
  return { ctx, page, chain, decided, url: page.url(), path: new URL(page.url()).pathname }
}

async function signIn(base, password) {
  const ctx = await browser.newContext(ctxFor(base))
  const page = await ctx.newPage()
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', password)
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  let ok = false
  try {
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
    ok = true
  } catch { /* stayed on /login */ }
  await ctx.close()
  return ok
}

/**
 * Fill and submit the reset form on a page that is already on it.
 * BY ID, AND THE SUBMIT BY ITS NAME. This page carries SIXTEEN type="submit"
 * buttons — the header, the chat widget, the feedback control and the cookie
 * banner all use one. `.first()` clicks a header button, the form is never
 * submitted, and the run reports "the page silently does nothing", which reads
 * as a product fault. That already cost one session.
 */
async function submitNewPassword(page, value) {
  if (!(await page.locator('#password').count())) return { rendered: false, text: '' }
  await page.fill('#password', value)
  await page.fill('#confirmPassword', value)
  await page.getByRole('button', { name: /^reset password$/i }).first().click()
  await page.waitForTimeout(7000)
  return { rendered: true, text: await page.evaluate(() => document.body.innerText || '') }
}

try {
  // ── 1. POSITIVE CONTROL: the code WITHOUT the fix ─────────────────────
  console.log('\n1. CONTROL — production (no fix). next=/dashboard should WIN there.')
  const ctl = await followRecovery(PROD, '/dashboard')
  console.log('   chain: ' + (ctl.chain.join('\n          ') || '(none captured)'))
  check('production sends them to /dashboard — the old behaviour', ctl.decided === '/dashboard',
    '/auth/confirm → ' + ctl.decided + '   (came to rest at ' + ctl.path + ')')
  check('   … and therefore NOT to /reset-password', ctl.decided !== '/reset-password', String(ctl.decided))
  await ctl.page.screenshot({ path: 'drive-shots/recovery-control-prod.png' })
  await ctl.ctx.close()

  if (ctl.decided === '/reset-password') {
    console.log('\n  *** THE CONTROL ALREADY PASSES. The check cannot distinguish the two')
    console.log('      states, so nothing below is evidence. Stop and find out why.')
  }

  // ── 2. THE FIX: same link shape, preview ──────────────────────────────
  console.log('\n2. PREVIEW — the fix. next=/dashboard should be IGNORED.')
  const fix = await followRecovery(PREVIEW, '/dashboard')
  console.log('   chain: ' + (fix.chain.join('\n          ') || '(none captured)'))
  const landed = check('preview sends them to /reset-password despite next=/dashboard',
    fix.decided === '/reset-password', '/auth/confirm → ' + fix.decided)
  check('   … and it is where they come to rest', fix.path === '/reset-password', fix.path)
  const text2 = await fix.page.evaluate(() => document.body.innerText || '')
  check('it is not stuck on the verifying spinner', !/verifying your reset link/i.test(text2))
  check('it did not bounce to /login — the session cookie survived', !fix.path.includes('/login'), fix.path)
  const fields = await fix.page.locator('input[type="password"]').count()
  check('the password form is rendered', fields >= 2, fields + ' password field(s)')
  await fix.page.screenshot({ path: 'drive-shots/recovery-lands-on-reset.png', fullPage: false })

  // ── 3. CAN THE RECOVERY SESSION ACTUALLY SET A PASSWORD? ──────────────
  // The half that matters. An ordinary session is refused here with
  // current_password_required; a recovery session is not. This says which
  // one /auth/confirm hands over.
  console.log('\n3. SET A PASSWORD THROUGH THAT LANDING')
  let set = { rendered: false, text: '' }
  if (landed) set = await submitNewPassword(fix.page, TEMP)
  check('the form accepted the submit', set.rendered && !/current password|error|failed|could not/i.test(set.text),
    (set.text || '').split('\n').map(l => l.trim()).filter(Boolean)[0] || '(no text)')
  check('no current_password_required refusal', !/current password/i.test(set.text || ''))
  await fix.page.screenshot({ path: 'drive-shots/recovery-after-submit.png' })
  await fix.ctx.close()

  // ── 4. DID IT LAND IN THE DATABASE? ───────────────────────────────────
  console.log('\n4. PROVE THE CHANGE IS REAL — clean context, new password')
  const newWorks = check('the NEW password signs in', await signIn(PREVIEW, TEMP))

  // ── 5. PUT THE FIXTURE BACK ───────────────────────────────────────────
  console.log('\n5. RESTORE THE STANDING PASSWORD')
  if (newWorks) {
    const back = await followRecovery(PREVIEW, '/dashboard')
    check('restore: a second recovery link also lands on /reset-password', back.decided === '/reset-password', String(back.decided))
    const r = await submitNewPassword(back.page, STANDING)
    check('restore submitted', r.rendered)
    await back.ctx.close()
  }
  // ASKED OF THE AUTH API, NOT OF THE LOGIN PAGE. This drive fires several
  // sign-ins and two password updates inside two minutes, and Supabase rate
  // limits on exactly that. A throttled /login is indistinguishable from a
  // wrong password on screen — and reporting "THE FIXTURE IS BROKEN" when it
  // is not is the expensive direction of that mistake. signInWithPassword
  // answers the actual question: is this the password.
  const { error: standingErr } = await createClient(SUPA_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }).auth.signInWithPassword({ email: EMAIL, password: STANDING })
  const restored = check('THE STANDING PASSWORD WORKS AGAIN', !standingErr,
    standingErr ? standingErr.message : 'fixture restored')

  // And the temp one must be dead, or the restore only appeared to happen.
  const { error: tempErr } = await createClient(SUPA_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }).auth.signInWithPassword({ email: EMAIL, password: TEMP })
  check('the temporary password no longer works', Boolean(tempErr), tempErr ? tempErr.message : 'STILL ACCEPTED')

  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  the recovery link lands on /reset-password and a password can be set there')
  console.log('  shots: drive-shots/recovery-control-prod.png, recovery-lands-on-reset.png, recovery-after-submit.png')
  if (!restored) console.log('\n  *** THE TEST EMPLOYER PASSWORD IS NOT RESTORED. TEMP WAS: ' + TEMP)
  process.exitCode = bad ? 1 : 0
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  console.error('  If the fixture password was changed, the temporary value was: ' + TEMP)
  process.exitCode = 1
} finally {
  await browser.close()
}
