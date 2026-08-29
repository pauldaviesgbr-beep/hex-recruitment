// CONTROLS WRAP AT 390 — the board's filter strip and the CV builder's toolbar.
//
// THE CHECK THAT WOULD HAVE MISSED BOTH OF THESE IS scrollWidth > clientWidth.
// On the filter strip it answered "overflows: false" while 378px of controls
// hung off the right-hand edge, because the strip was a SCROLLER: a scroller's
// scrollWidth is its content and its clientWidth is its box, and the content
// had been scrolled out of sight rather than overflowing the box. It is not
// used here, in either direction.
//
// WHAT IS MEASURED INSTEAD, per element:
//   right edge  — getBoundingClientRect().right against the viewport width.
//                 A control whose right edge is past the viewport cannot be
//                 reached, whatever the container reports about itself.
//   line count  — the number of client rects a Range over the element's own
//                 text produces. One rect is one line. This is the question
//                 the earlier check got wrong: it asked whether the buttons
//                 were taller than 46px, and they were not, because the height
//                 was fixed and the LABELS wrapped inside it.
//
// Every element is printed with found/not-found beside it. A check that cannot
// say whether it was pointed at anything is not a check.

import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2]
const TAG = process.argv[3]
if (!BASE || !TAG) {
  console.error('usage: node scripts/drive-controls-wrap-390.mjs <base-url> <before|after>')
  process.exit(2)
}

const env = {}
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const PASSWORD = env.TEST_ACCOUNT_PASSWORD
if (!PASSWORD) {
  console.error('SKIP  TEST_ACCOUNT_PASSWORD missing from .env.local')
  process.exit(2)
}
const EMAIL = 'pauldavies.gbr+candidate@gmail.com'
const SHOTS = 'drive-shots'
mkdirSync(SHOTS, { recursive: true })

const rows = []
const fails = []

// One record per matched element: what it says, where its right edge is, and
// how many lines its own text occupies.
function probe(sel) {
  const nodes = Array.from(document.querySelectorAll(sel))
  return nodes.map(el => {
    const r = el.getBoundingClientRect()
    let lines = null
    const t = Array.from(el.childNodes).find(n => n.nodeType === 3 && n.textContent.trim())
    if (t) {
      const rg = document.createRange()
      rg.selectNodeContents(t)
      lines = rg.getClientRects().length
    }
    const cs = getComputedStyle(el)
    return {
      text: (el.textContent || '').trim().replace(/[\s ]+/g, ' ').slice(0, 30),
      left: Math.round(r.left * 10) / 10,
      right: Math.round(r.right * 10) / 10,
      top: Math.round(r.top * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      lines,
      overflowX: cs.overflowX,
      flexWrap: cs.flexWrap,
      visible: el.checkVisibility(),
    }
  })
}

async function measure(page, name, sel, vw, opts) {
  const requireOneLine = opts && opts.requireOneLine
  const got = await page.evaluate(probe, sel)
  if (got.length === 0) {
    rows.push('  ' + name.padEnd(22) + 'NOT FOUND  (' + sel + ')')
    fails.push(name + ': NOT FOUND — the check was pointed at nothing')
    return []
  }
  got.forEach((g, i) => {
    const past = g.right > vw
    const flag = !g.visible
      ? 'HIDDEN'
      : past
        ? 'PAST THE EDGE by ' + Math.round((g.right - vw) * 10) / 10 + 'px'
        : 'within'
    const ln = g.lines === null ? '' : '  lines=' + g.lines
    rows.push(
      '  ' + (name + '[' + i + ']').padEnd(22) + 'FOUND  "' + g.text + '"' +
      '  right=' + g.right + ' / ' + vw + '  ' + flag + ln
    )
    if (g.visible && past) {
      fails.push(name + '[' + i + '] "' + g.text + '" right edge ' + g.right + ' is past the ' + vw + 'px viewport')
    }
    if (requireOneLine && g.visible && g.lines !== null && g.lines !== 1) {
      fails.push(name + '[' + i + '] "' + g.text + '" label wraps onto ' + g.lines + ' lines')
    }
  })
  return got
}

const browser = await chromium.launch()

try {
  for (const vw of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()

    // ── THE BOARD ─────────────────────────────────────────────────────────
    rows.push('')
    rows.push('=== /jobs @ ' + vw + ' ===')
    await page.goto(BASE + '/jobs', { waitUntil: 'networkidle' })
    // WAIT FOR THE BOARD, NOT FOR THE STRIP. The filter strip renders before
    // the fetch resolves, so a run that waited on the strip alone measured a
    // page reading "0 jobs" and would have reported an empty board as a fact
    // about the product. It is 251. The strip's geometry does not depend on
    // the count, but the count is what says the page finished.
    await page.locator('[class*="filterStripLeft"]').first().waitFor({ timeout: 45000 })
    await page.waitForFunction(
      () => /[1-9]/.test((document.querySelector('[class*="jobCount"]') || {}).textContent || ''),
      { timeout: 45000 }
    ).catch(() => {})
    const boardCount = await page.evaluate(
      () => ((document.querySelector('[class*="jobCount"]') || {}).textContent || 'NOT FOUND').trim()
    )
    rows.push('  landed on ' + page.url().replace(BASE, '') + '   board says: ' + boardCount)
    if (!/[1-9]/.test(boardCount)) fails.push('/jobs: board still reading "' + boardCount + '" — measured before it loaded')

    // The cookie banner is a fixed overlay at the foot of the page and its own
    // stylesheet ALSO defines bannerInner and bannerActions, so it answers the
    // CV builder's selectors. Dismissed here so the toolbar measurement is
    // about the toolbar. (Observed: it contributed two phantom "toolbar
    // buttons", Manage Preferences and Accept All.)
    await page.locator('button', { hasText: /^Accept All$/ }).first().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(600)

    const strip = await measure(page, 'filterStripLeft', '[class*="filterStripLeft"]', vw)
    if (strip.length) {
      rows.push('  container: overflow-x=' + strip[0].overflowX + '  flex-wrap=' + strip[0].flexWrap)
      if (strip[0].overflowX === 'auto' || strip[0].overflowX === 'scroll') {
        fails.push('filterStripLeft is still a horizontal scroller (overflow-x: ' + strip[0].overflowX + ')')
      }
    }
    await measure(page, 'filter control', '[class*="filterStripLeft"] > *', vw)
    await measure(page, 'filterStripRight', '[class*="filterStripRight"] > *', vw)
    await page.locator('[class*="filterStrip"]').first()
      .screenshot({ path: SHOTS + '/' + TAG + '-' + vw + '-jobs-filterstrip.png' }).catch(() => {})
    await page.screenshot({ path: SHOTS + '/' + TAG + '-' + vw + '-jobs.png' })

    // ── THE CV BUILDER ────────────────────────────────────────────────────
    rows.push('')
    rows.push('=== /cv-builder @ ' + vw + ' ===')
    // WAIT FOR HYDRATION BEFORE CLICKING. The form carries method="post", so a
    // click landing before React has attached does a NATIVE form post and the
    // page reloads still signed out — which reads exactly like a rejected
    // password. Observed: it left /login/employee for /login with the form
    // still on screen and nothing logged.
    await page.goto(BASE + '/login/employee', { waitUntil: 'networkidle' })
    await page.waitForTimeout(3000)
    // The form carries no name attributes; it is keyed by id. Scoped to the
    // form because the OAuth buttons sit above it in the same panel.
    await page.fill('#login-email', EMAIL)
    await page.fill('#login-password', PASSWORD)
    await page.locator('form button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
    await page.locator('form button[type="submit"]').first().click()
    await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 45000 })
    await page.goto(BASE + '/cv-builder', { waitUntil: 'domcontentloaded' })
    await page.locator('[class*="bannerInner"]').first().waitFor({ timeout: 45000 })
    await page.waitForTimeout(1500)
    rows.push('  landed on ' + page.url().replace(BASE, ''))
    if (page.url().includes('/login')) fails.push('cv-builder: redirected to login — measured the wrong page')

    const banner = await measure(page, 'bannerInner', '[class*="bannerInner"]', vw)
    if (banner.length) rows.push('  container: flex-wrap=' + banner[0].flexWrap)
    // The dismissal is a claim until the page agrees with it.
    if (banner.length !== 1) {
      fails.push('bannerInner matched ' + banner.length + ' elements — the cookie banner is still answering this selector')
    }
    const toolbar = await measure(page, 'toolbar button', '[class*="bannerActions"] > button', vw, { requireOneLine: true })
    rows.push('  toolbar buttons found: ' + toolbar.length + ' (expected 4: Save CV, Preview, Export PDF, Download Word)')
    if (toolbar.length !== 4) fails.push('toolbar: found ' + toolbar.length + ' buttons, not the 4 this check is about')
    await page.locator('[class*="bannerInner"]').first()
      .screenshot({ path: SHOTS + '/' + TAG + '-' + vw + '-cv-toolbar.png' }).catch(() => {})
    await page.screenshot({ path: SHOTS + '/' + TAG + '-' + vw + '-cv-builder.png' })

    await ctx.close()
  }
} finally {
  await browser.close()
}

console.log(rows.join('\n'))
console.log('\n' + '-'.repeat(64))
if (fails.length) {
  console.log(TAG.toUpperCase() + ': ' + fails.length + ' problem(s)')
  fails.forEach(f => console.log('  ' + f))
} else {
  console.log(TAG.toUpperCase() + ': every control within the viewport, every label on one line')
}
console.log('shots in ' + SHOTS + '/' + TAG + '-*')
// A measurement, not a gate. The two runs are compared to each other.
process.exit(0)
