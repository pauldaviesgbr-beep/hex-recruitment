// A CANDIDATE WITH NO NAME — THE STATE THAT DID NOT EXIST UNTIL TODAY.
//
// Until this branch, full_name could not be empty: the OAuth callbacks
// invented one from the email local-part when the provider gave none. Sign in
// with Apple is what forces the issue — it returns name and email ONCE, and a
// private relay address turns that fallback into a random ten-character token
// written to the profile employers browse.
//
// SO THE WHOLE POINT IS TO DRIVE THE NULL. A run against a profile that
// already has a name exercises none of the new branch — the same shape as a
// recovery link that already pointed at the right page and therefore proved
// nothing about the fix.
//
// Two halves:
//   1. THE GATE, checked by IMPORTING the real flipBlocker and running it
//      against a real row. A restated gate only proves you restated it
//      consistently.
//   2. THE SCREEN, driven in a browser: /welcome must ask for the name, and
//      saving it must land in BOTH the profile row and the auth metadata.
//
// DISPOSABLE ACCOUNT ONLY. It mints one and destroys it, whatever happens.
//
//   node scripts/drive-null-name.mjs <baseUrl>

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { flipBlocker, hasSomethingToShow } from '../lib/discoverabilityNotice'

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
if (!BASE) { console.error('usage: node scripts/drive-null-name.mjs <baseUrl>'); process.exit(2) }
if (!env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(2) }

mkdirSync('drive-shots', { recursive: true })
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET

let bad = 0
const check = (l, ok, d) => { if (!ok) bad++; console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(l).padEnd(58) + (d ?? '')); return ok }

const stamp = Date.now()
const EMAIL = `thrive-nullname-${stamp}@example.com`
const PASSWORD = `Null-Name-${stamp}`
let userId = null

const browser = await chromium.launch()

try {
  console.log('\n1. MINT A CANDIDATE WITH NO NAME AT ALL')
  const { data: made, error: mkErr } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
    user_metadata: { role: 'employee' },          // deliberately no full_name
  })
  if (mkErr) throw new Error('createUser: ' + mkErr.message)
  userId = made.user.id
  check('auth user has no name in metadata', !made.user.user_metadata?.full_name,
    JSON.stringify(made.user.user_metadata))

  // The profile row the app would have created, with a null name and enough
  // else to be worth showing — so the ONLY thing standing between this person
  // and the board is the missing name.
  const { error: insErr } = await admin.from('candidate_profiles').insert({
    user_id: userId, email: EMAIL, full_name: null,
    job_title: 'Sous Chef', is_discoverable: false,
  })
  if (insErr) throw new Error('profile insert: ' + insErr.message)
  const { data: row } = await admin.from('candidate_profiles')
    .select('user_id, email, full_name, job_title, cv_url, is_discoverable, discoverability_notice')
    .eq('user_id', userId).maybeSingle()
  check('profile row exists with full_name NULL', row && row.full_name === null, String(row?.full_name))
  check('it has a job title, so only the NAME is missing', row?.job_title === 'Sous Chef')

  console.log('\n2. THE GATE — the REAL function, against the REAL row')
  check('hasSomethingToShow is FALSE with no name', hasSomethingToShow(row) === false)
  check('flipBlocker says nothing-to-show', flipBlocker(row) === 'nothing-to-show', String(flipBlocker(row)))

  // The control. Same row, name filled — it must stop being blocked for THAT
  // reason, or the check cannot tell the two states apart.
  const named = { ...row, full_name: 'Alex Sample' }
  check('CONTROL: with a name it is no longer nothing-to-show',
    flipBlocker(named) !== 'nothing-to-show', String(flipBlocker(named)))
  check('CONTROL: hasSomethingToShow is TRUE with a name', hasSomethingToShow(named) === true)

  console.log('\n3. THE SCREEN — /welcome must ask')
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {})

  await page.goto(`${BASE}/welcome`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  check('the name field is shown', await page.locator('#fullName').count() > 0)
  const text = await page.evaluate(() => document.body.innerText || '')
  check('it explains why it is asking', /not given a name when you signed in/i.test(text.replace(/\s+/g, ' ')))
  check('no invented name is on screen', !text.includes(EMAIL.split('@')[0]), 'the local-part must not appear')
  await page.screenshot({ path: 'drive-shots/welcome-null-name.png', fullPage: true })

  console.log('\n4. GIVE A NAME — it must land in BOTH places')
  await page.fill('#fullName', 'Alex Sample')
  await page.fill('#jobTitle', 'Sous Chef')
  await page.getByRole('button', { name: /^show me jobs$/i }).first().click()
  await page.waitForTimeout(8000)

  const { data: after } = await admin.from('candidate_profiles')
    .select('full_name').eq('user_id', userId).maybeSingle()
  check('the PROFILE row now has the name', after?.full_name === 'Alex Sample', String(after?.full_name))
  const { data: authAfter } = await admin.auth.admin.getUserById(userId)
  check('the AUTH metadata agrees', authAfter?.user?.user_metadata?.full_name === 'Alex Sample',
    String(authAfter?.user?.user_metadata?.full_name))
  await ctx.close()

  console.log('\n5. AND THE GATE NOW LETS THEM THROUGH ON THAT COUNT')
  const { data: finalRow } = await admin.from('candidate_profiles')
    .select('user_id, email, full_name, job_title, cv_url, is_discoverable, discoverability_notice')
    .eq('user_id', userId).maybeSingle()
  check('hasSomethingToShow is now TRUE', hasSomethingToShow(finalRow) === true)
  check('no longer blocked for nothing-to-show', flipBlocker(finalRow) !== 'nothing-to-show',
    String(finalRow && flipBlocker(finalRow)))

  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  a nameless candidate is asked, is blocked until they answer, and both stores agree')
  console.log('  shot: drive-shots/welcome-null-name.png')
  process.exitCode = bad ? 1 : 0
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  process.exitCode = 1
} finally {
  if (userId) {
    await admin.from('candidate_profiles').delete().eq('user_id', userId).then(() => {}, () => {})
    await admin.auth.admin.deleteUser(userId).catch(() => {})
    console.log('  cleanup: disposable candidate removed')
  }
  await browser.close()
}
