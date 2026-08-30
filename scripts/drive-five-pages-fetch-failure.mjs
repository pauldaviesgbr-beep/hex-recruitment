// FORCE THE BOARD FETCH TO FAIL, ON THE FIVE PAGES THAT STATED SOMETHING
// FALSE ABOUT IT, AND READ WHAT EACH ONE SAYS.
//
// All five resolve their content out of the shared jobs array in
// lib/JobsContext. None of them fetches its own. So one failed request to
// PostgREST empties all five, and before this branch each of them turned that
// into a confident claim: an advert removed, a town empty, a sector empty, a
// candidate's own saved list empty, our matching finding nothing for them.
//
// ONLY /rest/v1/jobs IS ABORTED. /rest/v1/saved_jobs is deliberately left
// alone — on /saved-jobs the saves themselves still load, which is the point:
// the rows are intact and only the lookup of what they refer to failed.
//
// THE CHECK ASKS A QUESTION WITH TWO DIFFERENT ANSWERS. Each page names the
// sentence it used to print and the one it should print now; the run asserts
// the new one is present AND the old one is gone. A check that only looked for
// the new string would pass on a page showing both.
//
// WAITS ON A SETTLED STATE, NOT A CLOCK. supabase-js retries at roughly 1.1s,
// 2.1s, 4.1s and 8.1s, so anything read before ~9s is a page still in flight.
// The predicate is "one of the two final sentences is on screen", which is
// false throughout the retries and cannot be satisfied by an empty page.

import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2]
const TAG = process.argv[3]
if (!BASE || !TAG) {
  console.error('usage: node scripts/drive-five-pages-fetch-failure.mjs <base-url> <before|after>')
  process.exit(2)
}

const env = {}
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const PASSWORD = env.TEST_ACCOUNT_PASSWORD
if (!PASSWORD) { console.error('SKIP  TEST_ACCOUNT_PASSWORD missing from .env.local'); process.exit(2) }
const EMAIL = 'pauldavies.gbr+candidate@gmail.com'
const SHOTS = 'drive-shots'
mkdirSync(SHOTS, { recursive: true })

const LIVE_JOB = '60a5092f-12b0-473b-b60b-060b243e52cc'

const PAGES = [
  { key: 'job',         url: '/job/' + LIVE_JOB,             auth: false,
    was: 'Job Not Found',                       now: 'load this role' },
  { key: 'city',        url: '/jobs/london',                 auth: false,
    was: 'No jobs in London right now',         now: 'load the roles' },
  { key: 'sector',      url: '/jobs/sector/hospitality-tourism', auth: false,
    was: 'jobs right now',                      now: 'load the roles' },
  { key: 'saved',       url: '/saved-jobs',                  auth: true,
    was: 'No saved jobs yet',                   now: 'load your saved jobs' },
  { key: 'recommended', url: '/jobs/recommended',            auth: true,
    was: 'No recommendations yet',              now: 'load your recommendations' },
]

const JOBS_REQUEST = '**/rest/v1/jobs**'
const rows = []
const fails = []
const note = t => rows.push('  ' + t)

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()

  // ── sign in once, before any aborting ────────────────────────────────────
  // Hydration first: the form carries method="post", so a click that lands
  // before React attaches does a native post and reloads still signed out,
  // which is indistinguishable from a rejected password.
  await page.goto(BASE + '/login/employee', { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASSWORD)
  await page.locator('form button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.locator('form button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 45000 })
  await page.locator('button', { hasText: /^Accept All$/ }).first().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  const signedIn = !page.url().includes('/login')
  rows.push('signed in as the candidate fixture: ' + (signedIn ? 'YES' : 'NO') + '  (landed ' + page.url().replace(BASE, '') + ')')
  if (!signedIn) fails.push('not signed in — the two gated pages would be measured as the login page')

  let aborted = 0
  await page.route(JOBS_REQUEST, route => { aborted++; return route.abort('failed') })

  for (const p of PAGES) {
    rows.push('')
    rows.push('=== ' + p.key + '   ' + p.url + ' ===')
    const before = aborted
    const t0 = Date.now()
    await page.goto(BASE + p.url, { waitUntil: 'domcontentloaded' })

    await page.waitForFunction(
      ({ was, now }) => {
        const t = document.body ? document.body.innerText || '' : ''
        return t.includes(was) || t.includes(now)
      },
      { was: p.was, now: p.now },
      { timeout: 45000 },
    ).catch(() => {})
    const settled = Date.now() - t0

    const landed = page.url().replace(BASE, '')
    const text = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
    const sawWas = text.includes(p.was)
    const sawNow = text.includes(p.now)
    const sawTry = text.includes('Try again')

    note('landed on:        ' + landed)
    note('jobs aborted:     ' + (aborted - before) + (aborted - before === 0 ? '   <-- NOTHING WAS BLOCKED' : ''))
    note('settled after:    ' + (settled / 1000).toFixed(1) + 's')
    note('the OLD sentence  "' + p.was + '"   ' + (sawWas ? 'FOUND' : 'not found'))
    note('the NEW sentence  "' + p.now + '"   ' + (sawNow ? 'FOUND' : 'not found'))
    note('"Try again"       ' + (sawTry ? 'FOUND' : 'not found'))

    if (aborted - before === 0) fails.push(p.key + ': no jobs request intercepted — nothing below is about a failure')
    if (p.auth && landed.includes('/login')) fails.push(p.key + ': redirected to login — measured the wrong page')

    if (TAG === 'after') {
      if (!sawNow) fails.push(p.key + ': the failure sentence was NOT rendered')
      if (sawWas) fails.push(p.key + ': STILL SAYS "' + p.was + '" on a failed fetch')
      if (!sawTry) fails.push(p.key + ': no Try again control')
    }

    await page.screenshot({ path: SHOTS + '/' + TAG + '-390-' + p.key + '-failed.png' })
  }
} finally {
  await browser.close()
}

console.log(rows.join('\n'))
console.log('\n' + '-'.repeat(64))
if (fails.length) {
  console.log(TAG.toUpperCase() + ': ' + fails.length + ' problem(s)')
  fails.forEach(f => console.log('  ' + f))
} else if (TAG === 'after') {
  console.log('AFTER: all five say the request failed, and none of them still states the false thing')
} else {
  // The before run asserts nothing. It must not print a pass underneath
  // evidence of the fault it exists to record.
  console.log('BEFORE: recorded, not asserted — this is what the five pages said before the change')
}
process.exit(0)
