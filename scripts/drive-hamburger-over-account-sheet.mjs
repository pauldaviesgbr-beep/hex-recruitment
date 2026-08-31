// THE SIDEBAR HAMBURGER PAINTS ON TOP OF THE ACCOUNT SHEET.
//
// Reported from a phone: the three bars sit over the avatar in the account
// menu. It could not be reproduced in a browser, and the reason is that TWO
// separate things have to be true at once.
//
//   1. Z-ORDER, and it is unconditional. Header.module.css uses a token
//      scale -- var(--z-modal) is 200. The two sidebars use raw literals --
//      toggle 1001, drawer 1100, overlay 1099. 1001 > 200, so the toggle is
//      above the full-screen account sheet on every device, always.
//
//   2. POSITION, and it is true only in the app. The toggle is fixed to the
//      VIEWPORT at top: calc(0.7rem + env(safe-area-inset-top)). In a browser
//      the inset is 0, so the toggle sits in the sheet's empty 56px band and
//      touches nothing. On a notched iPhone the inset pushes it down onto the
//      avatar row.
//
// So a browser at inset 0 shows the fault present and INVISIBLE. That is why
// looking harder in a browser was never going to find it.
//
// THE CHECK ASKS A QUESTION WITH TWO DIFFERENT ANSWERS: what does the browser
// paint at the toggle's centre while the sheet is open? Before, the toggle.
// After, the sheet. It is asserted at inset 0 AND at a simulated device inset,
// because a fix that only worked at one of them would be a fix for the browser.
//
// THE INSET THRESHOLD IS DERIVED FROM THE MEASURED RECTS, not from arithmetic
// on the CSS -- the run computes how far the toggle has to move before it
// reaches the avatar, and reports it. Nothing here restates a number I read.
//
// The simulated inset is a MANUFACTURED STATE and is labelled as one in the
// output. env(safe-area-inset-top) cannot be set from a browser, so the only
// honest reproduction is to move the control the distance the inset moves it.

import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2]
const TAG = process.argv[3]
if (!BASE || !TAG) {
  console.error('usage: node scripts/drive-hamburger-over-account-sheet.mjs <base-url> <before|after>')
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

// Every notched iPhone is 44-59. The conclusion does not depend on which.
const DEVICE_INSET = 59

const rows = []
const fails = []
const note = t => rows.push('  ' + t)

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()

  // Hydration first: the form carries method="post", so a click landing before
  // React attaches does a native post and reloads still signed out.
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
  if (!signedIn) { fails.push('not signed in - the sidebar never renders, so nothing below is about this fault'); throw new Error('not signed in') }

  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
  await page.locator('button[aria-label="Open navigation"]').waitFor({ timeout: 30000 })
  rows.push('landed on: ' + page.url().replace(BASE, ''))

  // The cookie banner is a permanent [role="dialog"] on this app and would
  // sit under the sheet; dismissed above. Confirm it is really gone rather
  // than assuming the click landed.
  const bannerGone = !(await page.evaluate(() => (document.body.innerText || '').includes('Accept All')))
  rows.push('cookie banner dismissed: ' + (bannerGone ? 'YES' : 'NO - it may be under the sheet'))

  await page.locator('button[aria-label="Open profile menu"]').first().click()
  await page.locator('text=View Profile').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(400)

  const measure = async (insetPx) => await page.evaluate((inset) => {
    const toggle = document.querySelector('button[aria-label="Open navigation"], button[aria-label="Close navigation"]')
    if (!toggle) return { error: 'no toggle' }
    // Move it by exactly what the inset would move it. top is
    // calc(0.7rem + env(safe-area-inset-top)); env is 0 here.
    toggle.style.top = 'calc(0.7rem + ' + inset + 'px)'
    // Force layout before reading - the write above must be flushed or the
    // rect returned is the previous one.
    void toggle.offsetHeight

    const sheet = document.querySelector('[class*="profileDropdown"]')
    const avatar = document.querySelector('[class*="dropdownAvatar"]')
    const t = toggle.getBoundingClientRect()
    const a = avatar ? avatar.getBoundingClientRect() : null
    const cx = t.left + t.width / 2
    const cy = t.top + t.height / 2
    const hit = document.elementFromPoint(cx, cy)
    const cls = el => el ? (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')) : ''
    const owner = el => {
      let n = el
      while (n && n !== document.body) {
        const c = cls(n)
        if (/mobileToggle/.test(c)) return 'THE HAMBURGER TOGGLE'
        if (/profileDropdown|dropdownAvatar|dropdownHeader|dropdownItem|dropdownName|dropdownEmail|dropdownUserInfo|dropdownDivider|dropdownIcon/.test(c)) return 'the account sheet'
        if (/dropdownOverlay/.test(c)) return 'the account sheet overlay'
        n = n.parentElement
      }
      return el ? (el.tagName.toLowerCase() + '.' + cls(el)) : 'nothing'
    }
    const overlaps = a && t.right > a.left && t.left < a.right && t.bottom > a.top && t.top < a.bottom
    return {
      toggle: { top: +t.top.toFixed(1), bottom: +t.bottom.toFixed(1), left: +t.left.toFixed(1), w: +t.width.toFixed(1), h: +t.height.toFixed(1) },
      avatar: a ? { top: +a.top.toFixed(1), bottom: +a.bottom.toFixed(1), left: +a.left.toFixed(1), right: +a.right.toFixed(1) } : null,
      zToggle: getComputedStyle(toggle).zIndex,
      zSheet: sheet ? getComputedStyle(sheet).zIndex : 'no sheet',
      sheetCoversScreen: sheet ? (() => { const r = sheet.getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1 })() : false,
      paintedAtToggleCentre: owner(hit),
      overlapsAvatar: !!overlaps,
    }
  }, insetPx)

  const zero = await measure(0)
  if (zero.error) { fails.push(zero.error); throw new Error(zero.error) }

  rows.push('')
  rows.push('=== the z-order, which is true on every device ===')
  note('toggle z-index:              ' + zero.zToggle)
  note('account sheet z-index:       ' + zero.zSheet)
  note('sheet covers the screen:     ' + (zero.sheetCoversScreen ? 'YES' : 'no'))
  note('painted at toggle centre:    ' + zero.paintedAtToggleCentre)

  // Derived from the rects, not from the stylesheet: how far the toggle has
  // to move down before it reaches the avatar row.
  const threshold = zero.avatar ? +(zero.avatar.top - zero.toggle.bottom).toFixed(1) : null
  rows.push('')
  rows.push('=== the geometry, at inset 0 - every browser, and mobile Safari ===')
  note('toggle:                      top ' + zero.toggle.top + '  bottom ' + zero.toggle.bottom + '  left ' + zero.toggle.left + '  ' + zero.toggle.w + 'x' + zero.toggle.h)
  note('sheet avatar:                top ' + (zero.avatar ? zero.avatar.top : '?') + '  bottom ' + (zero.avatar ? zero.avatar.bottom : '?'))
  note('overlaps the avatar:         ' + (zero.overlapsAvatar ? 'YES' : 'no'))
  note('clear by:                    ' + threshold + 'px  <-- ANY SAFE-AREA INSET ABOVE THIS REACHES THE AVATAR')

  await page.screenshot({ path: SHOTS + '/' + TAG + '-hamburger-inset0.png' })

  const dev = await measure(DEVICE_INSET)
  rows.push('')
  rows.push('=== the same page with the toggle moved ' + DEVICE_INSET + 'px - MANUFACTURED, simulating the device inset ===')
  note('toggle:                      top ' + dev.toggle.top + '  bottom ' + dev.toggle.bottom)
  note('overlaps the avatar:         ' + (dev.overlapsAvatar ? 'YES' : 'no'))
  note('painted at toggle centre:    ' + dev.paintedAtToggleCentre)

  await page.screenshot({ path: SHOTS + '/' + TAG + '-hamburger-inset' + DEVICE_INSET + '.png' })

  if (!zero.sheetCoversScreen) fails.push('the account sheet is not full-screen at 390 - this run is not measuring the reported state')
  if (threshold !== null && threshold < 0) fails.push('the toggle already overlaps the avatar at inset 0 - the reproduction is different from the one described')

  if (TAG === 'after') {
    if (zero.paintedAtToggleCentre === 'THE HAMBURGER TOGGLE') fails.push('at inset 0 the toggle STILL paints above the account sheet')
    if (dev.paintedAtToggleCentre === 'THE HAMBURGER TOGGLE') fails.push('at inset ' + DEVICE_INSET + ' the toggle STILL paints above the account sheet - this is the device case')
    if (!/account sheet/.test(dev.paintedAtToggleCentre)) fails.push('at inset ' + DEVICE_INSET + ' the sheet is not what paints at the toggle centre (' + dev.paintedAtToggleCentre + ')')
  }
  if (TAG === 'before') {
    if (dev.paintedAtToggleCentre !== 'THE HAMBURGER TOGGLE') fails.push('the fault did not reproduce even at inset ' + DEVICE_INSET + ' - the diagnosis is wrong and the fix would be blind')
  }
} catch (e) {
  fails.push('threw: ' + e.message)
} finally {
  await browser.close()
}

console.log(rows.join('\n'))
console.log('')
if (fails.length) {
  console.log(TAG.toUpperCase() + ': ' + fails.length + ' FAILED')
  for (const f of fails) console.log('  - ' + f)
  process.exit(1)
}
console.log(TAG.toUpperCase() + ': all checks passed')
