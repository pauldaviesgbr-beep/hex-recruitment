// WHAT AN EMPLOYER CAN ACTUALLY SEE AND CLICK ON /my-jobs.
//
// Fraser posted an advert and could not edit it. Reading the JSX said the edit
// control exists; only driving the page showed why he never reached it — the
// advert itself was not on any tab.
//
// THE CENTRAL ASSERTION IS BADGE == CARDS. The whole fault was that the number
// on the tab and the rows underneath it came from different populations, and
// that is invisible unless the two are compared on the same run. Eyeballing a
// screenshot would not have caught it either: an empty area under a "4" looks
// like a page still loading.
//
// STRICTLY READ-ONLY. It reads tabs and opens the kebab. It clicks NOTHING
// that writes — no Remove, no Reactivate, no Repost, no Edit submit. The
// fixture's four adverts are rows other drives assert against.
//
// SCREENSHOTS EVERY STATE, PASS OR FAIL. An earlier version screenshotted only
// on success, so its first failure produced a timeout string and no picture,
// and I spent a run guessing at what the page was doing.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const PASSWORD = process.env.TEST_EMPLOYER_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const SHOTS = 'drive-shots'

if (!PASSWORD) { console.error('SKIP  TEST_EMPLOYER_PASSWORD not in the environment'); process.exit(2) }
if (BASE.includes('.vercel.app') && !BYPASS) { console.error('SKIP  preview target needs the bypass secret'); process.exit(2) }

mkdirSync(SHOTS, { recursive: true })

const TABS = ['all', 'active', 'interviewing', 'offers', 'hired', 'archived']
const results = []
const check = (name, got, ok) => results.push({ name, got, ok })

const browser = await chromium.launch()

async function run(width, height, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } }
      : {}),
  })
  const page = await ctx.newPage()

  // ── sign in ───────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login/employer`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  // NOT /employer/ — that matches "/login/employer", the page we are on.
  await page.waitForURL(/\/(employer\/dashboard|my-jobs|dashboard)(\?|$|\/)/, { timeout: 40000 })

  for (const tab of TABS) {
    await page.goto(`${BASE}/my-jobs?filter=${tab}`, { waitUntil: 'domcontentloaded' })
    // Wait for the loader to GO, not for the page to be "big enough" — the nav
    // and cookie banner clear any length threshold on their own.
    await page.waitForFunction(
      () => !/^\s*Loading\.\.\.\s*$/m.test(document.body.innerText || ''),
      null, { timeout: 45000 },
    ).catch(() => {})
    // Then wait for the list region to have resolved either way.
    await page.waitForFunction(() => {
      return document.querySelector('button[aria-label="Job actions"]') !== null
        || /no adverts|no job adverts|no hires yet|no offers/i.test(document.body.innerText || '')
    }, null, { timeout: 45000 }).catch(() => {})

    const badge = await page.evaluate((t) => {
      const btns = [...document.querySelectorAll('button')]
      const label = { all: 'All Jobs', active: 'Active', interviewing: 'Interviewing',
                      offers: 'Offers', hired: 'Hired', archived: 'Archived' }[t]
      const b = btns.find(x => (x.innerText || '').trim().startsWith(label))
      if (!b) return null
      const m = (b.innerText || '').match(/(\d+)\s*$/)
      return m ? Number(m[1]) : 0
    }, tab)

    const cards = await page.locator('button[aria-label="Job actions"]').count()
    const body = await page.evaluate(() => document.body.innerText || '')
    const hasEmptyMsg = /no adverts|no job adverts/i.test(body)

    await page.screenshot({ path: `${SHOTS}/${tag}-${tab}.png` })

    // THE ASSERTION. Only meaningful for tabs that render JOB ROWS — offers
    // and hired deliberately render offer cards instead, so a badge there is
    // counting a different kind of thing and comparing them would be the
    // measurement-vs-question mistake all over again.
    if (tab !== 'offers' && tab !== 'hired') {
      check(`${tag} ${tab}: badge ${badge} == cards ${cards}`,
        `badge=${badge} cards=${cards}`, badge === cards)
    } else {
      check(`${tag} ${tab}: renders offers, not job rows (badge ${badge} not compared)`,
        `badge=${badge} jobRowKebabs=${cards}`, cards === 0)
    }

    // NEGATIVE CONTROL: an empty list must SAY it is empty.
    if (cards === 0 && tab !== 'offers' && tab !== 'hired') {
      check(`${tag} ${tab}: empty list carries a message`, `msg=${hasEmptyMsg}`, hasEmptyMsg)
    }
  }

  // ── the kebab, on All Jobs ────────────────────────────────────────────
  await page.goto(`${BASE}/my-jobs?filter=all`, { waitUntil: 'domcontentloaded' })
  await page.locator('button[aria-label="Job actions"]').first().waitFor({ timeout: 45000 })
  await page.locator('button[aria-label="Job actions"]').first().click()
  await page.waitForSelector('[role="menu"]', { timeout: 10000 })
  const items = (await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts())
    .map(s => s.trim()).filter(Boolean)
  await page.screenshot({ path: `${SHOTS}/${tag}-kebab.png` })

  check(`${tag} kebab says "Edit job"`, items.join(' | '),
    items.some(i => /^edit job$/i.test(i)))
  check(`${tag} kebab no longer says "Manage job"`, items.join(' | '),
    !items.some(i => /manage job/i.test(i)))

  // Edit opens the form with THIS job loaded. Navigation only — nothing saved.
  const firstCardHref = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Job actions"]')
    return b ? (b.closest('[class*="row"], [class*="Row"]')?.getAttribute('data-job-id') || null) : null
  })
  await page.locator('[role="menu"] [role="menuitem"]', { hasText: /^Edit job$/i }).first().click()
  await page.waitForURL(/\/post-job\?edit=[0-9a-f-]{36}/, { timeout: 30000 })
  const editUrl = page.url()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/${tag}-edit.png` })
  const editBody = await page.evaluate(() => document.body.innerText || '')
  check(`${tag} "Edit job" opens /post-job?edit=<uuid>`, editUrl.replace(BASE, ''),
    /\/post-job\?edit=[0-9a-f-]{36}/.test(editUrl))
  check(`${tag} edit form is not an empty shell`, `chars=${editBody.length}`,
    editBody.length > 500 && !/^\s*Loading/m.test(editBody))

  await ctx.close()
  return { firstCardHref }
}

let failure = null
try {
  await run(1440, 900, 'desktop')
  await run(390, 844, 'mobile')
} catch (e) {
  failure = e.message
} finally {
  await browser.close()
}

let failed = 0
for (const r of results) {
  if (r.ok) console.log(`  ok    ${r.name}`)
  else { failed++; console.log(`  FAIL  ${r.name}   ->  ${r.got}`) }
}
if (failure) { failed++; console.log(`  FAIL  drive threw: ${failure}`) }
console.log(`\n${results.length - failed}/${results.length} passed — screenshots in ${SHOTS}/`)
process.exit(failed ? 1 : 0)
