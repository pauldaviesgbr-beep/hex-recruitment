// node scripts/drive-native-nav.mjs <deployment-url>
//
// "One navigation" inside the iOS app: with html.native-nav (set by the app
// while its own tab bar shows), the website's header and hamburger are hidden
// and the page content is still there, clear of the top of the screen.
//
// Two states on the same page, so the check can tell them apart: WITHOUT the
// class the header must be visible (a browser, and the app's signed-out pages);
// WITH it, hidden. A check that only ran the second state would pass on a page
// that had no header at all.
//
// The class is applied the way the app applies it: sessionStorage set, then a
// reload, so the document-start path is what is exercised, not a later toggle.
// What a browser cannot do: run the app's own document-start script. Here the
// page's own reload stands in for it, by setting the class from sessionStorage
// before the check reads anything.

import { chromium } from 'playwright'
import { loadEnv } from './lib/rls-probe.mjs'

const target = process.argv[2]
if (!target || !/^https:\/\//.test(target)) { console.log('SKIP: pass the deployment URL'); process.exit(2) }
const env = loadEnv()
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
const isPreview = !/thrivecareer\.co\.uk/.test(target)

let fail = 0
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fail++ }

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    ...(isPreview ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  // Stand in for the app's document-start script on every load.
  await ctx.addInitScript(() => {
    try { if (sessionStorage.getItem('thriveNativeNav') === '1') document.documentElement.classList.add('native-nav') } catch {}
  })
  const page = await ctx.newPage()
  const url = target.replace(/\/$/, '') + '/jobs'

  const measure = async () => {
    // Settled when the page heading exists and is not a loading message.
    await page.waitForFunction(() => {
      const h = document.querySelector('h1')
      return !!h && !/loading/i.test(h.textContent || '')
    }, null, { timeout: 30000 })
    return page.evaluate(() => {
      const header = document.querySelector('[data-site-header]')
      const h1 = document.querySelector('h1')
      const r = h1?.getBoundingClientRect()
      const cx = r ? r.left + Math.min(r.width / 2, 40) : 0
      const cy = r ? r.top + r.height / 2 : 0
      const atH1 = r ? document.elementFromPoint(cx, cy) : null
      return {
        cls: document.documentElement.classList.contains('native-nav'),
        headerExists: !!header,
        headerShown: !!header && header.checkVisibility(),
        h1Text: h1?.textContent?.trim().slice(0, 40),
        h1Top: r?.top ?? null,
        h1Painted: !!(atH1 && h1 && (h1 === atH1 || h1.contains(atH1))),
        bodyShown: document.body.checkVisibility(),
      }
    })
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const before = await measure()
  console.log('     without the class:', JSON.stringify(before))
  check(!before.cls && before.headerExists && before.headerShown, 'browser state: the website header is visible')

  await page.evaluate(() => sessionStorage.setItem('thriveNativeNav', '1'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  const after = await measure()
  console.log('     with the class:   ', JSON.stringify(after))
  check(after.cls, 'app state: native-nav is on <html> after a reload (document-start path)')
  check(after.headerExists && !after.headerShown, 'app state: the website header is hidden')
  check(after.bodyShown && after.h1Painted, `app state: the page heading is on screen and painted ("${after.h1Text}")`)
  check(after.h1Top !== null && after.h1Top >= 0, `app state: the heading is not above the top of the screen (top ${after.h1Top})`)
  check(after.h1Top !== null && before.h1Top !== null && after.h1Top < before.h1Top,
    `app state: the heading moved up into the header's space (${before.h1Top} → ${after.h1Top})`)

  await page.screenshot({ path: process.env.TEMP + '/native-nav-390.png' })
  console.log('     screenshot:', process.env.TEMP + '/native-nav-390.png')
} finally {
  await browser.close()
}
console.log(fail ? `\n${fail} FAILED` : '\nall passed')
process.exitCode = fail ? 1 : 0
