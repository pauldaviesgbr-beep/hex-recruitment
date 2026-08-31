// WHICH ANCESTOR TRAPS THE ACCOUNT SHEET?
//
// Raising the sheet's own z-index from 200 to 1200 changed the computed value
// and changed NOTHING about what paints. That means the sheet is not competing
// with the toggle at all -- it is inside an ancestor that creates a stacking
// context, so its z-index is only ever compared with its siblings.
//
// This walks the sheet's ancestors and names every one that creates a stacking
// context, with the property that does it. Diagnosis before a second attempt,
// rather than another guess at a number.

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2]
if (!BASE) { console.error('usage: node scripts/probe-sheet-stacking-context.mjs <base-url>'); process.exit(2) }

const env = {}
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET || ''

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  ...(BYPASS ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})
const page = await ctx.newPage()
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
  await page.locator('button[aria-label="Open navigation"]').waitFor({ timeout: 30000 })
  await page.locator('button[aria-label="Open profile menu"]').first().click()
  await page.locator('text=Log out').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(400)

  const out = await page.evaluate(() => {
    const cls = el => el ? (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')) : ''
    const desc = el => el.tagName.toLowerCase() + (cls(el) ? '.' + cls(el).split(/\s+/).join('.') : '')

    // Why an element forms a stacking context. Not exhaustive across the whole
    // spec, but it covers everything this page uses.
    const why = el => {
      const s = getComputedStyle(el)
      const r = []
      if (el === document.documentElement) r.push('root element')
      if (s.position !== 'static' && s.zIndex !== 'auto') r.push('position:' + s.position + ' + z-index:' + s.zIndex)
      if (s.position === 'fixed' || s.position === 'sticky') r.push('position:' + s.position)
      if (s.opacity !== '1') r.push('opacity:' + s.opacity)
      if (s.transform !== 'none') r.push('transform')
      if (s.filter !== 'none') r.push('filter')
      if (s.perspective !== 'none') r.push('perspective')
      if (s.isolation === 'isolate') r.push('isolation:isolate')
      if (s.mixBlendMode !== 'normal') r.push('mix-blend-mode')
      if (s.willChange && /transform|opacity|filter/.test(s.willChange)) r.push('will-change:' + s.willChange)
      if (s.contain && /paint|layout|strict|content/.test(s.contain)) r.push('contain:' + s.contain)
      return r
    }

    const chain = (startSel, label) => {
      const start = document.querySelector(startSel)
      if (!start) return [label + ': NOT FOUND']
      const lines = [label + ': ' + desc(start) + '   z-index ' + getComputedStyle(start).zIndex + '  position ' + getComputedStyle(start).position]
      let n = start.parentElement
      while (n) {
        const w = why(n)
        if (w.length) lines.push('   ^ ' + desc(n) + '   [' + w.join(', ') + ']')
        n = n.parentElement
      }
      return lines
    }

    return {
      sheet: chain('[class*="profileDropdown"]', 'THE ACCOUNT SHEET'),
      toggle: chain('button[aria-label="Open navigation"], button[aria-label="Close navigation"]', 'THE TOGGLE'),
    }
  })

  console.log(out.sheet.join('\n'))
  console.log('')
  console.log(out.toggle.join('\n'))
} finally {
  await browser.close()
}
