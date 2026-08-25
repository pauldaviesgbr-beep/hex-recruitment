// CAN A SIGNED-IN USER SET A PASSWORD AT /reset-password WITH NO TOKEN?
//
// THIS FLOW HAS NEVER BEEN DRIVEN END TO END BY ANYONE, and a real employer has
// now failed it twice. Every unexercised path on this project has turned out
// broken — the delete button, the privacy@ address, the feed expiry date — so
// this walks it as a person would rather than reading the code and hoping.
//
// ON THE TEST EMPLOYER ONLY. Never Adrian, never a real account.
//
// IT CHANGES THE PASSWORD AND PUTS IT BACK. The restore is not a courtesy: that
// account is a fixture several other drives sign in with, so leaving it on a
// temporary password would break them tomorrow. The final step proves the
// standing password works again — a restore that is not verified is a hope.
//
//   node scripts/drive-reset-password.mjs [baseUrl]

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const STANDING = process.env.TEST_EMPLOYER_PASSWORD || process.env.TEST_ACCOUNT_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
if (!STANDING) { console.error('SKIP  TEST_EMPLOYER_PASSWORD not set'); process.exit(2) }
mkdirSync('drive-shots', { recursive: true })

const TEMP = 'Thrive-reset-drive-' + Date.now()
let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(50) + (detail ?? ''))
}

const browser = await chromium.launch()
const ctxOpts = {
  viewport: { width: 1280, height: 900 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
}

async function signIn(page, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', password)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  try {
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
    return true
  } catch { return false }
}

/** Set a password on /reset-password using whatever session the context holds. */
async function setPassword(page, next) {
  await page.goto(`${BASE}/reset-password`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  // BY ID, NOT BY POSITION. And the submit is found BY ITS NAME, because this
  // page carries SIXTEEN type="submit" buttons — the header, the chat widget,
  // the feedback control and the cookie banner all use one. .first() clicks a
  // header button and the form is never submitted, which reads as "the page
  // silently does nothing" and would have been reported as a product fault.
  // Same family as the chat widget winning .last() on an earlier drive.
  if (!(await page.locator('#password').count())) return { rendered: false }
  await page.fill('#password', next)
  await page.fill('#confirmPassword', next)
  const submit = page.getByRole('button', { name: /^reset password$/i }).first()
  await submit.click()
  await page.waitForTimeout(7000)
  return { rendered: true, text: await page.evaluate(() => document.body.innerText || '') }
}

try {
  // ── 1. AN ORDINARY SESSION, NO TOKEN ──────────────────────────────────
  console.log('\n1. SIGN IN NORMALLY, THEN GO STRAIGHT TO /reset-password (no token)')
  const ctx1 = await browser.newContext(ctxOpts)
  const p1 = await ctx1.newPage()
  check('signed in with the standing password', await signIn(p1, STANDING))

  await p1.goto(`${BASE}/reset-password`, { waitUntil: 'domcontentloaded' })
  await p1.waitForTimeout(6000)
  const url1 = p1.url()
  const text1 = await p1.evaluate(() => document.body.innerText || '')
  const fields = await p1.locator('input[type="password"]').count()

  check('it does NOT bounce to /login', !url1.includes('/login'), url1.replace(BASE, ''))
  check('the form renders with an ordinary session', fields > 0, fields + ' password field(s)')
  check('it is not stuck on a spinner', !/verifying your reset link/i.test(text1))
  await p1.screenshot({ path: 'drive-shots/reset-with-session.png' })

  // ── 2. DOES A SUBMIT ACTUALLY WORK ────────────────────────────────────
  console.log('\n2. SET A TEMPORARY PASSWORD')
  const set = await setPassword(p1, TEMP)
  check('the submit was accepted', set.rendered && !/error|failed|could not/i.test(set.text || ''),
    (set.text || '').split('\n').find(l => l.trim()) || '')
  await ctx1.close()

  // ── 3. DOES THE NEW PASSWORD ACTUALLY SIGN IN ─────────────────────────
  console.log('\n3. PROVE THE CHANGE LANDED — a clean context, new password')
  const ctx2 = await browser.newContext(ctxOpts)
  const p2 = await ctx2.newPage()
  const newWorks = await signIn(p2, TEMP)
  check('the NEW password signs in', newWorks)

  // ── 4. PUT IT BACK, AND PROVE IT ──────────────────────────────────────
  console.log('\n4. RESTORE THE STANDING PASSWORD')
  let restored = false
  if (newWorks) {
    const back = await setPassword(p2, STANDING)
    check('restore submitted', back.rendered)
  }
  await ctx2.close()

  const ctx3 = await browser.newContext(ctxOpts)
  const p3 = await ctx3.newPage()
  restored = await signIn(p3, STANDING)
  check('THE STANDING PASSWORD WORKS AGAIN', restored,
    restored ? 'fixture restored' : 'FIXTURE LEFT BROKEN — fix before anything else')
  await ctx3.close()

  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  the flow works with an ordinary session, and the fixture is back')
  console.log('\nSHOT  drive-shots/reset-with-session.png')
  if (!restored) console.log('\n  *** THE TEST EMPLOYER PASSWORD IS NOT RESTORED. TEMP WAS: ' + TEMP)
  process.exitCode = bad ? 1 : 0
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  console.error('  If the fixture password was changed, the temporary value was: ' + TEMP)
  process.exitCode = 1
} finally {
  await browser.close()
}
