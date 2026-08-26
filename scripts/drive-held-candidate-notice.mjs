// WHAT A HELD CANDIDATE SEES ON THEIR OWN DASHBOARD.
//
// A hold hides a real person for up to seven days while a duplicate is
// decided. Until this branch nothing told them: the visibility switch simply
// showed OFF and said "Profile hidden", which is true and reads as something
// THEY did.
//
// THE STATE HAS TO BE MANUFACTURED, because no fixture is ever held — a hold
// needs two profiles sharing a name key at signup. So this stamps a hold on
// the TEST CANDIDATE, drives, and puts back exactly what it read. It never
// touches a real candidate.
//
// IT RESTORES FROM WHAT IT READ, NOT FROM A CONSTANT. The row's duplicate_hold
// and is_discoverable are captured before anything is written and written back
// verbatim in a finally block, so a crash mid-run still restores. Restoring to
// "null and true" from memory would be a guess about a fixture other drives
// assert against.
//
//   node scripts/drive-held-candidate-notice.mjs <baseUrl>

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
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

const BASE = process.argv[2]
if (!BASE) { console.error('usage: node scripts/drive-held-candidate-notice.mjs <baseUrl>'); process.exit(2) }

const CANDIDATE = 'pauldavies.gbr+candidate@gmail.com'
const PW = env.TEST_ACCOUNT_PASSWORD
if (!PW || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  credentials missing'); process.exit(2) }

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
mkdirSync('drive-shots', { recursive: true })

let bad = 0
const check = (l, ok, d) => { if (!ok) bad++; console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(l).padEnd(58) + (d ?? '')); return ok }

let original = null
let userId = null
const browser = await chromium.launch()
const pageErrors = []

try {
  console.log('\n1. THE FIXTURE, READ BEFORE ANYTHING IS WRITTEN')
  const { data: row, error } = await admin
    .from('candidate_profiles')
    .select('user_id, full_name, is_discoverable, duplicate_hold')
    .eq('email', CANDIDATE)
    .maybeSingle()
  if (error || !row) throw new Error('could not read the test candidate: ' + (error?.message || 'no row'))
  userId = row.user_id
  original = { is_discoverable: row.is_discoverable, duplicate_hold: row.duplicate_hold }
  check('the test candidate exists', !!userId, String(row.full_name))
  console.log('    captured for restore: is_discoverable=' + JSON.stringify(original.is_discoverable)
    + '  duplicate_hold=' + JSON.stringify(original.duplicate_hold))

  console.log('\n2. HOLD IT — the state no fixture is ever in')
  const heldAt = new Date().toISOString()
  const { error: hErr } = await admin.from('candidate_profiles').update({
    is_discoverable: false,
    duplicate_hold: {
      heldAt, releasedAt: null, reviewedAt: null, verdict: null,
      matchedUserId: '00000000-0000-0000-0000-000000000000',
      notCheckedAt: null, notCheckedReason: null,
    },
  }).eq('user_id', userId)
  if (hErr) throw new Error('could not hold: ' + hErr.message)
  check('the row is now held', true, 'releases ' + new Date(Date.parse(heldAt) + 7 * 86400000).toDateString())

  console.log('\n3. THE DASHBOARD, AS THE CANDIDATE SEES IT')
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },      // a phone, which is where this is read
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  const page = await ctx.newPage()
  page.on('pageerror', e => pageErrors.push(e.message))

  // A DRIVE WITH EMPTY STORAGE IS A DRIVE OF THE FIRST-EVER VISIT. Unseeded,
  // the cookie banner covers the bottom 150px of the phone — and the notice
  // this whole branch exists to show lands at y=749, underneath it. Nobody
  // who has been here before sees that page, so measuring it would describe a
  // layout almost no held candidate will ever meet.
  const seeded = await withSeededStorage(page, 'consentAccepted')
  console.log('    storage state: consentAccepted — ' + Object.keys(seeded).join(', '))

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.fill('#login-email', CANDIDATE)
  await page.fill('#login-password', PW)
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {})
  check('signed in as the test candidate', !page.url().includes('/login'), page.url())

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)

  const text = await page.evaluate(() => document.body.innerText || '')

  // THE SEED IS AN INSTRUMENT AND IT HAS ALREADY LIED ONCE. consentAccepted
  // wrote localStorage while lib/cookies.ts reads a COOKIE holding JSON, so
  // asking for a returning visitor produced a phone with 150px of cookie
  // banner across the bottom — over the very notice this drive photographs.
  // It reported the key it set, so it looked like it had worked. Assert the
  // STATE, never the fact that a helper was called.
  check('the cookie banner really is gone', !/We use cookies/i.test(text),
    /We use cookies/i.test(text) ? 'STILL THERE — the seed did not take' : 'seeded state confirmed')
  check('the dashboard rendered', text.length > 400, text.length + ' chars')

  // THE SENTENCE
  check('the candidate is TOLD they are being checked', /checking your profile/i.test(text),
    (text.match(/We[^\n]{0,120}checking[^\n]{0,120}/i) || ['NOT FOUND'])[0].trim().slice(0, 100))
  check('…and it names a date', /by \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)/.test(text),
    (text.match(/by \d{1,2} \w+/) || ['NOT FOUND'])[0])
  check('…and asks nothing of them', /Nothing for you to do/i.test(text))

  // THE SWITCH — the half that used to blame them
  check('the switch no longer says "Profile hidden"', !/Profile hidden/.test(text))
  check('…it says Being checked', /Being checked/.test(text))

  const toggle = await page.evaluate(() => {
    const i = document.querySelector('input[type="checkbox"]')
    if (!i) return null
    const label = i.closest('label')
    return { disabled: i.disabled, checked: i.checked, cursor: label ? getComputedStyle(label).cursor : null }
  })
  check('a switch was found at all', !!toggle, JSON.stringify(toggle))
  check('the switch is DISABLED while held', toggle?.disabled === true,
    'else they can flip themselves visible and contradict the admin page')
  check('…and looks it', toggle?.cursor === 'not-allowed', String(toggle?.cursor))

  // The note must be ON SCREEN, not merely in the DOM — a tooltip does not
  // exist on a phone, which is the whole reason the sentence is rendered.
  const noteBox = await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll('p')).find(el => /checking your profile/i.test(el.textContent || ''))
    if (!p) return null
    const r = p.getBoundingClientRect()
    return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) }
  })
  check('the sentence is laid out, not just present', !!noteBox && noteBox.w > 80, JSON.stringify(noteBox))
  check('…and does not run off the phone', !!noteBox && noteBox.right <= 390 && noteBox.left >= 0,
    noteBox ? `left=${noteBox.left} right=${noteBox.right} viewport=390` : 'no box')

  check('nothing threw', pageErrors.length === 0, pageErrors.join(' | ') || 'clean')
  await page.screenshot({ path: 'drive-shots/held-candidate-dashboard.png', fullPage: false })

  console.log('\n4. AND THE UNHELD STATE IS UNCHANGED')
  // The control. If the notice rendered whatever the hold said, every
  // assertion above would pass on a fixture that was never held — which is
  // the state this account is normally in.
  await admin.from('candidate_profiles').update({
    is_discoverable: true,
    duplicate_hold: null,
  }).eq('user_id', userId)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  const after = await page.evaluate(() => document.body.innerText || '')
  check('the sentence is GONE when not held', !/checking your profile/i.test(after))
  check('…and the switch works again', await page.evaluate(() => {
    const i = document.querySelector('input[type="checkbox"]')
    return !!i && !i.disabled
  }))
  await page.screenshot({ path: 'drive-shots/unheld-candidate-dashboard.png', fullPage: false })

  await ctx.close()
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  bad++
} finally {
  if (userId && original) {
    const { error } = await admin.from('candidate_profiles')
      .update({ is_discoverable: original.is_discoverable, duplicate_hold: original.duplicate_hold })
      .eq('user_id', userId)
    const { data: back } = await admin.from('candidate_profiles')
      .select('is_discoverable, duplicate_hold').eq('user_id', userId).maybeSingle()
    const restored = !error
      && back?.is_discoverable === original.is_discoverable
      && JSON.stringify(back?.duplicate_hold ?? null) === JSON.stringify(original.duplicate_hold ?? null)
    if (!restored) bad++
    console.log('\n5. RESTORE')
    console.log('  ' + (restored ? 'ok   ' : 'FAIL ') + 'the fixture is exactly as it was'.padEnd(58)
      + JSON.stringify(back))
  }
  await browser.close()
  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  a held candidate is told why, and cannot be blamed for it')
  console.log('  shots: drive-shots/held-candidate-dashboard.png, unheld-candidate-dashboard.png')
  process.exit(bad ? 1 : 0)
}
