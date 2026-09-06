// "REPORTED" MUST SURVIVE A REMOUNT — SUBMIT ON ONE MOUNT, READ ON ANOTHER.
//
//   node scripts/drive-reported-survives-remount.mjs <deployment-url>
//
// THE URL IS REQUIRED. A script that writes must refuse to guess where —
// the employer-delete proof defaulted to production once and really deleted
// an account. Exit 2 without one.
//
// ── WHY THE REMOUNT IS THE WHOLE POINT ───────────────────────────────────
//
// "Reported" never survived a remount, on any surface, from the day the
// control was built — and every proof passed, because every proof read the
// label on the SAME MOUNT that wrote it. A person re-opening an advert they
// had just reported saw "Report this job" (3 Sept 2026, on camera, in front
// of the recording meant for Apple). A PROOF THAT ONLY READS ON THE MOUNT
// THAT WROTE IS TESTING MEMORY, NOT PERSISTENCE.
//
// So this drive: signs in as the candidate fixture, reports an advert, sees
// the thanks screen — then NAVIGATES AWAY AND BACK, a genuine fresh mount,
// and asserts the label reads "Reported" with no tap on this mount at all.
// Both surfaces: the standalone /job/[id] page AND the inline pane on
// /jobs?id=…, because the two-renderers fault is real on this project.
//
// Run against a deployment WITHOUT the read-back, the remount assertion
// FAILS — production before the merge is that deployment, and the pass/fail
// pair across two real deployments is the control.
//
// CLEANS UP: every report row it creates is removed by id afterwards, and
// the table's final count is printed so nothing is left for an admin to
// find. Rows belonging to anyone else are never touched.

import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { withSeededStorage } from './lib/seed-storage.mjs'

const BASE = process.argv[2]
if (!BASE || !/^https:\/\//.test(BASE)) {
  console.log('SKIP  pass the deployment URL to drive, e.g.')
  console.log('      node scripts/drive-reported-survives-remount.mjs https://<deployment>')
  console.log('      This script WRITES report rows and refuses to guess where.')
  process.exit(2)
}

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EMAIL = 'pauldavies.gbr+candidate@gmail.com'
const PASS = process.env.TEST_ACCOUNT_PASSWORD
if (!PASS) { console.log('SKIP  no TEST_ACCOUNT_PASSWORD in the environment'); process.exit(2) }
const DETAIL = `remount probe — delete me #${Date.now()}`

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(62) + (detail ?? ''))
}

// The candidate fixture's uid, read rather than assumed.
const { data: cand } = await admin.from('candidate_profiles').select('user_id').eq('email', EMAIL).single()
const CAND = cand.user_id

// Two DISTINCT live adverts, and any stale fixture report rows against them
// cleared first so `done` genuinely starts false on both.
const { data: adverts } = await admin.from('jobs').select('id').eq('status', 'active').limit(2)
if ((adverts?.length ?? 0) < 2) { console.log('SKIP  fewer than two active adverts to drive against'); process.exit(2) }
const [JOB_A, JOB_B] = adverts.map(j => j.id)
await admin.from('content_reports').delete().eq('reporter_id', CAND).in('target_id', [JOB_A, JOB_B])

const browser = await chromium.launch()
const ctx = await browser.newContext({
  ...devices['iPhone 14 Pro'],
  // The bypass secret rides a HEADER, never a URL. Harmless on production,
  // required on a preview.
  extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
    : {},
})
const page = await ctx.newPage()
// A RETURNING VISITOR, not the first-ever visit. Unseeded, the cookie
// banner paints straight over the sheet's Send button on the /jobs pane
// at 393px — seen in a screenshot, and Playwright then refuses the click.
// The exact fault seed-storage.mjs exists to prevent.
await withSeededStorage(page, 'consentAccepted')

const waitForControl = () =>
  page.waitForFunction(() => !!document.querySelector('[data-report-control="job"]'), null, { timeout: 30000 })
const label = async () => (await page.locator('[data-report-control="job"]').first().textContent())?.trim()

// WHAT THE BUTTON LOOKS LIKE, FROM THE BROWSER RATHER THAN THE STYLESHEET.
// Friday's version of this drive asserted the TEXT and passed — on /messages
// the same component renders icon-only, so the only thing that changed was an
// aria-label and the control looked identical to the person filming it. A
// declared rule is a request; getComputedStyle is what was painted.
const appearance = () => page.evaluate(() => {
  const b = document.querySelector('[data-report-control="job"]')
  if (!b) return null
  const s = getComputedStyle(b)
  return {
    bg: s.backgroundColor,
    fg: s.color,
    reported: b.getAttribute('data-reported'),
    pressed: b.getAttribute('aria-pressed'),
  }
})

async function reportHere() {
  const btn = page.locator('[data-report-control="job"]').first()
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
  await page.waitForSelector('#reportControlTitle', { timeout: 10000 })
  await page.locator('input[name="reportReason"]').first().check()
  await page.fill('#reportDetail', DETAIL)
  await page.click('button:has-text("Send report")')
  return page.waitForFunction(() => {
    const t = document.querySelector('#reportControlTitle')
    const err = document.querySelector('[role="alert"]')
    if (err) return 'ERROR: ' + err.textContent
    if (!t) return 'SHEET GONE'
    if (t.textContent.includes('Thanks')) return 'THANKS'
    return false
  }, null, { timeout: 20000 }).then(h => h.jsonValue()).catch(() => 'TIMEOUT')
}

try {
  // ── SIGN IN through the real form ─────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 30000 })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASS)
  if (!(await page.inputValue('#login-email')).includes('candidate')) await page.fill('#login-email', EMAIL)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForFunction(() => !location.pathname.includes('/login'), null, { timeout: 30000 })
  console.log(`signed in against ${BASE}`)
  console.log('')

  // ── SURFACE 1: the standalone /job/[id] page ──────────────────────────
  console.log('surface 1 — /job/[id]')
  await page.goto(`${BASE}/job/${JOB_A}`, { waitUntil: 'domcontentloaded' })
  await waitForControl()
  check('starts unreported', (await label()) === 'Report this job', await label())
  // THE UNREPORTED APPEARANCE, READ BEFORE ANYTHING IS FILED. Both states have
  // to come off the same page or "the reported one looks different" is not a
  // comparison, it is a description of one button.
  const plainLook = await appearance()
  const out1 = await reportHere()
  check('the thanks screen appears', out1 === 'THANKS', out1)
  check('same mount reads Reported', (await label()) === 'Reported', await label())
  // THE REMOUNT — away, then back. A fresh tree, no tap on this mount.
  await page.goto(`${BASE}/saved-jobs`, { waitUntil: 'domcontentloaded' })
  await page.goto(`${BASE}/job/${JOB_A}`, { waitUntil: 'domcontentloaded' })
  await waitForControl()
  // The read-back is an async query; wait on the predicate, never the clock —
  // but bounded, so a deployment WITHOUT the read-back fails here rather
  // than hanging.
  const survived1 = await page.waitForFunction(() => {
    const b = document.querySelector('[data-report-control="job"]')
    return b && b.textContent.trim() === 'Reported'
  }, null, { timeout: 15000 }).then(() => true).catch(() => false)
  check('REMOUNT reads Reported — persistence, not memory', survived1, await label())

  // ── THE PART FRIDAY'S PROOF COULD NOT SEE ────────────────────────────────
  // The label survived and the control still LOOKED unreported, because in
  // icon-only mode nothing but the accessible name changed. These assert the
  // state is on the button and visible in what was painted.
  const doneLook = await appearance()
  check('the remounted button carries data-reported=yes', doneLook?.reported === 'yes',
    String(doneLook?.reported))
  check('…and aria-pressed, so it is not colour alone', doneLook?.pressed === 'true',
    String(doneLook?.pressed))
  check('the PAINTED background differs from the unreported one',
    !!doneLook && !!plainLook && doneLook.bg !== plainLook.bg,
    `${plainLook?.bg} -> ${doneLook?.bg}`)
  check('…and so does the foreground',
    !!doneLook && !!plainLook && doneLook.fg !== plainLook.fg,
    `${plainLook?.fg} -> ${doneLook?.fg}`)

  // A SECOND TAP MUST SAY IT IS A RECALL, NOT AN ACKNOWLEDGEMENT. This is the
  // exact thing that read as two successful filings on camera on 6 Sept 2026
  // while content_reports held ONE row: the refusal was right and the sheet
  // said "Thanks — we have it" both times.
  await page.locator('[data-report-control="job"]').first().click()
  await page.waitForSelector('#reportControlTitle', { timeout: 10000 })
  const reopened = (await page.locator('#reportControlTitle').textContent())?.trim()
  check('re-opening says it is ALREADY reported', reopened === 'You have already reported this', reopened)
  check('…and does NOT thank them for something they did not just do',
    reopened !== 'Thanks — we have it', reopened)
  await page.click('button:has-text("Close")')

  console.log('')

  // ── SURFACE 2: the inline pane on /jobs?id=… ──────────────────────────
  console.log('surface 2 — the pane on /jobs?id=…')
  await page.goto(`${BASE}/jobs?id=${JOB_B}`, { waitUntil: 'domcontentloaded' })
  await waitForControl()
  check('starts unreported', (await label()) === 'Report this job', await label())
  const out2 = await reportHere()
  check('the thanks screen appears', out2 === 'THANKS', out2)
  check('same mount reads Reported', (await label()) === 'Reported', await label())
  await page.goto(`${BASE}/saved-jobs`, { waitUntil: 'domcontentloaded' })
  await page.goto(`${BASE}/jobs?id=${JOB_B}`, { waitUntil: 'domcontentloaded' })
  await waitForControl()
  const survived2 = await page.waitForFunction(() => {
    const b = document.querySelector('[data-report-control="job"]')
    return b && b.textContent.trim() === 'Reported'
  }, null, { timeout: 15000 }).then(() => true).catch(() => false)
  check('REMOUNT reads Reported — persistence, not memory', survived2, await label())
} catch (e) {
  check('the drive ran to completion', false, e.message?.slice(0, 120))
} finally {
  await browser.close()
  // ── TEARDOWN, by this run's own marker, then by the fixture pair ──────
  const { data: rows } = await admin.from('content_reports').select('id').eq('detail', DETAIL)
  for (const r of rows ?? []) await admin.from('content_reports').delete().eq('id', r.id)
  const { count: mine } = await admin.from('content_reports')
    .select('*', { count: 'exact', head: true }).eq('reporter_id', CAND).in('target_id', [JOB_A, JOB_B])
  check('teardown: this run\'s report rows are gone', (mine || 0) === 0, `${mine} left`)
  const { count: total } = await admin.from('content_reports').select('*', { count: 'exact', head: true })
  console.log(`  content_reports total now: ${total}`)
}

console.log('')
console.log(bad ? `${bad} FAILED` : 'Reported survives a remount on both surfaces — read back, not remembered')
process.exit(bad ? 1 : 0)
