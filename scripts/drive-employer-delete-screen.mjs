// THE SCREEN HALF OF THE EMPLOYER GATE — HIDING A BUTTON IS NOT CLOSING A
// ROUTE, AND CLOSING A ROUTE IS NOT TELLING ANYBODY.
//
// prove-employer-delete-gate.ts is the route half: it POSTs as an attacker
// would and reads the rows back. It says nothing about what an employer SEES,
// and a 409 an employer never reaches is a dead end with no sign on it.
//
// So this drives /settings/privacy in a real browser, signed in as an
// employer, and asks three things of the RENDERED text:
//   · the delete panel is not there
//   · something explains why, naming contact@thrivecareer.co.uk
//   · that address is a mailto they can actually press
//
// AND THE CONTROL, WITHOUT WHICH THE ABOVE IS WORTHLESS. "No delete panel" is
// equally true of a page that failed to load, a session that expired, and a
// redirect to /login. So a CANDIDATE fixture loads the same URL in the same
// run and MUST see the panel. Same screen, two roles, opposite answers.
//
// DISPOSABLE FIXTURES ONLY, both @example.com, destroyed in a finally block.
// No advert is created — an advert could reach the live board.
//
//   node scripts/drive-employer-delete-screen.mjs <baseUrl>

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
const f = path.join(REPO, '.env.local')
if (!existsSync(f)) { console.error('SKIP  .env.local not found'); process.exit(2) }
for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

// NO DEFAULT, for the reason now written into CLAUDE.md: this script creates
// and deletes accounts, so it does not get to choose which deployment.
const BASE = process.argv[2]
if (!BASE) { console.error('usage: node scripts/drive-employer-delete-screen.mjs <baseUrl>'); process.exit(2) }
if (!env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(2) }

const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
mkdirSync('drive-shots', { recursive: true })
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(58) + (detail ?? ''))
  return ok
}

const stamp = Date.now()
const PW = `Screen-Drive-${stamp}`
const empEmail = `thrive-gate-emp-${stamp}@example.com`
const candEmail = `thrive-gate-cand-${stamp}@example.com`
let empId = null, candId = null

const browser = await chromium.launch()
const ctxOpts = {
  viewport: { width: 390, height: 844 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
}

/** Sign in through the real login page and land on /settings/privacy. */
async function openPrivacyAs(email) {
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.fill('#login-email', email)
  await page.fill('#login-password', PW)
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {})
  const signedIn = !page.url().includes('/login')
  await page.goto(`${BASE}/settings/privacy`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  const text = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ')
  return { ctx, page, text, signedIn, path: new URL(page.url()).pathname }
}

try {
  console.log('\nTWO DISPOSABLE FIXTURES — neither address can reach a person')
  const { data: emp, error: e1 } = await admin.auth.admin.createUser({
    email: empEmail, password: PW, email_confirm: true,
    user_metadata: { role: 'employer', full_name: 'Gate Screen Employer' },
  })
  if (e1) throw new Error('employer createUser: ' + e1.message)
  empId = emp.user.id
  const { error: e2 } = await admin.from('employer_profiles')
    .insert({ user_id: empId, company_name: `ZZ Screen Fixture ${stamp}` })
  if (e2) throw new Error('employer_profiles insert: ' + e2.message)
  check('an employer fixture exists, owning a profile row', true, empEmail)

  const { data: cand, error: e3 } = await admin.auth.admin.createUser({
    email: candEmail, password: PW, email_confirm: true,
    user_metadata: { role: 'employee', full_name: 'Gate Screen Candidate' },
  })
  if (e3) throw new Error('candidate createUser: ' + e3.message)
  candId = cand.user.id
  await admin.from('candidate_profiles').insert({
    user_id: candId, email: candEmail, full_name: 'Zz Gatescreen Fixture', is_discoverable: false,
  })
  check('a candidate fixture exists', true, candEmail)
  check('neither fixture can receive mail', empEmail.endsWith('@example.com') && candEmail.endsWith('@example.com'))

  console.log('\nTHE EMPLOYER SEES /settings/privacy')
  const e = await openPrivacyAs(empEmail)
  check('signed in and on the settings screen', e.signedIn && e.path === '/settings/privacy', e.path)
  check('there is NO "Delete my account" button',
    (await e.page.getByRole('button', { name: /delete my account/i }).count()) === 0)
  check('there is no confirmation box either',
    (await e.page.locator('#deleteConfirm').count()) === 0)
  // THE DISCRIMINATOR IS THE HEADING, NOT THE ADDRESS — AND THE FIRST
  // VERSION OF THIS CHECK GOT THAT WRONG. It asserted the candidate does not
  // see "contact@thrivecareer.co.uk" anywhere on the page, and went red on
  // production behaving correctly: the candidate's DOWNLOAD MY DATA line
  // names the same address, for everything the JSON export does not carry.
  // The address is on this screen for two unrelated reasons and only one of
  // them is the employer panel. "Closing your account" renders in the
  // employer branch and nowhere else.
  check('it EXPLAINS rather than simply omitting', /Closing your account/i.test(e.text))
  check('…and says why — the adverts and the applications under them',
    /adverts and the applications/i.test(e.text))
  const mailtos = await e.page.locator('a[href^="mailto:contact@thrivecareer.co.uk"]').count()
  check('the address is a mailto they can press', mailtos > 0, mailtos + ' link(s)')
  await e.page.screenshot({ path: 'drive-shots/gate-employer.png', fullPage: true })
  await e.ctx.close()

  console.log('\nTHE CONTROL — a candidate on the SAME screen must still see it')
  const c = await openPrivacyAs(candEmail)
  check('signed in and on the settings screen', c.signedIn && c.path === '/settings/privacy', c.path)
  check('the "Delete my account" button IS there',
    (await c.page.getByRole('button', { name: /delete my account/i }).count()) > 0)
  check('and the employer panel is NOT rendered for them', !/Closing your account/i.test(c.text))
  // …but the address itself SHOULD still be here, on the export line. Asserted
  // rather than merely tolerated, so nobody "fixes" the check above by
  // stripping contact@ off a screen where it is doing a different job.
  check('the export line still names contact@ (a different job)',
    /contact@thrivecareer\.co\.uk/.test(c.text))
  await c.page.screenshot({ path: 'drive-shots/gate-candidate.png', fullPage: true })
  await c.ctx.close()

  console.log('\n  SO THE SCREEN DISTINGUISHES THE TWO — same URL, opposite panels')
} catch (err) {
  console.error('\n  THREW: ' + (err?.message || err))
  bad++
} finally {
  await browser.close().catch(() => {})
  console.log('\nTEARDOWN — counted, not hoped')
  if (empId) {
    await admin.from('employer_profiles').delete().eq('user_id', empId).then(() => {}, () => {})
    await admin.auth.admin.deleteUser(empId).catch(() => {})
  }
  if (candId) {
    await admin.from('candidate_profiles').delete().eq('user_id', candId).then(() => {}, () => {})
    await admin.auth.admin.deleteUser(candId).catch(() => {})
  }
  const { count: leftProf } = await admin.from('employer_profiles')
    .select('id', { count: 'exact', head: true }).like('company_name', 'ZZ Screen Fixture%')
  check('no fixture employer_profiles rows remain', (leftProf ?? 0) === 0, String(leftProf))
  for (const [who, id] of [['employer', empId], ['candidate', candId]]) {
    if (!id) continue
    const still = (await admin.auth.admin.getUserById(id).catch(() => ({ data: null })))?.data?.user
    check(`the fixture ${who} account is gone`, !still)
  }
}

console.log('')
console.log(bad
  ? `  ${bad} FAILED — the screen does not match the route`
  : '  an employer is told why and given a route to a human; a candidate keeps the panel')
process.exit(bad ? 1 : 0)
