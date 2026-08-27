// NOTHING MAY HIDE UNDER THE FIXED MOBILE HEADER — ASKED AS GEOMETRY, ON THE
// REAL PAGE, AT scrollY 0.
//
// WHY THIS EXISTS. At <=768px the site header is position:fixed, so it
// reserves no space in the flow. globals.css compensates with
// `main { padding-top: var(--nav-height) }`, and pages using `main.no-pad`
// opt out of that so a dark band can sit flush. /jobs and /candidates opted
// out and then never cleared the header themselves: "Find Your Next Role" and
// "Candidates" were rendered ENTIRELY BEHIND IT, for every mobile visitor,
// presumably for weeks. Every existing check passed the whole time, because
// the elements were present, correct, and in the DOM. They were simply not
// visible.
//
// AND --nav-height WAS ITSELF WRONG. It said 66px while the header renders
// 69.19px at every width from 320 to 767 — so all fourteen consumers were
// 3.19px short, including three `position: sticky; top: var(--nav-height)`
// filter strips that sat 3px underneath the header they were meant to sit
// below. THE FIRST ASSERTION HERE IS THAT AGREEMENT, not either number: a
// declared value and a rendered one are different things, and only the
// comparison can tell you so.
//
// TWO MISTAKES OF MINE ARE BUILT INTO THIS FILE, because both produced a
// confident wrong answer within the hour:
//
//   1. AN AUTH-GATED ROUTE MEASURED WHILE SIGNED OUT REPORTS ON THE LOGIN
//      PAGE. /candidates came back "clear" on the first sweep for exactly
//      that reason. So every result records where it LANDED, and a redirect
//      is reported rather than silently measured.
//   2. A display:none ELEMENT HAS visibility:'visible' AND A 0,0,0,0 RECT,
//      so it looks like an element painting at the top-left corner. That is
//      how I reported a "ghost Apply Now" on every job page that does not
//      exist — the sidebar is correctly display:none at <=768px, and the
//      pixels of the header are flat navy. Visibility is checked through
//      checkVisibility(), which knows the difference.
//
//   node scripts/prove-mobile-header-clearance.mjs <baseUrl>
//
// Public routes only, so it needs no account and no fixture. It is not in
// `npm run verify` for the same reason deletegate:prove is not: it needs a
// deployment, and it must not guess which one.

import { chromium } from 'playwright'

const BASE = process.argv[2]
if (!BASE) {
  console.log('SKIP  no base URL. Pass the deployment to measure, e.g.')
  console.log('      node scripts/prove-mobile-header-clearance.mjs https://<deployment>')
  process.exit(2)
}

// Public and reachable signed out. Anything auth-gated would measure /login.
const ROUTES = ['/', '/jobs', '/temp-work', '/login', '/signup', '/support', '/terms', '/privacy-policy']

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(56) + (detail ?? ''))
  return ok
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
})
const page = await ctx.newPage()

try {
  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const acc = page.getByRole('button', { name: /^accept all$/i }).first()
  if (await acc.count()) { await acc.click(); await page.waitForTimeout(1000) }

  console.log('\n1. THE CONSTANT AGREES WITH THE THING IT DESCRIBES')
  const nav = await page.evaluate(() => {
    const h = document.querySelector('header')
    return {
      rendered: h.getBoundingClientRect().height,
      declared: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')),
      position: getComputedStyle(h).position,
    }
  })
  check('the header really is fixed at this width', nav.position === 'fixed', nav.position)
  check('--nav-height is NOT LESS THAN the rendered header',
    nav.declared >= nav.rendered,
    `declared ${nav.declared}px, rendered ${nav.rendered.toFixed(2)}px, slack ${(nav.declared - nav.rendered).toFixed(2)}px`)

  console.log('\n2. NO PAGE HIDES CONTENT BEHIND IT')
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2200)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)

    const landed = new URL(page.url()).pathname
    if (landed !== route) {
      // Not a pass and not a failure of the page — a failure to measure it.
      check(`${route} was measured`, false, `REDIRECTED to ${landed} — this proves nothing about ${route}`)
      continue
    }

    const worst = await page.evaluate(() => {
      const hdr = document.querySelector('header')
      if (!hdr) return { noHeader: true }
      const hr = hdr.getBoundingClientRect()
      let worst = null
      for (const el of document.querySelectorAll('h1,h2,h3,p,a,button,input,label,li')) {
        if (el.closest('header')) continue
        // checkVisibility knows display:none, visibility:hidden, content-visibility
        // and opacity — the four ways an element can be in the DOM and not on
        // the screen. A bare visibility check reports display:none as visible.
        if (!el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue
        if (!(el.textContent || '').trim() && el.tagName !== 'INPUT') continue
        if (el.tagName !== 'INPUT' && el.querySelector('h1,h2,h3,p,a,button,input,label')) continue
        const r = el.getBoundingClientRect()
        if (r.height < 4 || r.width < 4) continue
        const overlap = Math.min(r.bottom, hr.bottom) - Math.max(r.top, hr.top)
        if (overlap > 1 && (!worst || overlap > worst.overlap)) {
          worst = {
            overlap: Math.round(overlap), tag: el.tagName,
            fully: r.bottom <= hr.bottom,
            text: ((el.textContent || '').trim() || el.placeholder || '').slice(0, 34),
          }
        }
      }
      return { worst }
    })

    if (worst.noHeader) { check(`${route} has a header to clear`, true, 'no <header> — nothing to hide behind'); continue }
    check(`${route} hides nothing behind the header`, !worst.worst,
      worst.worst ? `${worst.worst.tag} ${worst.worst.overlap}px${worst.worst.fully ? ' FULLY HIDDEN' : ''} "${worst.worst.text}"` : '')
  }

  console.log('\n3. /temp-work EXPLAINS ITSELF BEFORE IT FILTERS')
  await page.goto(`${BASE}/temp-work`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2200)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  const tw = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    const sub = h1 ? h1.parentElement.querySelector('p') : null
    const filter = document.querySelector('aside button, aside input')
    const r = e => e ? e.getBoundingClientRect() : null
    return {
      h1Top: r(h1) ? Math.round(r(h1).top) : null,
      subTop: r(sub) ? Math.round(r(sub).top) : null,
      filterTop: r(filter) ? Math.round(r(filter).top) : null,
      viewportH: window.innerHeight,
      subText: sub ? sub.textContent.trim().slice(0, 40) : null,
    }
  })
  check('the heading renders ABOVE the first filter control',
    tw.h1Top !== null && tw.filterTop !== null && tw.h1Top < tw.filterTop,
    `h1 y${tw.h1Top} / first filter y${tw.filterTop}`)
  check('…and so does the sentence that explains the page',
    tw.subTop !== null && tw.filterTop !== null && tw.subTop < tw.filterTop,
    `"${tw.subText}" at y${tw.subTop}`)
  check('the heading is in the top third — the install-sheet thumbnail',
    tw.h1Top !== null && tw.h1Top < tw.viewportH / 3,
    `y${tw.h1Top} of ${tw.viewportH}`)
} catch (e) {
  console.error('\n  THREW: ' + (e?.message || e))
  bad++
} finally {
  await ctx.close().catch(() => {})
  await browser.close().catch(() => {})
}

console.log('')
console.log(bad ? `  ${bad} FAILED` : '  nothing hides behind the mobile header, and temp-work leads with its heading')
process.exit(bad ? 1 : 0)
