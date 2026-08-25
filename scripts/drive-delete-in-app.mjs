// CAN A PERSON DELETE THEIR OWN ACCOUNT, IN THE APP, AND IS IT ACTUALLY GONE?
//
// This is the Apple 5.1.1(v) check: deletion must be INITIATED AND COMPLETED
// inside the app. Until today this screen posted to a route that wrote a row
// and emailed a human — "contact support" wearing a button, and the documented
// rejection.
//
// ON A DISPOSABLE ACCOUNT IT CREATES ITSELF. Never a real candidate, never a
// standing fixture. It mints one, drives the screen as a person would, and
// then asks the ADMIN API whether the auth user still exists — because the
// only honest answer to "was it deleted" comes from the database, not from a
// success message. The screen saying it worked is exactly what the old broken
// version did.
//
//   node scripts/drive-delete-in-app.mjs <baseUrl>

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv() {
  const out = {}
  const f = path.join(REPO, '.env.local')
  if (!existsSync(f)) { console.error('SKIP  .env.local not found'); process.exit(2) }
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = loadEnv()
const BASE = process.argv[2]
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
if (!BASE) { console.error('usage: node scripts/drive-delete-in-app.mjs <baseUrl>'); process.exit(2) }
if (!env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(2) }

mkdirSync('drive-shots', { recursive: true })
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(58) + (detail ?? ''))
  return ok
}

const stamp = Date.now()
const EMAIL = `thrive-delete-drive-${stamp}@example.com`
const PASSWORD = `Delete-Drive-${stamp}`
let userId = null

const browser = await chromium.launch()
const ctxOpts = {
  viewport: { width: 390, height: 844 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
}

/** Is this auth user still there? Asked of the admin API, never of the screen. */
async function stillExists(id) {
  const { data, error } = await admin.auth.admin.getUserById(id)
  if (error) return false
  return Boolean(data?.user?.id)
}

try {
  console.log('\n1. MINT A DISPOSABLE CANDIDATE')
  const { data: made, error: mkErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: 'employee', full_name: 'Delete Drive' },
  })
  if (mkErr) throw new Error('createUser: ' + mkErr.message)
  userId = made.user.id
  check('disposable account created', Boolean(userId), userId)
  check('it is NOT a real address', EMAIL.endsWith('@example.com'), EMAIL)
  check('the admin API can see it', await stillExists(userId))

  console.log('\n2. SIGN IN AND REACH THE SCREEN')
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {})
  check('signed in', !page.url().includes('/login'), new URL(page.url()).pathname)

  await page.goto(`${BASE}/settings/privacy`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  const text = await page.evaluate(() => document.body.innerText || '')

  // The copy must promise what the erasure plan actually does. "Everything is
  // deleted" would contradict privacy policy section 7 on the same site.
  check('the screen says deletion is immediate', /straight away/i.test(text))
  check('it does NOT promise a reply in 30 days', !/reply within 30 days/i.test(text))
  check('it names what is kept — applications', /applications you sent stay/i.test(text.replace(/\s+/g, ' ')))
  check('it names what is kept — signed offer', /signed job offer is kept/i.test(text.replace(/\s+/g, ' ')))
  await page.screenshot({ path: 'drive-shots/delete-before.png' })

  console.log('\n3. THE CONFIRMATION MUST ACTUALLY GATE IT')
  const del = page.getByRole('button', { name: /^delete my account$/i }).first()
  check('the button reads "Delete my account"', await del.count() > 0)
  await del.click()
  await page.waitForTimeout(1200)
  check('the confirm box appears', await page.locator('#deleteConfirm').count() > 0)

  const confirmBtn = page.getByRole('button', { name: /^delete my account$/i }).last()
  await page.fill('#deleteConfirm', 'delete please')
  await page.waitForTimeout(400)
  check('WRONG word leaves the button disabled', await confirmBtn.isDisabled(), 'typed "delete please"')
  check('and the account is still there', await stillExists(userId))

  console.log('\n4. TYPE IT PROPERLY AND GO')
  await page.fill('#deleteConfirm', 'DELETE')
  await page.waitForTimeout(400)
  check('the right word enables it', !(await confirmBtn.isDisabled()))
  await page.screenshot({ path: 'drive-shots/delete-confirm.png' })
  await confirmBtn.click()
  await page.waitForTimeout(12000)

  const landed = new URL(page.url()).pathname + new URL(page.url()).search
  check('it left the settings screen', !landed.startsWith('/settings/privacy'), landed)
  await page.screenshot({ path: 'drive-shots/delete-after.png' })
  await ctx.close()

  console.log('\n5. IS IT ACTUALLY GONE? ASK THE DATABASE.')
  const gone = !(await stillExists(userId))
  check('THE AUTH USER NO LONGER EXISTS', gone, gone ? 'deleted' : 'STILL PRESENT — ' + userId)

  // The old password must not sign in either. A deleted auth row and a
  // still-working credential would mean something survived.
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: siErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  check('the credentials no longer sign in', Boolean(siErr), siErr ? siErr.message : 'STILL ACCEPTED')

  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  a person can delete their own account in the app, and it is really gone')
  console.log('  shots: drive-shots/delete-before.png, delete-confirm.png, delete-after.png')
  process.exitCode = bad ? 1 : 0
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  process.exitCode = 1
} finally {
  // NEVER LEAVE THE FIXTURE BEHIND. If the drive died before the deletion, the
  // disposable account is still out there — remove it here rather than leaving
  // a stray candidate row for somebody to find next week.
  if (userId) {
    const left = await admin.auth.admin.getUserById(userId).then(r => Boolean(r.data?.user), () => false)
    if (left) {
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      console.log('  cleanup: disposable account removed by the script, not by the product')
    }
  }
  await browser.close()
}
