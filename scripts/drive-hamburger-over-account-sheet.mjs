// THE SIDEBAR HAMBURGER PAINTS ON TOP OF THE ACCOUNT SHEET.
//
// Reported from a phone: the sidebar's three bars sit over the avatar in the
// account menu. It could not be reproduced in a browser, and the reason is
// that TWO separate things have to be true at once.
//
//   1. Z-ORDER, and it is unconditional. Header.module.css is on a token
//      scale -- var(--z-modal) is 200. Both sidebars are on a separate scale
//      of raw literals -- toggle 1001, overlay 1099, drawer 1100. 1001 > 200,
//      so the toggle is above the full-screen account sheet on every device.
//
//   2. POSITION, and it is true only in the app. The toggle is fixed to the
//      VIEWPORT at top: calc(0.7rem + env(safe-area-inset-top)). In a browser
//      the inset is 0, so the toggle sits in the sheet's empty top band and
//      touches nothing. On a notched iPhone the inset pushes it onto the
//      avatar row.
//
// So a browser at inset 0 shows the fault PRESENT AND INVISIBLE. That is why
// looking harder in a browser was never going to find it.
//
// THE CHECK ASKS A QUESTION WITH TWO DIFFERENT ANSWERS: what does the browser
// paint at the toggle's centre while the sheet is open? Before, the toggle.
// After, the sheet. Asserted at inset 0 AND at a simulated device inset,
// because a fix that only worked at one of them would be a fix for the
// browser rather than for the phone.
//
// BOTH ROLES ARE DRIVEN. The two sidebar stylesheets carry byte-identical
// mobileToggle and mobile-media blocks, so an employer meets this too. The
// fix is in the SHARED sheet, so it has to be shown working on both rather
// than argued from the diff.
//
// THE INSET THRESHOLD IS DERIVED FROM THE MEASURED RECTS, not from arithmetic
// on the CSS -- the run computes how far the toggle has to move before it
// reaches the avatar. Nothing here restates a number read from a stylesheet.
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

const ROLES = [
  { label: 'candidate', email: 'pauldavies.gbr+candidate@gmail.com', pw: env.TEST_ACCOUNT_PASSWORD,  login: '/login/employee', home: '/dashboard' },
  { label: 'employer',  email: 'pauldavies.gbr+employer@gmail.com',  pw: env.TEST_EMPLOYER_PASSWORD, login: '/login/employer', home: '/employer/dashboard' },
]
for (const r of ROLES) {
  if (!r.pw) { console.error('SKIP  password for the ' + r.label + ' fixture missing from .env.local'); process.exit(2) }
}

const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET || ''
const SHOTS = 'drive-shots'
mkdirSync(SHOTS, { recursive: true })

// Every notched iPhone is 44-59. The conclusion does not depend on which.
const DEVICE_INSET = 59

const rows = []
const fails = []
const note = t => rows.push('  ' + t)

const MEASURE = (inset) => {
  const toggle = document.querySelector('button[aria-label="Open navigation"], button[aria-label="Close navigation"]')
  if (!toggle) return { error: 'no toggle on the page' }
  // Move it by exactly what the inset would move it. top is
  // calc(0.7rem + env(safe-area-inset-top)); env resolves to 0 here.
  toggle.style.top = 'calc(0.7rem + ' + inset + 'px)'
  void toggle.offsetHeight // flush, or the rect read below is the previous one

  const sheet = document.querySelector('[class*="profileDropdown"]')
  const avatar = document.querySelector('[class*="dropdownAvatar"]')
  const t = toggle.getBoundingClientRect()
  const a = avatar ? avatar.getBoundingClientRect() : null
  const hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2)

  const cls = el => el ? (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')) : ''
  const owner = el => {
    let n = el
    while (n && n !== document.body) {
      const c = cls(n)
      if (/mobileToggle/.test(c)) return 'THE HAMBURGER TOGGLE'
      if (/dropdownOverlay/.test(c)) return 'the account sheet overlay'
      if (/profileDropdown|dropdown/.test(c)) return 'the account sheet'
      n = n.parentElement
    }
    return el ? (el.tagName.toLowerCase() + '.' + cls(el)) : 'nothing'
  }
  const r = n => +n.toFixed(1)
  return {
    toggle: { top: r(t.top), bottom: r(t.bottom), left: r(t.left), w: r(t.width), h: r(t.height) },
    avatar: a ? { top: r(a.top), bottom: r(a.bottom) } : null,
    zToggle: getComputedStyle(toggle).zIndex,
    zSheet: sheet ? getComputedStyle(sheet).zIndex : 'no sheet',
    // The sheet lives inside the header, which is a stacking context, so the
    // header's number is the one that competes with the toggle. Reported
    // because the sheet's own z-index is NOT what decides this.
    zHeader: (() => { const h = document.querySelector('header'); return h ? getComputedStyle(h).zIndex : 'no header' })(),
    sheetCoversScreen: sheet ? (() => { const s = sheet.getBoundingClientRect(); return s.width >= innerWidth - 1 && s.height >= innerHeight - 1 })() : false,
    paintedAtToggleCentre: owner(hit),
    overlapsAvatar: !!(a && t.right > a.left && t.left < a.right && t.bottom > a.top && t.top < a.bottom),
  }
}

const browser = await chromium.launch()
try {
  for (const role of ROLES) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      // A header, never a share link: share links bind to one URL, die on the
      // next deployment, and have expired mid-session.
      ...(BYPASS ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
    })
    const page = await ctx.newPage()
    rows.push('')
    rows.push('################  ' + role.label.toUpperCase() + '  ################')
    try {
      // Hydration first: the form carries method="post", so a click landing
      // before React attaches does a native post and reloads still signed out,
      // which is indistinguishable from a rejected password.
      await page.goto(BASE + role.login, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
      await page.fill('#login-email', role.email)
      await page.fill('#login-password', role.pw)
      await page.locator('form button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
      await page.locator('form button[type="submit"]').first().click()
      await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 45000 })
      await page.locator('button', { hasText: /^Accept All$/ }).first().click({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(600)
      if (page.url().includes('/login')) { fails.push(role.label + ': not signed in — the sidebar never renders, so nothing here is about this fault'); continue }
      rows.push('signed in: YES  (landed ' + page.url().replace(BASE, '') + ')')

      await page.goto(BASE + role.home, { waitUntil: 'domcontentloaded' })
      await page.locator('button[aria-label="Open navigation"]').waitFor({ timeout: 30000 })
      rows.push('landed on: ' + page.url().replace(BASE, ''))

      // The cookie banner is a permanent [role="dialog"] on this app. Confirm
      // it is really gone rather than assuming the click above landed.
      const bannerGone = !(await page.evaluate(() => (document.body.innerText || '').includes('Accept All')))
      rows.push('cookie banner dismissed: ' + (bannerGone ? 'YES' : 'NO — it may be sitting under the sheet'))

      await page.locator('button[aria-label="Open profile menu"]').first().click()
      await page.locator('text=Log out').first().waitFor({ timeout: 15000 })
      await page.waitForTimeout(400)

      const zero = await page.evaluate(MEASURE, 0)
      if (zero.error) { fails.push(role.label + ': ' + zero.error); continue }

      rows.push('')
      rows.push('=== the z-order, true on every device ===')
      note('toggle z-index:            ' + zero.zToggle)
      note('account sheet z-index:     ' + zero.zSheet + '   (inside the header, so not what competes)')
      note('HEADER z-index:            ' + zero.zHeader + '   (the sheet is trapped in this — THIS is what competes)')
      note('sheet covers the screen:   ' + (zero.sheetCoversScreen ? 'YES' : 'no'))
      note('painted at toggle centre:  ' + zero.paintedAtToggleCentre)

      // Derived from the rects, not from the stylesheet.
      const threshold = zero.avatar ? +(zero.avatar.top - zero.toggle.bottom).toFixed(1) : null
      rows.push('')
      rows.push('=== the geometry at inset 0 — every browser, and mobile Safari in portrait ===')
      note('toggle:                    top ' + zero.toggle.top + '  bottom ' + zero.toggle.bottom + '  left ' + zero.toggle.left + '  ' + zero.toggle.w + 'x' + zero.toggle.h)
      note('sheet avatar:              top ' + (zero.avatar ? zero.avatar.top : '?') + '  bottom ' + (zero.avatar ? zero.avatar.bottom : '?'))
      note('overlaps the avatar:       ' + (zero.overlapsAvatar ? 'YES' : 'no'))
      note('clears it by:              ' + threshold + 'px  <-- ANY INSET ABOVE THIS REACHES THE AVATAR')
      await page.screenshot({ path: SHOTS + '/' + TAG + '-' + role.label + '-inset0.png' })

      const dev = await page.evaluate(MEASURE, DEVICE_INSET)
      rows.push('')
      rows.push('=== the toggle moved ' + DEVICE_INSET + 'px — MANUFACTURED, simulating the device inset ===')
      note('toggle:                    top ' + dev.toggle.top + '  bottom ' + dev.toggle.bottom)
      note('overlaps the avatar:       ' + (dev.overlapsAvatar ? 'YES' : 'no'))
      note('painted at toggle centre:  ' + dev.paintedAtToggleCentre)
      await page.screenshot({ path: SHOTS + '/' + TAG + '-' + role.label + '-inset' + DEVICE_INSET + '.png' })

      if (!zero.sheetCoversScreen) fails.push(role.label + ': the account sheet is not full-screen at 390 — this run is not measuring the reported state')
      if (threshold !== null && threshold < 0) fails.push(role.label + ': the toggle already overlaps at inset 0 — a different reproduction from the one described')

      if (TAG === 'before') {
        if (dev.paintedAtToggleCentre !== 'THE HAMBURGER TOGGLE') fails.push(role.label + ': the fault did not reproduce even at inset ' + DEVICE_INSET + ' — the diagnosis is wrong and any fix would be blind')
      }
      if (TAG === 'after') {
        if (zero.paintedAtToggleCentre === 'THE HAMBURGER TOGGLE') fails.push(role.label + ': at inset 0 the toggle STILL paints above the account sheet')
        if (dev.paintedAtToggleCentre === 'THE HAMBURGER TOGGLE') fails.push(role.label + ': at inset ' + DEVICE_INSET + ' the toggle STILL paints above the sheet — this is the device case')
        if (!/account sheet/.test(dev.paintedAtToggleCentre)) fails.push(role.label + ': at inset ' + DEVICE_INSET + ' the sheet is not what paints at the toggle centre (' + dev.paintedAtToggleCentre + ')')
      }
    } catch (e) {
      fails.push(role.label + ' threw: ' + e.message)
    } finally {
      await ctx.close()
    }
  }
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
