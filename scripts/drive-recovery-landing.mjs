// DOES A RECOVERY LINK LAND WHERE A PASSWORD CAN BE SET, WHEN `next` SAYS OTHERWISE?
//
// The link is minted with next=/dashboard ON PURPOSE. A link that already
// pointed at /reset-password would land there whether the fix exists or not,
// and would prove nothing — the two states have to give different answers or
// the check cannot tell which one it is in.
//
// LANDING IS ONLY HALF OF IT. Supabase's "secure password change" refuses
// updateUser({password}) on an ORDINARY session — it wants the current
// password, which is precisely what a locked-out person does not have. The
// session this route hands over is minted server-side by verifyOtp, not by the
// browser's implicit flow, and whether THAT counts as a recovery session is
// the load-bearing question. A fix that lands someone on a form which then
// refuses them is not a fix. So this sets a password and signs in with it.
//
// ── THE CONTROL, AND WHY IT HAS A SHELF LIFE ─────────────────────────────
// While the fix sat on a branch, the positive control was PRODUCTION: the same
// shaped link had to land on /dashboard there and /reset-password on preview.
// Same script, opposite answers.
//
// THAT CONTROL DIED THE MOMENT THE FIX MERGED, because the unfixed deployment
// it depended on no longer exists. This is the "a positive control must live
// outside the thing being changed" rule with a twist — here the control WAS a
// deployment, and shipping consumed it. So the control host is optional now,
// and when it turns out to be fixed too the script says EXPIRED CONTROL rather
// than FAIL. A stale control that reads as a product fault is how a working
// check gets deleted by the next person.
//
// ON THE TEST EMPLOYER ONLY. Never a real account. It changes the fixture's
// password and puts it back, and proves the restore against the auth API —
// a restore that is not verified is a hope.
//
//   node scripts/drive-recovery-landing.mjs [targetBase] [controlBase]
//
//   targetBase   host under test. Default production. Must land on /reset-password.
//   controlBase  optional unfixed host. Omit once the fix is everywhere.

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
const TARGET = process.argv[2] || 'https://thrivecareer.co.uk'
const CONTROL = process.argv[3] || null
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const STANDING = env.TEST_EMPLOYER_PASSWORD || env.TEST_ACCOUNT_PASSWORD
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY

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
const anonClient = () => createClient(SUPA_URL, ANON, { auth: { persistSession: false } })

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
  // which is correct and has nothing to do with this route's decision.
  // Asserting the resting path made the control read FAIL on behaviour that
  // was exactly right. The route's own Location header cannot be confused
  // that way.
  const decided = chain
    .map(h => h.split('→')[1]?.trim())
    .filter(loc => loc && !loc.startsWith('/auth/confirm'))
    .pop() || null
  return { ctx, page, chain, decided, url: page.url(), path: new URL(page.url()).pathname }
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
  if (!(await page.locator('#password').count())) return { rendered: false, text: '', put: null }
  // WATCH THE CALL, NOT THE BUTTON. A restore once failed with every visible
  // sign of success — the form rendered, the click landed, the page moved on —
  // and the password simply had not changed. `rendered: true` was all the
  // script knew, so a real failure was completely undiagnosable. The status of
  // PUT /auth/v1/user is the answer and it costs one listener.
  let put = null
  const onResponse = r => { if (/\/auth\/v1\/user$/.test(r.url()) && r.request().method() === 'PUT') put = r.status() }
  page.on('response', onResponse)
  await page.fill('#password', value)
  await page.fill('#confirmPassword', value)
  await page.getByRole('button', { name: /^reset password$/i }).first().click()
  await page.waitForTimeout(7000)
  page.off('response', onResponse)
  return { rendered: true, put, text: await page.evaluate(() => document.body.innerText || '') }
}

/** Asked of the auth API, never of /login — see the rate-limit note below. */
async function passwordWorks(password) {
  const { error } = await anonClient().auth.signInWithPassword({ email: EMAIL, password })
  return { ok: !error, message: error?.message }
}

console.log('\nTARGET  ' + TARGET)
console.log('CONTROL ' + (CONTROL || '(none — the unfixed deployment no longer exists)'))

try {
  // ── 1. THE CONTROL, IF THERE IS STILL ONE TO HAVE ─────────────────────
  if (CONTROL) {
    console.log('\n1. CONTROL — a host without the fix. next=/dashboard should WIN there.')
    const ctl = await followRecovery(CONTROL, '/dashboard')
    console.log('   chain: ' + (ctl.chain.join('\n          ') || '(none captured)'))
    if (ctl.decided === '/reset-password') {
      console.log('  ---- EXPIRED CONTROL, NOT A FAILURE ----')
      console.log('       This host has the fix too, so it can no longer show the old')
      console.log('       behaviour. The control was a DEPLOYMENT, and shipping consumed')
      console.log('       it. Drop the control argument, or point it at a host built')
      console.log('       before the fix. Do NOT "repair" the product over this.')
    } else {
      check('control sends them to /dashboard — the old behaviour', ctl.decided === '/dashboard',
        '/auth/confirm → ' + ctl.decided + '   (came to rest at ' + ctl.path + ')')
    }
    await ctl.page.screenshot({ path: 'drive-shots/recovery-control.png' })
    await ctl.ctx.close()
  } else {
    console.log('\n1. CONTROL — skipped. See the shelf-life note at the top of this file.')
  }

  // ── 2. THE TARGET: a hostile `next` must be ignored ───────────────────
  console.log('\n2. TARGET — next=/dashboard must be IGNORED.')
  const fix = await followRecovery(TARGET, '/dashboard')
  console.log('   chain: ' + (fix.chain.join('\n          ') || '(none captured)'))
  const landed = check('sends them to /reset-password despite next=/dashboard',
    fix.decided === '/reset-password', '/auth/confirm → ' + fix.decided)
  check('   … and it is where they come to rest', fix.path === '/reset-password', fix.path)
  const text2 = await fix.page.evaluate(() => document.body.innerText || '')
  check('it is not stuck on the verifying spinner', !/verifying your reset link/i.test(text2))
  check('it did not bounce to /login — the session cookie survived', !fix.path.includes('/login'), fix.path)
  check('no expired / already-used / invalid message', !/expired|already been used|needs a valid reset link/i.test(text2))
  const fields = await fix.page.locator('input[type="password"]').count()
  check('the password form is rendered', fields >= 2, fields + ' password field(s)')
  await fix.page.screenshot({ path: 'drive-shots/recovery-lands-on-reset.png' })

  // ── 3. CAN THE RECOVERY SESSION ACTUALLY SET A PASSWORD? ──────────────
  // The half that matters. An ordinary session is refused here with
  // current_password_required; a recovery session is not. This says which
  // one /auth/confirm hands over.
  console.log('\n3. SET A PASSWORD THROUGH THAT LANDING')
  let set = { rendered: false, text: '' }
  if (landed) set = await submitNewPassword(fix.page, TEMP)
  check('the form accepted the submit', set.rendered && !/current password|error|failed|could not/i.test(set.text),
    (set.text || '').split('\n').map(l => l.trim()).filter(Boolean)[0] || '(no text)')
  check('PUT /auth/v1/user returned 200', set.put === 200, 'status ' + set.put)
  check('no current_password_required refusal', !/current password/i.test(set.text || ''))
  await fix.page.screenshot({ path: 'drive-shots/recovery-after-submit.png' })
  await fix.ctx.close()

  // ── 4. DID IT LAND IN THE DATABASE? ───────────────────────────────────
  console.log('\n4. PROVE THE CHANGE IS REAL')
  const newPw = await passwordWorks(TEMP)
  const newWorks = check('the NEW password signs in', newPw.ok, newPw.message || '')

  // ── 5. PUT THE FIXTURE BACK ───────────────────────────────────────────
  console.log('\n5. RESTORE THE STANDING PASSWORD')
  if (newWorks) {
    const back = await followRecovery(TARGET, '/dashboard')
    check('restore: a second recovery link also lands on /reset-password',
      back.decided === '/reset-password', String(back.decided))
    const r = await submitNewPassword(back.page, STANDING)
    check('restore: PUT /auth/v1/user returned 200', r.put === 200, 'status ' + r.put
      + (r.put === 429 ? '  — rate limited; this drive is bursty by nature' : ''))
    await back.ctx.close()
  }

  // ASKED OF THE AUTH API, NOT OF THE LOGIN PAGE. This drive fires sign-ins
  // and password updates inside a couple of minutes, and Supabase rate limits
  // on exactly that. A throttled /login is indistinguishable from a wrong
  // password on screen — and reporting "THE FIXTURE IS BROKEN" when it is not
  // is the expensive direction of that mistake.
  const st = await passwordWorks(STANDING)
  const restored = check('THE STANDING PASSWORD WORKS AGAIN', st.ok, st.ok ? 'fixture restored' : st.message)
  // And the temp one must be dead, or the restore only appeared to happen.
  const tmp = await passwordWorks(TEMP)
  check('the temporary password no longer works', !tmp.ok, tmp.ok ? 'STILL ACCEPTED' : tmp.message)

  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  a recovery link lands on /reset-password and a password can be set there')
  console.log('  shots: drive-shots/recovery-lands-on-reset.png, recovery-after-submit.png')
  if (!restored) console.log('\n  *** THE TEST EMPLOYER PASSWORD IS NOT RESTORED. TEMP WAS: ' + TEMP)
  process.exitCode = bad ? 1 : 0
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  console.error('  If the fixture password was changed, the temporary value was: ' + TEMP)
  process.exitCode = 1
} finally {
  await browser.close()
}
