// THE CONVERSATION HEADER AND COMPOSER, ON A PHONE.
//
//   node scripts/drive-conversation-header-390.mjs [base-url]
//
// Signs in, opens the fixture thread, and MEASURES. It never taps Report or
// Block — both write a row, and one of them closes the thread Paul is about to
// film.
//
// ── THE THREE THINGS IT MEASURES, AND WHY EACH NEEDS THE SCREEN ──────────
//
// 1. THE TWO ICONS. Report and Block sit side by side. A source grep cannot
//    tell you they are the same glyph: both are <Ico name="…"/> with DIFFERENT
//    names in the file, and the question is whether the DRAWN paths differ. So
//    this reads each rendered <svg> and compares the actual path data.
//
// 2. THE HEADER WRAPPING. Measured as rendered height against the height of
//    one line of the same text, so "it wraps" is a number rather than an
//    opinion — and the header's total height is given as a share of the
//    viewport, because that is what a person experiences.
//
// 3. THE COMPOSER OVER THE LAST MESSAGE. Paul asked whether this is the
//    two-z-index-scales fault already on the open list or something new. Those
//    have different fixes, so this reads BOTH: every stacking context each
//    element sits in, AND whether the message scroller reserves room for the
//    composer at all. A composer correctly painted on top of a list that
//    reserves nothing is not a z-index fault — raising a z-index would not
//    move it by a pixel.
//
// ── TWO THINGS THIS DRIVE GOT WRONG FIRST, KEPT AS COMMENTS ──────────────
//
// A DESKTOP CHROMIUM AT 390px IS NOT A PHONE. The first run used a bare
// { width: 390 } viewport and rendered the DESKTOP TWO-PANE layout, clipped
// sideways — which very nearly went into a report as "the messages page
// overflows horizontally". It does not: on an iPhone 14 Pro profile
// document.scrollWidth is 393 against a 393 viewport. The device descriptor
// carries the user agent, the scale factor, isMobile and hasTouch, and the
// layout is only correct with them.
//
// AND AN UNSEEDED DRIVE IS THE FIRST-EVER VISIT. The second run photographed
// 250px of cookie banner sitting exactly where the composer is, so the one
// thing it existed to measure was behind it. The banner is seeded away here.

import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
import { loadEnv } from './lib/rls-probe.mjs'
import { withSeededStorage } from './lib/seed-storage.mjs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'

// WHICH SIDE OF THE THREAD THIS DRIVES, AND WHY IT IS THE EMPLOYER.
//
// Paul drove the CANDIDATE side as Marcus. I cannot: Marcus's password is not
// in the environment and I will not mint one for the account pasted into App
// Store Connect. The `+candidate` fixture has NO conversations at all —
// /messages renders "No conversations yet" for it — so it cannot answer this
// either. The employer fixture is participant_1 of the same thread.
//
// `app/messages/page.tsx` is ONE file serving both roles, so the header is the
// same component with the same two controls. The only difference is the name
// in the Block label: "Block Marcus Hale" here against "Block Test Employer"
// on Paul's screen — and Marcus's name is the LONGER of the two once it wraps,
// so this does not understate the problem. Said out loud rather than glossed,
// because a measurement that does not name the state it was taken in cannot be
// re-checked by the next person.
const CORRESPONDENT = /Marcus/i
const EMAIL = 'pauldavies.gbr+employer@gmail.com'

// READ THE SECRET FROM THE ENVIRONMENT INSIDE THE SCRIPT — and from
// .env.local, because a bare `node scripts/…` does not load it. Other drives
// read process.env directly and SKIP on a machine where the key is sitting in
// the file three feet away, which reads as a missing credential rather than a
// missing loader.
const env = loadEnv()
const PASSWORD = process.env.TEST_EMPLOYER_PASSWORD || env.TEST_EMPLOYER_PASSWORD
if (!PASSWORD) { console.error('SKIP  TEST_EMPLOYER_PASSWORD not set'); process.exit(2) }
const SHOTS = 'drive-shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'] })
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await withSeededStorage(page, 'consentAccepted')
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })

// FILL AFTER HYDRATION, NOT AFTER domcontentloaded.
// Against production this worked by luck; against a dev server the fill landed
// in an input React then re-rendered empty, the form submitted blank, and the
// drive sat on /login for two minutes — which reads as a wrong password. The
// wait is on the control BEING INTERACTIVE, not on a clock.
await page.locator('#login-email').waitFor({ state: 'visible', timeout: 60000 })
await page.waitForFunction(() => {
  const b = document.querySelector('button[type="submit"]')
  return !!b && !b.disabled
}, undefined, { timeout: 60000 })
await page.fill('#login-email', EMAIL)
await page.fill('#login-password', PASSWORD)
// AND THE FILL REALLY TOOK. An input React re-rendered empty is the fault
// above; asserting the value is the one thing that can tell the two apart.
const filled = await page.evaluate(() => document.querySelector('#login-email').value.length)
if (!filled) throw new Error('the email field is empty after fill — the form had not hydrated')
// .first(), AND NOT A BARE page.click('button[type="submit"]').
// There are TWO submit buttons on /login: the panel's "Log in" and the Ask
// Thrive chat widget's send arrow. The chat widget winning a submit-button
// selector is already in CLAUDE.md; this is the same widget and the same trap.
await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
await page.waitForTimeout(300)
await page.locator('button[type="submit"]:not([disabled])').first().click()
// RECORD WHERE IT LANDED, NOT WHERE IT WAS SENT. An allowlist of landing
// routes went red against a dev server that simply took longer to compile the
// next route — which reads as a broken sign-in. The question this needs
// answered is "am I still on the login page", and the answer is printed.
// POLL page.url(), DO NOT waitForURL. waitForURL waits for a NAVIGATION EVENT
// as well as the predicate; against a dev server it sat for two minutes on a
// page that had already moved to /employer/dashboard, which reads as a broken
// sign-in and is a harness fault. The question is "what is the URL now".
for (let i = 0; i < 120 && /\/login/.test(page.url()); i++) await page.waitForTimeout(1000)
if (/\/login/.test(page.url())) throw new Error('still on the login page after 120s')
console.log('signed in as ' + EMAIL + ' — the EMPLOYER side of the fixture thread')
console.log('landed on: ' + page.url().replace(BASE, ''))

await page.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' })
// waitForFunction(fn, ARG, OPTIONS) — THREE ARGUMENTS, IN THAT ORDER.
// Written as waitForFunction(fn, { timeout }) the object lands in the ARG slot
// and the timeout is silently the default 30s. That cost twenty minutes here:
// the file said 120000, the error said 30000, and both were telling the truth.
// A signature that accepts the wrong shape without complaining is the same
// family as everything else in this file.
await page.waitForFunction((who) => new RegExp(who, 'i').test(document.body.innerText || ''),
  CORRESPONDENT.source, { timeout: 120000 })

// A REAL CLICK, THROUGH PLAYWRIGHT. The first version collected
// `button, [role="button"], li, a` and called .click() on the match; the
// thread row is a plain <div> with an onClick, so it matched nothing and the
// drive reported "opened a thread: false" — which reads as a broken list
// rather than a selector that cannot reach the control.
await page.getByText(CORRESPONDENT).first().click()
// WAIT FOR BOTH CONTROLS, NOT ONE.
// The first version waited only on the report control and then reported the
// block button "not found" — BlockControl carries a three-state
// `blocked: boolean | null` and renders nothing until its own query returns, so
// the measurement was taken on a header with one fewer child and gave a
// DIFFERENT geometry for the button that was there. Waiting on one control is
// not waiting on the other.
await page.waitForFunction(() =>
  !!document.querySelector('[data-report-control="message"]') &&
  !!document.querySelector('[data-block-control]'),
undefined, { timeout: 120000 })

// THE BANNER REALLY IS GONE. A seeded state is a claim until something on the
// page confirms it — seed-storage once returned the key it had set while
// writing the wrong store entirely.
const banner = await page.evaluate(() => /We use cookies to improve/.test(document.body.innerText || ''))
console.log('cookie banner present: ' + banner + (banner ? '   <-- the seed did not take' : ''))

const m = await page.evaluate(() => {
  const round = n => Math.round(n * 10) / 10
  const rect = el => { const r = el.getBoundingClientRect(); return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height), bottom: round(r.bottom) } }

  // Every ancestor that FORMS a stacking context, and the property that does
  // it. A z-index comparison between elements in different contexts is
  // meaningless, which is why this walks rather than compares numbers.
  const contexts = (el) => {
    const out = []
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n)
      const why = []
      if (cs.position !== 'static' && cs.zIndex !== 'auto') why.push(`${cs.position}+z${cs.zIndex}`)
      if (cs.transform !== 'none') why.push('transform')
      if (cs.opacity !== '1') why.push('opacity')
      if (cs.filter !== 'none') why.push('filter')
      if (cs.isolation === 'isolate') why.push('isolation')
      if (cs.contain && /paint|layout|strict|content/.test(cs.contain)) why.push('contain')
      if (why.length) out.push(`${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]} [${why.join(',')}]`)
    }
    return out.length ? out : ['(none — it is in the root stacking context)']
  }

  const glyph = (el) => {
    const s = el && el.querySelector('svg')
    if (!s) return 'NO SVG'
    return [...s.querySelectorAll('path, rect, circle, line, polyline, polygon')]
      .map(p => p.tagName + ':' + (p.getAttribute('d') || p.getAttribute('points') || ''))
      .join(' | ')
  }

  const report = document.querySelector('[data-report-control="message"]')
  // FIND IT BY ITS DATA ATTRIBUTE, NOT BY ITS LABEL.
  // Both header controls are now ICON-ONLY, so their textContent is empty and
  // the label lives in aria-label. A finder written against the visible text
  // reported the block button MISSING on the very change that fixed it — a
  // check that could not survive the thing it was checking.
  const block = document.querySelector('[data-block-control]')

  // The header band is the common ancestor of the two controls.
  let header = report
  while (header && block && !header.contains(block)) header = header.parentElement

  // ONE LINE OF THE SAME TEXT, MEASURED RATHER THAN ASSUMED. A clone with
  // white-space:nowrap in the same place gives the height this button would be
  // if it did not wrap — so "it wrapped" is a comparison, not a threshold I
  // picked.
  const oneLine = (el) => {
    if (!el) return null
    const c = el.cloneNode(true)
    c.style.whiteSpace = 'nowrap'
    c.style.position = 'absolute'
    c.style.visibility = 'hidden'
    c.style.width = 'auto'
    el.parentElement.appendChild(c)
    const r = c.getBoundingClientRect()
    const out = { h: round(r.height), w: round(r.width) }
    c.remove()
    return out
  }

  const ta = document.querySelector('textarea')
  // The composer bar: the nearest ancestor of the textarea that is positioned,
  // or the input area block if none is.
  let bar = ta
  while (bar && bar !== document.body && getComputedStyle(bar).position === 'static') bar = bar.parentElement
  const inputArea = ta ? ta.closest('[class*="chatInputArea"]') || bar : null

  // The LAST MESSAGE BUBBLE — inside the thread pane, not the conversation
  // list. The list also renders the same text as a preview, and picking that
  // one up is how the first version of this drive measured the wrong element.
  // SCOPE TO THE SCROLLER, NOT TO THE PANEL. The panel includes the header,
  // and the first version of this drive picked up "Chef de Partie" — the
  // correspondent's ROLE, in the header — as the last message. The conversation
  // LIST renders the same text as a preview, which is the other way to measure
  // the wrong element.
  const scroller = document.querySelector('[class*="messagesArea"]')
  const bubbles = scroller ? [...scroller.querySelectorAll('[class*="messageText"]')] : []
  const last = bubbles[bubbles.length - 1] || null

  return {
    viewport: { w: innerWidth, h: innerHeight },
    report: report ? { text: report.textContent.trim(), ...rect(report), glyph: glyph(report), oneLine: oneLine(report) } : null,
    block: block ? { text: block.textContent.trim(), ...rect(block), glyph: glyph(block), oneLine: oneLine(block) } : null,
    header: header && header !== document.documentElement ? { cls: String(header.className).split(' ')[0], ...rect(header) } : null,
    composer: inputArea ? {
      cls: String(inputArea.className).split(' ')[0],
      position: getComputedStyle(inputArea).position,
      z: getComputedStyle(inputArea).zIndex,
      ...rect(inputArea),
      contexts: contexts(inputArea),
    } : null,
    lastMessage: last ? { text: last.textContent.trim().slice(0, 50), ...rect(last), contexts: contexts(last) } : null,
    scroller: scroller && scroller !== document.body ? {
      cls: String(scroller.className).split(' ')[0],
      ...rect(scroller),
      paddingBottom: getComputedStyle(scroller).paddingBottom,
      scrollH: scroller.scrollHeight,
      clientH: scroller.clientHeight,
      atBottom: scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 2,
    } : null,
  }
})

const line = (k, v) => console.log('  ' + String(k).padEnd(24) + v)

console.log('')
console.log(`viewport ${m.viewport.w} x ${m.viewport.h}  (iPhone 14 Pro profile)`)

console.log('')
console.log('── 2. THE TWO ICONS ──────────────────────────────────────────────')
console.log('')
if (!m.report || !m.block) {
  console.log('  one of the two controls was not found — report=' + !!m.report + ' block=' + !!m.block)
} else {
  line('report button', `"${m.report.text}"`)
  line('block button', `"${m.block.text}"`)
  console.log('')
  line('report glyph', m.report.glyph.slice(0, 110))
  line('block glyph', m.block.glyph.slice(0, 110))
  console.log('')
  console.log('  THE SAME DRAWN GLYPH: ' +
    (m.report.glyph === m.block.glyph ? 'YES — byte-identical path data' : 'no — the paths differ'))
}

console.log('')
console.log('── 3. DOES THE HEADER FIT? ───────────────────────────────────────')
console.log('')
for (const [name, b] of [['report', m.report], ['block', m.block]]) {
  if (!b) continue
  const lines = b.oneLine && b.oneLine.h ? Math.round((b.h / b.oneLine.h) * 10) / 10 : '?'
  line(name + ' rendered', `${b.w} x ${b.h} at x=${b.x} y=${b.y}`)
  line(name + ' on one line', `${b.oneLine.w} x ${b.oneLine.h}`)
  line(name + ' => lines', `${lines}   ` + (b.oneLine && b.h > b.oneLine.h + 1 ? 'IT WRAPS' : 'fits on one line'))
  console.log('')
}
if (m.report && m.block) {
  const need = Math.round(m.report.oneLine.w + m.block.oneLine.w)
  line('unwrapped, both need', `${need}px of a ${m.viewport.w}px bar — before the back arrow, the`)
  line('', 'avatar, the name and the role, which share the same row')
}
if (m.header) {
  const pct = Math.round((m.header.h / m.viewport.h) * 1000) / 10
  console.log('')
  line('the header band', `${m.header.w} x ${m.header.h}  =  ${pct}% of the visible screen`)
}

console.log('')
console.log('── 4. THE COMPOSER OVER THE LAST MESSAGE ─────────────────────────')
console.log('')
if (!m.composer) { console.log('  no composer found') } else {
  line('composer', `.${m.composer.cls}`)
  line('  position', `${m.composer.position}   z-index=${m.composer.z}`)
  line('  box', `y=${m.composer.y} h=${m.composer.h} bottom=${m.composer.bottom}`)
  console.log('  stacking contexts it sits inside:')
  for (const c of m.composer.contexts) console.log('      ' + c)
}
console.log('')
if (m.lastMessage) {
  line('last message', `"${m.lastMessage.text}"`)
  line('  box', `y=${m.lastMessage.y} h=${m.lastMessage.h} bottom=${m.lastMessage.bottom}`)
  console.log('  stacking contexts it sits inside:')
  for (const c of m.lastMessage.contexts) console.log('      ' + c)
}
console.log('')
if (m.scroller) {
  line('message scroller', `.${m.scroller.cls}`)
  line('  padding-bottom', m.scroller.paddingBottom)
  line('  box', `y=${m.scroller.y} h=${m.scroller.h} bottom=${m.scroller.bottom}`)
  line('  scrolled to bottom', String(m.scroller.atBottom))
}

console.log('')
if (m.composer && m.lastMessage) {
  const overlap = Math.round((m.lastMessage.bottom - m.composer.y) * 10) / 10
  console.log('  last message bottom - composer top = ' + overlap + 'px')
  console.log('  ' + (overlap > 0
    ? 'THE MESSAGE ALREADY RUNS UNDER THE COMPOSER, WITH NO KEYBOARD.'
    : 'no overlap at this height. A keyboard raises the composer, so an overlap'))
  if (overlap <= 0) console.log('  starts once the composer moves up by more than ' + Math.abs(overlap) + 'px.')
}
// ── THE DISCRIMINATOR ─────────────────────────────────────────────────────
//
// THE FIRST VERSION OF THIS BLOCK WAS WRONG AND ALMOST WENT INTO A REPORT.
// It compared the scroller's padding-bottom against the composer's height and
// concluded "not enough is reserved — a missing reservation". That comparison
// only means anything if the composer OVERLAYS the scroller. It does not: it
// is position:static, flex-shrink:0, in normal flow, and the scroller's bottom
// edge IS the composer's top edge. Nothing needs reserving; the flex column
// already does it. A check that assumes the fault it is looking for will find
// it — which is the whole family this codebase keeps cataloguing.
if (m.composer && m.scroller) {
  const overlays = /fixed|absolute|sticky/.test(m.composer.position) &&
    m.composer.y < m.scroller.bottom - 1
  console.log('')
  console.log('  ── THE DISCRIMINATOR PAUL ASKED FOR ──')
  console.log('    is the composer drawn OVER the message list? ' + (overlays ? 'YES' : 'NO'))
  console.log('      composer position=' + m.composer.position + '  top=' + m.composer.y)
  console.log('      scroller bottom=' + m.scroller.bottom)
  if (overlays) {
    const reserved = parseFloat(m.scroller.paddingBottom) || 0
    console.log('    it overlays, so the reservation matters: ' + reserved +
      'px reserved against a ' + m.composer.h + 'px composer.')
    console.log('    ' + (reserved >= m.composer.h
      ? 'ENOUGH IS RESERVED — an overlap would then be a stacking/positioning fault.'
      : 'NOT ENOUGH IS RESERVED — a missing reservation, not a z-index fault.'))
  } else {
    console.log('    IT DOES NOT OVERLAY. The composer is in normal flow BELOW the list, and')
    console.log('    the list ends exactly where the composer begins. There is nothing to')
    console.log('    reserve and nothing stacked, so this is NEITHER of the two candidates.')
  }
  const anyZ = [...m.composer.contexts, ...(m.lastMessage ? m.lastMessage.contexts : [])]
    .some(c => /\+z\d/.test(c))
  console.log('')
  console.log('    ANY z-index IN PLAY IN THE CHAT AT ALL: ' + (anyZ ? 'yes' : 'NO — every element is z-index:auto'))
  console.log('    ' + (anyZ
    ? '    so the two-z-index-scales entry is worth checking against this.'
    : '    so it CANNOT be the two-z-index-scales fault on the open list.'))
}

// A DESKTOP BROWSER HAS NO SOFTWARE KEYBOARD, so the keyboard-up state cannot
// be reproduced here and this drive does not claim to. What it answers is
// whether the list reserves room for the composer's CURRENT height — if it
// does not, the keyboard only makes an existing overlap taller.
await page.screenshot({ path: `${SHOTS}/conversation-iphone.png` })
console.log('')
console.log(`shot: ${SHOTS}/conversation-iphone.png`)

await browser.close()
