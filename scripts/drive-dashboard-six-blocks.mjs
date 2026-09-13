// THE REBUILT EMPLOYER DASHBOARD AT 393, IN WEBKIT — SIX BLOCKS, IN ORDER.
//
//   node scripts/drive-dashboard-six-blocks.mjs <base-url>
//
// ── WHAT THIS ASSERTS THAT A DOM CHECK WOULD NOT ───────────────────────────
//
// The handoff's dashboard is a claim about ORDER and about PAINT: one action
// above three tiles above a list above a nudge, and exactly one yellow surface
// on the screen. Every one of those is true or false about what a person sees,
// and a check that only asks "is the element present" passes on a page where
// all six render behind the header in the wrong order. So the order is read
// from document position, the header clearance is read with elementFromPoint at
// each block's own centre, and the yellow is counted by RESOLVED BACKGROUND
// rather than by class name.
//
// ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
//
// WebKit at 393x852 is the same engine family as the WKWebView the Capacitor
// shell runs. IT IS NOT THE SHELL. `env(safe-area-inset-*)` is 0 in every
// desktop browser and cannot be set from script, so anything positioned against
// the notch is somewhere else on a real handset.
//
// AND IT SIGNS IN AS THRIVE TEST EMPLOYER, NOT DEMO KITCHEN. Demo Kitchen's
// password was generated once and stored only in App Store Connect; minting a
// new one would break the credential Apple reviews with. Test Employer renders
// the same screens in the same states — adverts all filled, zero active — so
// the LAYOUT transfers and the COUNTS do not. Both are printed.
//
// NOTHING IS WRITTEN. Every assertion is a read.

import { webkit } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2]
if (!BASE) {
  console.log('SKIP  no base URL given.')
  console.log('      node scripts/drive-dashboard-six-blocks.mjs https://<preview>')
  console.log('      A script that can point at a deployment must be TOLD which one.')
  process.exit(2)
}

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const PASS = env.TEST_EMPLOYER_PASSWORD
if (!PASS) { console.log('SKIP  TEST_EMPLOYER_PASSWORD is not set.'); process.exit(2) }
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET

let bad = 0
const check = (label, ok, detail = '') => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(58) + detail)
}
const note = (s) => console.log('       ' + s)

const browser = await webkit.launch()
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  // A share link dies on the next deployment; the header does not.
  extraHTTPHeaders: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {},
})

try {
  // ── sign in ──────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 30000 })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASS)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForFunction(() => !location.pathname.includes('/login'), null, { timeout: 30000 })

  // ── the dashboard ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/employer/dashboard`, { waitUntil: 'domcontentloaded' })

  // WAIT ON A PREDICATE THAT IS FALSE WHILE THE ANSWER IS MISSING, never on a
  // clock and never on a text LENGTH — `innerText.length > 200` returned true
  // at 201 characters of navigation menu and measured a page that had not
  // rendered. The skeleton carries the same geometry as the real blocks, so
  // the predicate has to be "the real block exists", which the skeleton's own
  // markup cannot satisfy: it asks for the action card's eyebrow TEXT.
  const settled = await page.waitForFunction(() => {
    const el = document.querySelector('[class*="ndActionEyebrow"]')
    return !!el && (el.textContent || '').trim().length > 0
  }, null, { timeout: 30000 }).then(() => true).catch(() => false)
  check('the dashboard reaches a settled state (not the skeleton)', settled, settled ? '' : 'NEVER SETTLED')

  const landed = await page.evaluate(() => location.pathname)
  check('…and it is still the page we asked for', landed === '/employer/dashboard', landed)

  // ── 1. THE SIX BLOCKS, IN DOCUMENT ORDER ────────────────────────────────
  // Read by position on the page rather than by presence. A page with all six
  // present in the wrong order passes a presence check and fails this one.
  const blocks = await page.evaluate(() => {
    const pick = (sel) => document.querySelector(sel)
    const found = [
      ['1 navy header', 'header'],
      ['2 greeting', '[class*="ndGreet"]'],
      ['3 action card', '[class*="ndAction"]'],
      ['4 three tiles', '[class*="ndTiles"]'],
      ['5 your job ads', '[class*="ndAds"]'],
      ['6 the nudge', '[class*="ndNudge"]'],
    ].map(([name, sel]) => {
      const el = pick(sel)
      if (!el) return { name, present: false }
      const r = el.getBoundingClientRect()
      return { name, present: true, top: Math.round(r.top + scrollY), height: Math.round(r.height) }
    })
    return found
  })
  for (const b of blocks) {
    check(`block ${b.name} is on the page`, b.present, b.present ? `top ${b.top}  h ${b.height}` : 'ABSENT')
  }
  const present = blocks.filter(b => b.present)
  // ALL SIX, AND IN ORDER — one predicate, because either half alone passes on
  // a state it should not. The positive control against production caught this:
  // with only the header present, "every present block sits below the last" is
  // VACUOUSLY TRUE, and it printed ok on a page carrying none of this work.
  // A check that passes on one block cannot tell you anything about six.
  const ordered = present.length === blocks.length &&
    present.every((b, i) => i === 0 || b.top >= present[i - 1].top)
  check('the blocks are in the handoff\'s order, top to bottom', ordered,
    `${present.length}/${blocks.length}  ` + present.map(b => `${b.name}@${b.top}`).join(' < '))

  // ── 2. EXACTLY ONE YELLOW SURFACE ───────────────────────────────────────
  // "This is the only yellow surface on the screen." Counted by the RESOLVED
  // background colour of every painted element, not by class name — a second
  // yellow arriving from a component this page mounts would be invisible to a
  // check that only looks at the classes this page wrote.
  //
  // THE FIRST RUN COUNTED FOUR AND THREE WERE NOT THIS PAGE'S: the chat
  // widget's send button, the cookie banner's accept button, and a sidebar row
  // carrying a 10%-alpha yellow wash. All three are global chrome on every
  // screen in the product, and a 10% tint is not a surface. The claim being
  // tested is about the DASHBOARD, so the scan is scoped to it.
  const yellows = await page.evaluate(() => {
    const out = []
    const root = document.querySelector('[class*="ndWrap"]') || document.body
    for (const el of root.querySelectorAll('*')) {
      if (!el.checkVisibility?.()) continue
      const r = el.getBoundingClientRect()
      if (r.width < 24 || r.height < 24) continue   // an icon or a dot is not a surface
      const bg = getComputedStyle(el).backgroundColor
      const m = bg.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (!m) continue
      const [r_, g, b] = [+m[1], +m[2], +m[3]]
      // A TRANSLUCENT TINT IS NOT A SURFACE. Alpha below 0.5 is a hover state
      // or a selected-row wash; counting it is half of how the first run found
      // four yellows on a page that has one.
      const alpha = bg.startsWith('rgba') ? parseFloat(bg.split(',')[3]) : 1
      // yellow: red and green both high, blue low
      if (alpha >= 0.5 && r_ > 200 && g > 190 && b < 110) {
        out.push({ cls: String(el.className || el.tagName).slice(0, 40), bg, w: Math.round(r.width), h: Math.round(r.height) })
      }
    }
    return out
  })
  check('exactly one yellow surface in the dashboard', yellows.length === 1,
    yellows.length ? yellows.map(y => `${y.cls} ${y.bg} ${y.w}x${y.h}`).join(' | ') : 'none found')

  // THE GLOBAL CHROME, NAMED RATHER THAN HIDDEN. Scoping the check above to the
  // dashboard is correct — the claim is about this screen's own surfaces — but
  // quietly dropping the other three would hide something true: a first-time
  // employer really does see the cookie banner's yellow Accept button on the
  // same screen as the yellow action card. Pre-existing, global, and not this
  // branch's to fix; printed so it is a decision rather than an omission.
  const chromeYellow = await page.evaluate(() => {
    const wrap = document.querySelector('[class*="ndWrap"]')
    const out = []
    for (const el of document.querySelectorAll('*')) {
      if (wrap && wrap.contains(el)) continue
      if (!el.checkVisibility?.()) continue
      const r = el.getBoundingClientRect()
      if (r.width < 24 || r.height < 24) continue
      const bg = getComputedStyle(el).backgroundColor
      const m = bg.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (!m) continue
      const alpha = bg.startsWith('rgba') ? parseFloat(bg.split(',')[3]) : 1
      if (alpha >= 0.5 && +m[1] > 200 && +m[2] > 190 && +m[3] < 110) {
        out.push(String(el.className || el.tagName).split('__')[0])
      }
    }
    return out
  })
  if (chromeYellow.length) note('yellow OUTSIDE the dashboard (global chrome, pre-existing): ' + chromeYellow.join(', '))

  // ── 3. THE TILE DESTINATIONS ARE CLAUDE DESIGN'S ────────────────────────
  // Named in the handoff, not filled in by judgement. Asserted as a PAIR —
  // label to href — because three correct hrefs in the wrong order is a page
  // that sends every employer to the wrong screen and passes a href-only check.
  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll('[class*="ndTile"]')]
      .filter(el => el.tagName === 'A')
      .map(a => ({
        label: (a.querySelector('[class*="ndTileLabel"]')?.textContent || '').trim(),
        num: (a.querySelector('[class*="ndTileNum"]')?.textContent || '').trim(),
        href: new URL(a.href).pathname,
      })))
  // `/temp-work/manage`, NOT the handoff's `/temp-work`. The bare route is the
  // CANDIDATE shift feed. This expectation was changed AFTER the check caught
  // the product: the drive went red on the tile the moment the page was fixed,
  // which is the only direct evidence this project has that the label-to-href
  // pair assertion can fail on a real difference rather than only pass.
  const EXPECT = [
    ['Live job ads', '/my-jobs'],
    ['New applicants', '/applied'],
    ['Shifts this week', '/temp-work/manage'],
  ]
  check('there are three tiles', tiles.length === 3, `${tiles.length}: ` + tiles.map(t => t.label).join(', '))
  for (const [label, href] of EXPECT) {
    const t = tiles.find(x => x.label === label)
    check(`"${label}" goes to ${href}`, !!t && t.href === href, t ? t.href : 'TILE MISSING')
  }
  note('tile values seen: ' + tiles.map(t => `${t.label} = ${t.num}`).join(' · '))

  // ── 4. THE STATUS LINE IS NOT A FILLED PILL ─────────────────────────────
  // "Never a filled pill" is the handoff's rule and the reason the advert card
  // was redrawn. Asserted as the ABSENCE of a painted ground, which is a fact
  // about the rendered element rather than about what the stylesheet says.
  const statuses = await page.evaluate(() =>
    [...document.querySelectorAll('[class*="ndAdStatus__"]')].map(el => {
      const cs = getComputedStyle(el)
      return { text: (el.textContent || '').trim(), bg: cs.backgroundColor, border: cs.borderTopWidth, color: cs.color }
    }))
  const pills = statuses.filter(s => s.bg !== 'rgba(0, 0, 0, 0)' && s.bg !== 'transparent')
  check('no advert status is a filled pill', pills.length === 0,
    statuses.length ? `${statuses.length} status line(s): ` + statuses.map(s => `${s.text}/${s.color}`).join(', ') : 'no rows to check')

  // ── 5. NOTHING PAINTS BEHIND THE FIXED HEADER ───────────────────────────
  // "Inside the viewport" is true of an element BEHIND another element. So ask
  // what is actually painted at each block's own centre.
  const behind = await page.evaluate(() => {
    const head = document.querySelector('header')
    if (!head) return { error: 'no header' }
    const hb = head.getBoundingClientRect().bottom
    const out = []
    for (const el of document.querySelectorAll('h1, h2, [class*="ndGreet"], [class*="ndAction"], [class*="ndTile"], [class*="ndAds"], [class*="ndNudge"]')) {
      if (!el.checkVisibility?.()) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.top >= hb || r.bottom <= 0) continue
      const cx = Math.round(r.left + r.width / 2)
      const cy = Math.round(r.top + r.height / 2)
      if (cy < 0 || cy > innerHeight) continue
      const painted = document.elementFromPoint(cx, cy)
      if (painted && (painted === head || head.contains(painted))) {
        out.push({ text: (el.textContent || '').trim().slice(0, 36), top: Math.round(r.top) })
      }
    }
    return { headerBottom: Math.round(hb), covered: out }
  })
  check('nothing is painted BEHIND the fixed header', (behind.covered || []).length === 0,
    (behind.covered || []).length ? JSON.stringify(behind.covered) : `header bottom ${behind.headerBottom}`)

  // ── 6. NO SIDEWAYS SCROLL, NOTHING UNREACHABLE ──────────────────────────
  // overflow-x: visible is DELIBERATELY not counted — it does not clip, and
  // counting it produced five false failures on the header of every page the
  // last time this check was written.
  const o = await page.evaluate(() => {
    const scrollers = [], clipped = [], past = []
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const wide = el.scrollWidth > el.clientWidth + 1
      const ox = cs.overflowX
      const id = (el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 60)
      if (wide && (ox === 'auto' || ox === 'scroll')) scrollers.push(`${id}  ${el.scrollWidth}>${el.clientWidth}`)
      // A single-line ellipsis truncation is CONTENT, not a clipped control —
      // and the advert row's title is supposed to truncate.
      const deliberate = cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap'
      if (wide && (ox === 'hidden' || ox === 'clip') && !deliberate) clipped.push(`${id}  ${el.scrollWidth}>${el.clientWidth}`)
      if (!el.children.length) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > innerWidth + 1) past.push(`${id}  right=${Math.round(r.right)}`)
      }
    }
    return { scrollers, clipped, past, bodyScrolls: document.documentElement.scrollWidth > innerWidth + 1 }
  })
  check('the page does not scroll sideways', !o.bodyScrolls)
  check('nothing is UNREACHABLE (clipped rather than swipeable)', o.clipped.length === 0, o.clipped.slice(0, 3).join(' | '))
  check('nothing sits past the right edge of the screen', o.past.length === 0, o.past.slice(0, 3).join(' | '))

  // ── 7. EVERY TAP TARGET REACHES THE FLOOR ───────────────────────────────
  const small = await page.evaluate(() => {
    const out = []
    for (const a of document.querySelectorAll('[class*="ndWrap"] a')) {
      const r = a.getBoundingClientRect()
      if (r.height > 0 && r.height < 44) out.push(`${(a.textContent || '').trim().slice(0, 24)} h=${Math.round(r.height)}`)
    }
    return out
  })
  check('every tap target in the page body clears 44px', small.length === 0, small.slice(0, 4).join(' | '))

  // ── 7b. THE CONSENT LANE, AND THE SCREENSHOT THAT NEARLY LIBELLED THE PAGE
  //
  // The full-page screenshot shows the cookie banner sitting squarely over the
  // nudge, which reads as block 6 being unreachable. IT IS A CAPTURE ARTEFACT:
  // Playwright composites a position:fixed element once, at its viewport
  // position, over a page image that keeps going underneath it. Reporting that
  // as a fault would be the avatar-renders-as-an-empty-yellow-square mistake
  // again — a screenshot read as a measurement.
  //
  // THE REAL QUESTION IS WHETHER A PERSON CAN GET TO IT, and that is answered
  // by scrolling to the bottom with the banner still up and asking what is
  // PAINTED at the nudge's own centre. `body` reserves --consent-h from the
  // shell so this should pass — but the banner has already covered the Apply
  // button on a job post and cost a real candidate an application, so "should"
  // is not the standard.
  const laneOk = await page.evaluate(async () => {
    const banner = [...document.querySelectorAll('[class*="CookieConsent"], [class*="cookie"]')]
      .find(el => el.checkVisibility?.() && getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().height > 40)
    // `html { scroll-behavior: smooth }` IS SET GLOBALLY IN app/globals.css, so
    // the first version of this — scrollTo then two animation frames — measured
    // a page that was STILL MOVING and reported the nudge as covered. That is
    // the check-that-races-an-animation fault, in the check written to test a
    // rule this project already learned the hard way.
    //
    // `behavior: 'instant'` overrides the CSS, and then the position is waited
    // on for STABILITY rather than for a number of frames: two reads that agree
    // and are not the starting value. "Different from the start" is not
    // "finished" — the repair can land mid-flight as easily as the original.
    const start = window.scrollY
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
    let last = -1, stable = 0
    for (let i = 0; i < 60 && stable < 2; i++) {
      await new Promise(r => setTimeout(r, 50))
      const y = Math.round(window.scrollY)
      if (y === last && y !== start) stable++; else stable = 0
      last = y
    }
    const nudge = document.querySelector('[class*="ndNudge"]')
    if (!nudge) return { skipped: 'no nudge on this account (every setup step done)' }
    const r = nudge.getBoundingClientRect()
    const painted = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return {
      bannerPresent: !!banner,
      bannerHeight: banner ? Math.round(banner.getBoundingClientRect().height) : 0,
      consentH: getComputedStyle(document.documentElement).getPropertyValue('--consent-h').trim(),
      bodyPadBottom: getComputedStyle(document.body).paddingBottom,
      covered: !!(banner && painted && (painted === banner || banner.contains(painted))),
      nudgeTop: Math.round(r.top),
      // PRINT THE VALUE YOU WAITED FOR.
      scrolledTo: Math.round(window.scrollY),
      pageBottom: Math.round(document.body.scrollHeight),
    }
  })
  if (laneOk.skipped) {
    note('consent lane: ' + laneOk.skipped)
  } else {
    check('the last block clears the cookie banner when scrolled to the foot', !laneOk.covered,
      `banner ${laneOk.bannerPresent ? laneOk.bannerHeight + 'px' : 'absent'}, --consent-h ${laneOk.consentH}, body pad ${laneOk.bodyPadBottom}, scrolled to ${laneOk.scrolledTo} of ${laneOk.pageBottom}, nudge top ${laneOk.nudgeTop}`)
    if (!laneOk.bannerPresent) note('NOTE: the banner was not up, so this run did not exercise the lane at all.')
  }
  await page.evaluate(() => window.scrollTo(0, 0))

  // ── 8. WHAT IS ON THE SCREEN, PRINTED ───────────────────────────────────
  // PRINT THE VALUE YOU WAITED FOR. Every number here is a fact about the
  // account that was driven, not about the account Paul films with.
  const seen = await page.evaluate(() => ({
    company: (document.querySelector('[class*="ndGreetCompany"]')?.textContent || '').trim(),
    greeting: (document.querySelector('[class*="ndGreetTitle"]')?.textContent || '').trim(),
    eyebrow: (document.querySelector('[class*="ndActionEyebrow"]')?.textContent || '').trim(),
    headline: (document.querySelector('[class*="ndActionHeadline"]')?.textContent || '').trim(),
    sub: (document.querySelector('[class*="ndActionSub"]')?.textContent || '').trim(),
    actionState: document.querySelector('[class*="ndAction"]')?.getAttribute('data-state') || '',
    adsAll: (document.querySelector('[class*="ndAdsAll"]')?.textContent || '').trim(),
    // `[class*="ndAdRow"]` also matched ndAdRowMain / ndAdRowTitle /
    // ndAdRowMeta, so every row printed four times, nested inside itself. The
    // double underscore is the CSS-module hash boundary and pins it to the row.
    rows: [...document.querySelectorAll('[class*="ndAdRow__"]')].map(r => (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 72)),
    nudge: (document.querySelector('[class*="ndNudgeMeta"]')?.textContent || '').trim(),
    // THE DECLARED VALUE IS `calc(70px + 0px)` — the safe-area term — so
    // parseInt on it is NaN, and NaN + 1 makes every comparison false whatever
    // the header does. The first run reported "68 vs calc(70px + 0px)" as a
    // FAILURE of a header that is comfortably inside its budget. It is resolved
    // by measuring a probe element rather than by parsing the string, which is
    // the only way to compare a declared value with a rendered one.
    navHeight: getComputedStyle(document.documentElement).getPropertyValue('--nav-height').trim(),
    navHeightPx: (() => {
      const probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--nav-height)'
      document.body.appendChild(probe)
      const h = probe.getBoundingClientRect().height
      probe.remove()
      return Math.round(h)
    })(),
    headerHeight: Math.round(document.querySelector('header')?.getBoundingClientRect().height || 0),
    headerBg: getComputedStyle(document.querySelector('header')).backgroundColor,
  }))
  console.log('')
  console.log('  ── what the screen actually says ─────────────────────────')
  console.log(`     company      ${seen.company}`)
  console.log(`     greeting     ${seen.greeting}`)
  console.log(`     action       [${seen.actionState}] ${seen.eyebrow} / ${seen.headline}`)
  if (seen.sub) console.log(`     sub          ${seen.sub}`)
  console.log(`     ads header   ${seen.adsAll}`)
  seen.rows.forEach(r => console.log(`     row          ${r}`))
  console.log(`     nudge        ${seen.nudge || '(none — every step done, or dismissed)'}`)
  console.log('')
  console.log('  ── block 1, measured rather than assumed ─────────────────')
  console.log(`     --nav-height declared ${seen.navHeight}, header renders ${seen.headerHeight}px`)
  console.log(`     header ground ${seen.headerBg}  (handoff draws ~56px on --rs-brand-navy #0f172a)`)
  // The DECLARED number and the RENDERED number are different numbers and the
  // stylesheet never disagrees with itself.
  check('the header does not exceed its declared --nav-height',
    seen.navHeightPx > 0 && seen.headerHeight <= seen.navHeightPx + 1,
    `renders ${seen.headerHeight}, declared resolves to ${seen.navHeightPx}`)

  await page.screenshot({ path: 'dashboard-390.scratch.png', fullPage: true })
  note('screenshot: dashboard-390.scratch.png  — LOOK AT IT. Every assertion above is about the DOM.')

  console.log('')
  console.log(bad === 0 ? `ALL CHECKS PASSED against ${BASE}` : `${bad} CHECK(S) FAILED against ${BASE}`)
  console.log('signed in as Thrive Test Employer — layout transfers, counts do not.')
  console.log('WebKit 393x852. NOT the shell: env(safe-area-inset-*) is 0 here and cannot be set from script.')
} catch (e) {
  // A run that DIED must not report success to anything reading the status.
  console.error('\nTHE DRIVE DID NOT FINISH: ' + (e && e.message ? e.message.split('\n')[0] : e))
  bad++
} finally {
  await browser.close()
}

process.exit(bad === 0 ? 0 : 1)
