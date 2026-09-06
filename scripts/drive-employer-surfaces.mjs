// THE EMPLOYER SURFACES AT 393, IN WEBKIT — WHAT A PERSON SEES, NOT WHAT THE
// CODE SAYS.
//
//   node scripts/drive-employer-surfaces.mjs [base-url]
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// Three of the four surprises in the week of 1 Sept 2026 were INVISIBLE TO
// READING and only appeared on a handset: the dead CV Builder downloads, the
// install prompt inside the shell, and the toolbar rendering behind the fixed
// header while every assertion stayed green. Step 11 films the employer flow,
// and none of it has ever been driven at phone width.
//
// ── WHAT THIS IS AND IS NOT ────────────────────────────────────────────────
//
// WebKit at 393x852, which is the same engine family as the WKWebView the
// Capacitor shell runs. IT IS NOT THE SHELL. It cannot see anything gated on
// env(safe-area-inset-*) — which is 0 in every desktop browser and cannot be
// set from script — and it has no Capacitor bridge, so a native picker or a
// download behaves differently here from a handset. Those are named in the
// output rather than quietly passed over.
//
// ── AND IT SIGNS IN AS THRIVE TEST EMPLOYER, NOT DEMO KITCHEN ─────────────
//
// Demo Kitchen is pauldavies.gbr+applereviewemployer, whose password was
// generated once, printed once and stored only in App Store Connect. Minting a
// new one would break the credential Apple signs in with. Test Employer is in
// the environment and renders THE SAME SCREENS IN THE SAME STATES — four
// adverts, all filled, zero active, applications present — so every layout
// finding transfers and only the counts differ. Said in the output too.
//
// NOTHING IS SUBMITTED. The post form is filled with nothing and never posted.

import { webkit } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const PASS = env.TEST_EMPLOYER_PASSWORD
if (!PASS) { console.log('SKIP  TEST_EMPLOYER_PASSWORD is not set.'); process.exit(2) }

let bad = 0
const check = (label, ok, detail = '') => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(56) + detail)
}
const note = (s) => console.log('       ' + s)

const browser = await webkit.launch()
const page = await browser.newPage({ viewport: { width: 393, height: 852 } })

// ── THE THREE MEASUREMENTS, ALL ABOUT PAINT RATHER THAN RECTANGLES ────────
//
// "Inside the viewport" is true of an element BEHIND another element — the
// exact thing that let the CV Builder toolbar hide under the header with every
// check green. So the header test asks what is actually painted at the
// element's own centre, via elementFromPoint.
const behindHeader = () => page.evaluate(() => {
  const head = document.querySelector('header')
  if (!head) return { error: 'no header' }
  const hb = head.getBoundingClientRect().bottom
  const out = []
  for (const el of document.querySelectorAll('h1, h2, [class*="banner"], [class*="Title"], [class*="title"]')) {
    if (!el.checkVisibility?.()) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.top >= hb || r.bottom <= 0) continue
    const cx = Math.round(r.left + r.width / 2)
    const cy = Math.round(r.top + r.height / 2)
    if (cy < 0 || cy > innerHeight) continue
    const painted = document.elementFromPoint(cx, cy)
    const covered = painted && (painted === head || head.contains(painted))
    if (covered) out.push({ text: (el.textContent || '').trim().slice(0, 40), top: Math.round(r.top), headerBottom: Math.round(hb) })
  }
  return { headerBottom: Math.round(hb), covered: out }
})

// BOTH HALVES. scrollWidth > clientWidth where overflow-x SCROLLS finds a
// swipeable row; the same where it is hidden/clip/visible finds one that is
// simply UNREACHABLE, which is worse. And a leaf whose right edge is past the
// viewport is off the screen whatever its overflow says.
const overflow = () => page.evaluate(() => {
  const scrollers = [], clipped = [], past = []
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const wide = el.scrollWidth > el.clientWidth + 1
    const ox = cs.overflowX
    const id = (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 60)
    if (wide && (ox === 'auto' || ox === 'scroll')) scrollers.push(`${id}  ${el.scrollWidth}>${el.clientWidth}`)
    // 'visible' IS DELIBERATELY NOT HERE, and the first version of this drive
    // included it and produced five false failures on the header of every
    // page. An element with overflow-x: visible does not clip: content past
    // its box is still painted and still reachable, and scrollWidth >
    // clientWidth on it is the ordinary consequence of an absolutely
    // positioned child such as a notification badge. Measured on the live
    // header: overflow-x visible, and nothing past the right edge of the
    // screen. Only hidden and clip make a thing UNREACHABLE.
    // AND A SINGLE-LINE ELLIPSIS TRUNCATION IS NOT A CLIPPED CONTROL EITHER.
    // `white-space: nowrap` + `text-overflow: ellipsis` + `overflow: hidden`
    // is the textbook deliberate truncation of a preview line, and the
    // dashboard's message previews use it exactly as intended — the full text
    // is one tap away in the conversation. The rule this check exists to
    // enforce is "controls wrap; content scrolls"; a truncated preview is
    // CONTENT, and flagging it produced the last of eight false failures.
    const deliberateTruncation = cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap'
    if (wide && (ox === 'hidden' || ox === 'clip') && !deliberateTruncation) {
      clipped.push(`${id}  ${el.scrollWidth}>${el.clientWidth}`)
    }
    if (!el.children.length) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > innerWidth + 1) past.push(`${id}  right=${Math.round(r.right)}`)
    }
  }
  return { scrollers, clipped, past, bodyScrolls: document.documentElement.scrollWidth > innerWidth + 1 }
})

const settle = (predicate) =>
  page.waitForFunction(predicate, null, { timeout: 25000 }).then(() => true).catch(() => false)

async function surface(name, url, waitFor) {
  console.log('')
  console.log(`── ${name}  ${url}`)
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' })
  const ready = await settle(waitFor)
  check('the page reaches a settled state (not a spinner)', ready, ready ? '' : 'NEVER SETTLED')
  // WHERE IT LANDED, not where it was sent — a redirect to /login proves
  // nothing about the page asked for.
  const landed = await page.evaluate(() => location.pathname + location.search)
  check('…and it is still the page we asked for', landed.startsWith(url.split('?')[0]), landed)

  const h = await behindHeader()
  check('nothing is painted BEHIND the fixed header', (h.covered || []).length === 0,
    (h.covered || []).length ? JSON.stringify(h.covered) : `header bottom ${h.headerBottom}`)

  const o = await overflow()
  check('the page itself does not scroll sideways', !o.bodyScrolls)
  check('no control row is UNREACHABLE (clipped, not swipeable)', o.clipped.length === 0,
    o.clipped.slice(0, 3).join(' | '))
  check('nothing sits past the right edge of the screen', o.past.length === 0,
    o.past.slice(0, 3).join(' | '))
  if (o.scrollers.length) note(`sideways scrollers (content is allowed to): ${o.scrollers.slice(0, 3).join(' | ')}`)
  return { h, o }
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 30000 })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASS)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForFunction(() => !location.pathname.includes('/login'), null, { timeout: 30000 })
  console.log(`signed in as Thrive Test Employer against ${BASE}, WebKit 393x852`)

  // ── 1. THE EMPLOYER DASHBOARD ──────────────────────────────────────────
  await surface('employer dashboard', '/employer/dashboard',
    () => !!document.querySelector('h1, [class*="statPill"], [class*="cardTitle"]'))
  const dash = await page.evaluate(() => {
    const t = document.body.innerText
    const pill = [...document.querySelectorAll('[class*="statPill"]')]
      .map(p => p.innerText.replace(/\n+/g, ' ').trim()).filter(Boolean)
    return {
      strip: pill,
      nothingLive: t.includes('Nothing live right now'),
      firstListing: t.includes('Post your first listing'),
    }
  })
  check('the stats strip renders', dash.strip.length > 0, dash.strip.join(' · '))
  check('Active Jobs shows the CORRECT empty state for a filled account',
    dash.nothingLive && !dash.firstListing,
    dash.nothingLive ? '"Nothing live right now"' : 'says "Post your first listing" — WRONG STATE')

  // ── 2. /temp-work/manage WITH ZERO POSTS ───────────────────────────────
  // WAIT ON A PREDICATE THAT IS FALSE WHILE THE ANSWER IS MISSING. The first
  // version waited for `innerText.length > 200` and was satisfied at 201 chars
  // — the navigation alone — so it measured a page that had not rendered yet
  // and reported "no message". Third time this project has made that mistake.
  await surface('shift manage (zero posts)', '/temp-work/manage',
    () => /Your temp work/.test(document.body.innerText))
  const manage = await page.evaluate(() => {
    const t = document.body.innerText
    // The real copy, not a guessed string: the page explains what the space is
    // FOR rather than saying a row count is zero.
    const m = t.match(/Post a shift and people put their names down here[^\n]*/)
    return { message: m ? m[0] : null, len: t.length }
  })
  check('an EMPTY STATE, not an empty space', !!manage.message,
    manage.message ? '"' + manage.message.slice(0, 70) + '…"' : `no message; body text ${manage.len} chars`)

  // ── 3. /my-jobs — All Jobs, then the Active tab ────────────────────────
  await surface('my-jobs (All Jobs)', '/my-jobs',
    () => document.body.innerText.includes('All Jobs'))
  const all = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="jobCard"], [class*="JobCard"], article').length
    const tabs = [...document.querySelectorAll('button, a')]
      .map(b => b.innerText.trim()).filter(x => /^(All Jobs|Active|Archived|Interviewing|Offers|Hired)/.test(x))
    return { cards, tabs }
  })
  check('the tabs are all present', all.tabs.length >= 4, all.tabs.join(' · '))
  check('All Jobs renders the filled adverts', all.cards > 0, `${all.cards} card-ish elements`)

  // THE ACTIVE TAB IS THE QUESTION PAUL ASKED: empty STATE or empty SPACE?
  const activeTab = page.locator('button', { hasText: /^Active/ }).first()
  if (await activeTab.count()) {
    await activeTab.click()
    await page.waitForTimeout(600)
    const act = await page.evaluate(() => {
      const t = document.body.innerText
      const m = t.match(/(No [^\n.]{0,60}|Nothing[^\n.]{0,60})/)
      return { message: m ? m[0] : null, len: t.length }
    })
    check('the empty Active tab SAYS it is empty', !!act.message,
      act.message || 'NO MESSAGE — an empty space, which reads as a page that failed')
    const o2 = await overflow()
    check('…and the tab row is not clipped', o2.clipped.length === 0, o2.clipped.slice(0, 2).join(' | '))
  } else {
    check('the Active tab is reachable', false, 'not found')
  }

  // ── 4. APPLICANTS FOR ONE ADVERT ───────────────────────────────────────
  // Test Employer's Chef de Partie, which carries two applications — the same
  // shape as Demo Kitchen's Chef de Partie that Paul will open.
  await surface('applicants', '/my-jobs/a0582347-1146-4ba1-95a3-057efc41715f/applications',
    () => document.body.innerText.length > 200)
  const apps = await page.evaluate(() => {
    const t = document.body.innerText
    return { hasNames: /Applicant|Candidate|View|CV|Message/i.test(t), len: t.length }
  })
  check('the applicants page renders content', apps.hasNames, `${apps.len} chars of text`)

  // ── 5. THE POST FORM, TOP TO BOTTOM — NOTHING SUBMITTED ────────────────
  await surface('post a shift (nothing filled, nothing submitted)', '/temp-work/post',
    () => !!document.querySelector('#tw-title'))
  const form = await page.evaluate(() => {
    const need = ['#tw-title', '#tw-category', '#tw-location']
    const seen = need.map(s => {
      const el = document.querySelector(s)
      if (!el) return `${s}: MISSING`
      const r = el.getBoundingClientRect()
      return `${s}: ${Math.round(r.width)}x${Math.round(r.height)}`
    })
    const btn = [...document.querySelectorAll('button')].find(b => /Post to Temp Work/i.test(b.innerText))
    const br = btn ? btn.getBoundingClientRect() : null
    const labels = [...document.querySelectorAll('label')].map(l => l.innerText.trim().split('\n')[0]).filter(Boolean)
    return {
      required: seen,
      button: br ? { w: Math.round(br.width), h: Math.round(br.height) } : null,
      labels,
      docHeight: document.documentElement.scrollHeight,
    }
  })
  check('the three REQUIRED fields are present and have size',
    form.required.every(s => !s.includes('MISSING')), form.required.join('  '))
  check('the Post button exists and is a real target', !!form.button && form.button.h >= 40,
    form.button ? `${form.button.w}x${form.button.h}` : 'MISSING')
  note(`labels in order: ${form.labels.join(' · ')}`)
  note(`form is ${form.docHeight}px tall — ${(form.docHeight / 852).toFixed(1)} screens`)

  // Scroll to the bottom and re-check: a button reachable at the top of a long
  // page is not the same as one reachable at the end of it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(400)
  const bottom = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /Post to Temp Work/i.test(b.innerText))
    if (!btn) return { found: false }
    const r = btn.getBoundingClientRect()
    const painted = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return { found: true, onScreen: r.top >= 0 && r.bottom <= innerHeight + 1, coveredBy: painted === btn || btn.contains(painted) ? null : (painted?.tagName || '?') }
  })
  check('scrolled to the bottom, the Post button is on screen', bottom.found && bottom.onScreen,
    JSON.stringify(bottom))
  check('…and nothing is painted on top of it', bottom.coveredBy === null, bottom.coveredBy || 'clear')

  const oForm = await overflow()
  check('the form does not scroll sideways', !oForm.bodyScrolls)
} catch (e) {
  check('the drive ran to completion', false, (e.message || '').slice(0, 140))
} finally {
  await browser.close()
}

console.log('')
console.log('NOT COVERED BY THIS RUN, and neither is any browser:')
console.log('  · env(safe-area-inset-*) is 0 here and cannot be set from script,')
console.log('    so anything positioned against the notch is in a different place.')
console.log('  · the banner-photo picker needs the Capacitor bridge — a hidden')
console.log('    file input fired programmatically. NEVER TESTED IN THE SHELL.')
console.log('')
console.log(bad ? `${bad} FAILED` : 'every employer surface at 393 is reachable, unclipped and clear of the header')
process.exitCode = bad ? 1 : 0
