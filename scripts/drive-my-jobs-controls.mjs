// WHAT CAN AN EMPLOYER ACTUALLY SEE AND CLICK ON /my-jobs?
//
// Fraser posted an advert successfully and then could not edit or delete it.
// That is evidence of a fault but not of WHICH fault: the control may be
// missing, or present and unfindable. Only one of those is fixed by building
// something. Reading the JSX says the control exists; it cannot say whether a
// person would find it. So this drives it.
//
// STRICTLY READ-ONLY. It opens the kebab and reads the labels. It clicks
// NOTHING that writes — no Remove, no Reactivate, no Repost. The fixture's
// four adverts are the same rows three other drives assert against, and the
// three fixture applications hang off them.
//
// AND IT REPORTS THE STATE IT MEASURED IN. The fixture employer's four ads are
// all `filled`, and the menu is status-dependent: "Remove ad" renders for
// ACTIVE only. So this run cannot see that item, and its absence here is the
// fixture, not the product. Said out loud rather than left for someone to
// rediscover — the gate that never fires looks exactly like a gate that works.

import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const PASSWORD = process.env.TEST_EMPLOYER_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

if (!PASSWORD) {
  console.error('SKIP  TEST_EMPLOYER_PASSWORD not in the environment')
  process.exit(2)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } }
    : {}),
})
const page = await ctx.newPage()
const out = {}

try {
  // ── Sign in ───────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login/employer`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)

  // THE SUBMIT BUTTON IS DISABLED UNTIL REACT HYDRATES. Waiting for it to be
  // enabled rather than sleeping — a sleep long enough today loses the race on
  // a slower machine later.
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')

  // THE FIRST VERSION OF THIS WAITED FOR /dashboard|my-jobs|employer/ — WHICH
  // MATCHES "/login/employer", the page it was already sitting on. So it
  // returned instantly without logging in, found zero job cards, and that zero
  // would have been written up as "the employer has no controls". The wait has
  // to be for a URL the login page cannot satisfy.
  await page.waitForURL(/\/(employer\/dashboard|my-jobs|dashboard)(\?|$|\/)/, { timeout: 30000 })
  out.landedAfterLogin = new URL(page.url()).pathname
  if (out.landedAfterLogin.startsWith('/login')) {
    throw new Error(`still on the login page (${out.landedAfterLogin}) — not signed in, so nothing below is about the product`)
  }

  // ── /my-jobs ──────────────────────────────────────────────────────────
  await page.goto(`${BASE}/my-jobs`, { waitUntil: 'domcontentloaded' })
  // Wait for the client component to settle rather than sleeping: either a
  // job card or the empty state must exist before anything is counted.
  // WAIT FOR THE LOADER TO GO, not for the page to be "big enough". The first
  // version waited for `innerText.length > 400`, which the nav and the cookie
  // banner satisfy on their own — so it returned while the page still said
  // "Loading...", counted zero job cards, and the screenshot showed a spinner.
  // A readiness check that cannot distinguish loading from loaded reports on
  // whichever state it happens to catch.
  await page.waitForFunction(
    () => !/^\s*Loading\.\.\.\s*$/m.test(document.body.innerText || ''),
    null, { timeout: 45000 },
  )
  // And wait for the thing itself: either a card control or the empty state.
  await page.waitForFunction(() => {
    return document.querySelector('button[aria-label="Job actions"]') !== null
      || /no jobs|post your first|post a job/i.test(document.body.innerText || '')
  }, null, { timeout: 45000 })

  // THE EARLY RETURN. /my-jobs renders
  // `postedJobs.length === 0 ? <empty state> : <everything else>`, so an
  // empty fixture hides every control and would read as "the buttons don't
  // exist". Confirm which branch we are on before concluding anything.
  out.kebabButtons = await page.locator('button[aria-label="Job actions"]').count()
  const body = await page.evaluate(() => document.body.innerText)
  out.looksLikeEmptyState = /you have.{0,20}no jobs|post your first|no jobs yet/i.test(body)

  if (out.kebabButtons > 0) {
    // Open the FIRST kebab and read every item verbatim. Labels are read from
    // the DOM rather than from the JSX, because CSS can uppercase a label and
    // an assertion written against the source then fails on the real page.
    await page.locator('button[aria-label="Job actions"]').first().click()
    await page.waitForSelector('[role="menu"]', { timeout: 5000 })
    out.menuItems = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
    out.menuItems = out.menuItems.map(s => s.trim()).filter(Boolean)

    // WHAT A PERSON WOULD SEARCH FOR. Fraser was looking to "edit" and to
    // "delete". Neither word appears anywhere in this menu.
    const joined = out.menuItems.join(' | ').toLowerCase()
    out.hasWordEdit = joined.includes('edit')
    out.hasWordDelete = joined.includes('delete')
    out.hasWordClose = joined.includes('close')
    out.hasManageJob = joined.includes('manage job')
    out.hasRemoveAd = joined.includes('remove ad')

    // The trigger itself: is it labelled in a way anyone would read?
    out.kebabVisibleText = await page.locator('button[aria-label="Job actions"]').first().innerText()
    await page.keyboard.press('Escape')
  }

  // Is the word "Edit" anywhere on the page at all, outside the menu?
  out.wordEditAnywhereOnPage = /\bedit\b/i.test(body)
  out.statusesShown = [...new Set((body.match(/\b(Active|Filled|Archived)\b/g) || []))]

  await page.screenshot({ path: 'my-jobs-controls.png', fullPage: false })
  out.screenshot = 'my-jobs-controls.png'
} catch (e) {
  out.error = e.message
  // ALWAYS SHOW THE SCREEN WHEN A DRIVE FAILS. The previous run threw before
  // the screenshot line, so all I had was a timeout message — which says the
  // wait failed and nothing about what the page was doing. State beats screen
  // for correct; screen beats state for finished.
  try {
    await page.screenshot({ path: 'my-jobs-controls.png', fullPage: false })
    out.screenshot = 'my-jobs-controls.png'
    out.url = page.url()
    out.bodyText = (await page.evaluate(() => document.body.innerText || '')).slice(0, 1200)
    out.anyKebab = await page.locator('button[aria-label="Job actions"]').count()
    out.anyButtons = await page.locator('button').count()
  } catch { /* page may be gone */ }
} finally {
  await browser.close()
}

console.log(JSON.stringify(out, null, 2))
process.exit(out.error ? 1 : 0)
