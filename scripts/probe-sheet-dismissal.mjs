// CAN THE FULL-SCREEN ACCOUNT SHEET BE DISMISSED WITHOUT GOING SOMEWHERE?
//
// The close-on-click-outside handler tests profileMenuRef.contains(target).
// That is a DOM test, and the sheet is a CHILD of the element the ref is on,
// so every tap that lands on the sheet counts as inside. On mobile the sheet
// covers the whole viewport, so there may be no "outside" left to tap.
//
// This matters because of what it means for the overlap fix. Before it, the
// sidebar toggle painted ON TOP of the sheet, and it is NOT inside the ref --
// so tapping it fired the outside-handler and closed the sheet. The overlap
// was, by accident, the only way out. Removing the overlap may remove that.
//
// Taps only. Nothing here navigates, so a sheet that is still open at the end
// is a sheet the person cannot back out of.

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2]
const WIDTH = Number(process.argv[3] || 390)
if (!BASE) { console.error('usage: node scripts/probe-sheet-dismissal.mjs <base-url> [viewport-width]'); process.exit(2) }
// 768 is the breakpoint where the dropdown becomes a full-screen sheet.
const MOBILE = WIDTH <= 768

const env = {}
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET || ''

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: 844 },
  ...(BYPASS ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})
const page = await ctx.newPage()
const open = async () => await page.evaluate(() => !!document.querySelector('[class*="profileDropdown"]'))
// Clicking the avatar TOGGLES. Reopening blind closed an already-open sheet
// and printed 'undefined' for the controls, which reads like a missing menu
// rather than a harness that shut it.
const ensureOpen = async () => {
  if (await open()) return
  await page.locator('button[aria-label="Open profile menu"]').first().click().catch(() => {})
  await page.locator('text=Log out').first().waitFor({ timeout: 15000 }).catch(() => {})
}
try {
  await page.goto(BASE + '/login/employee', { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  await page.fill('#login-email', 'pauldavies.gbr+candidate@gmail.com')
  await page.fill('#login-password', env.TEST_ACCOUNT_PASSWORD)
  await page.locator('form button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.locator('form button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 45000 })
  await page.locator('button', { hasText: /^Accept All$/ }).first().click({ timeout: 8000 }).catch(() => {})
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
  await page.locator('button[aria-label="Open profile menu"]').first().waitFor({ timeout: 30000 })

  // Where can a person tap? Every point is on the sheet, so the question is
  // whether ANY of them closes it. Points chosen across the sheet's own empty
  // band, its body, and the far corners.
  const TAPS = MOBILE ? [
    // The toggle's own centre at inset 0. It is OUTSIDE profileMenuRef, so
    // while it painted on top it fired the outside-handler. This is the tap
    // that says whether the overlap was the only way out.
    ['the hamburger toggle position',    32, 31],
    ['the empty band above the avatar', 195, 28],
    ['top-right corner',                370, 28],
    ['left of the avatar row',           10, 95],
    ['blank space below Log out',       195, 600],
    ['bottom-right corner',             370, 800],
  ] : [
    // At >=769 the dropdown is a 260px panel anchored under the avatar, and
    // the rest of the page is genuinely outside it — so the same handler
    // should work. Confirmed rather than assumed, because "the page is
    // behind it" is exactly the kind of reasoning that turned out to be
    // wrong about contains() on mobile.
    ['middle of the page',    Math.round(WIDTH / 2), 500],
    ['far left of the page',  80,                    400],
    ['below the panel',       Math.round(WIDTH - 130), 700],
  ]

  const results = []
  for (const [label, x, y] of TAPS) {
    await page.locator('button[aria-label="Open profile menu"]').first().click().catch(() => {})
    await page.locator('text=Log out').first().waitFor({ timeout: 15000 }).catch(() => {})
    if (!(await open())) { results.push([label, 'could not reopen the sheet — skipped']); continue }
    const startUrl = page.url()
    await page.mouse.click(x, y)
    await page.waitForTimeout(500)
    const stillOpen = await open()
    const moved = page.url() !== startUrl
    results.push([label + ' (' + x + ',' + y + ')', stillOpen ? 'STILL OPEN' : (moved ? 'closed, but it NAVIGATED' : 'CLOSED, stayed on the page')])
    if (stillOpen) {
      // leave it closed for the next iteration
      await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
      await page.locator('button[aria-label="Open profile menu"]').first().waitFor({ timeout: 30000 })
    } else if (moved) {
      await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
      await page.locator('button[aria-label="Open profile menu"]').first().waitFor({ timeout: 30000 })
    }
  }

  // The dedicated control. Asserted rather than assumed: it has to close the
  // sheet AND leave the person where they were.
  await ensureOpen()
  const closeBtn = page.locator('button[aria-label="Close menu"]')
  const hasClose = await closeBtn.count() > 0 && await closeBtn.first().isVisible().catch(() => false)
  if (hasClose) {
    const startUrl = page.url()
    await closeBtn.first().click()
    await page.waitForTimeout(400)
    const stillOpen = await open()
    results.push(['the Close menu button', stillOpen ? 'STILL OPEN' : (page.url() !== startUrl ? 'closed, but it NAVIGATED' : 'CLOSED, stayed on the page')])
  } else {
    // It is in the DOM at every width and hidden by CSS above 768. Saying
    // "not present" would read as a missing control rather than a deliberate
    // one, so say which of the two this is.
    const inDom = await closeBtn.count() > 0
    results.push(['the Close menu button', inDom ? 'in the DOM but not visible (mobile-only, as intended)' : 'NOT IN THE DOM AT ALL'])
  }

  // Is there anything in the sheet that READS as a way out?
  await ensureOpen()
  const affordance = await page.evaluate(() => {
    const sheet = document.querySelector('[class*="profileDropdown"]')
    if (!sheet) return { error: 'no sheet' }
    const btns = [...sheet.querySelectorAll('button, [role="button"]')].map(b => (b.getAttribute('aria-label') || b.textContent || '').trim())
    return { buttons: btns, text: (sheet.innerText || '').replace(/\s+/g, ' ').slice(0, 200) }
  })

  console.log("WHAT A TAP DOES, at viewport width " + WIDTH + (MOBILE ? "  (full-screen sheet)" : "  (anchored dropdown panel)") + ":")
  for (const [label, verdict] of results) console.log('  ' + label.padEnd(42) + verdict)
  console.log('')
  console.log('CONTROLS INSIDE THE SHEET: ' + JSON.stringify(affordance.buttons))
  console.log('SHEET TEXT: ' + affordance.text)
  const anyClose = results.some(([, v]) => v === 'CLOSED, stayed on the page')
  console.log('')
  console.log(anyClose
    ? 'AT LEAST ONE TAP DISMISSES IT WITHOUT NAVIGATING.'
    : 'NO TAP DISMISSES IT WITHOUT NAVIGATING — the only ways out of this sheet go somewhere else.')
} finally {
  await browser.close()
}
