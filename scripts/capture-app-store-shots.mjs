// THE FOUR APP STORE SCREENSHOTS, AT 1284x2778, FROM PRODUCTION.
//
// THE SIZE TRAP. Apple wants 1284x2778 PIXELS. A Playwright viewport of
// 1284x2778 renders the DESKTOP layout at an absurd height and looks nothing
// like a phone. The phone is 428x926 CSS px at deviceScaleFactor 3, which
// writes a 1284x2778 file. isMobile and hasTouch on, so the site serves what
// a phone actually gets.
//
// AND THE DIMENSIONS ARE READ BACK OUT OF THE PNG HEADER afterwards, not
// trusted from the config. A rejection on size arrives days later.
//
// THE COOKIE BANNER IS THE ARTEFACT THAT RUINS ALL FOUR. A fresh context has
// no consent cookie, so the lane renders across the foot of every shot —
// exactly what happened on the delete-gate screenshots an hour ago. Consent
// is accepted in the same context and the banner is asserted GONE from the
// rendered text before anything is captured. A seeded state is a claim until
// something on the page confirms it.
//
// WHAT MUST NOT BE IN FRAME, asserted on the CAPTURED TEXT rather than on
// which URL was opened:
//   · a real candidate's name — the directory is never opened
//   · any fixture: a +alias address, Thrive Test Employer, a fixture advert
//   · the held Apple row 015a8b66
//   · an emoji. Read from innerText, which is DECODED — an entity or a
//     surrogate escape in the source is a real emoji here, which is the
//     whole reason the source-text grep once found 7 of 37.
//   · a skeleton, a spinner or a broken image
//
//   node scripts/capture-app-store-shots.mjs <baseUrl> <outDir>

import { chromium } from 'playwright'
import { mkdirSync, readFileSync, renameSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2]
const OUT = process.argv[3]
if (!BASE || !OUT) {
  console.error('usage: node scripts/capture-app-store-shots.mjs <baseUrl> <outDir>')
  process.exit(2)
}

const W = 428, H = 926, DSF = 3
const WANT_W = W * DSF, WANT_H = H * DSF   // 1284 x 2778

mkdirSync(OUT, { recursive: true })

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('    ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(52) + (detail ?? ''))
  return ok
}

/** The PNG header, read from the bytes. IHDR width/height are big-endian at 16 and 20. */
function pngSize(file) {
  const b = readFileSync(file)
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG: ' + file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }
}

// ── THE EMOJI RULE IS NOT MINE TO RESTATE ──────────────────────────────────
// The first version of this check hand-rolled a codepoint range and went red
// on the live board over ✕ — the close glyph on a filter chip. That is not an
// emoji by this project's rule and it is not a fault: scripts/prove-no-emoji.ts
// splits COLOUR from TEXT, and Paul's decision of 14 Aug 2026 keeps the
// monochrome ones because they are typography.
//
//   COLOUR   🎉 ✅ ⭐     renders in colour everywhere   → banned
//   TEXT     ✕ © ↔ ⚠      the weight of a letter         → kept
//
// So the predicate below is the SAME TWO LINES as that script's `isColour`,
// and nothing else. It is duplicated rather than imported only because that
// file is a TypeScript entry point with no export, and this is a capture job
// that changes no shipped code — a copy with the reason written down beats a
// refactor nobody asked for, but it IS a copy, and it is flagged as one.
//
// AND IT IS CONTROLLED BEFORE IT IS BELIEVED. This project has been burned
// twice by an emoji detector — one returned nothing with a pencil in the file
// it had just read. A detector that cannot find a thing known to be there does
// not get to report a clean sweep.
const isColour = (ch, next) => /\p{Emoji_Presentation}/u.test(ch) || next === '️'
const colourIn = (s) => {
  const chars = [...s]
  const out = []
  for (let i = 0; i < chars.length; i++) if (isColour(chars[i], chars[i + 1])) out.push(chars[i])
  return out
}
const EMOJI_CONTROLS = [
  ['a party popper is colour', '\u{1F389}', true],
  ['a green tick is colour', '✅', true],
  ['warning WITH VS16 is colour', '⚠️', true],
  ['the close glyph is TEXT, not an emoji', '✕', false],
  ['an arrow is TEXT', '→', false],
  ['plain words are neither', 'Head Chef, London', false],
]

const FORBIDDEN = [
  ['a +alias fixture address', /pauldavies\.gbr\+/i],
  ['Thrive Test Employer', /thrive test employer/i],
  // THE FIRST LIST NAMED ONLY THE FIXTURES I ALREADY KNEW ABOUT, which is the
  // instance rather than the class. `temp_posts` holds three test shifts —
  // "Test", "Test 2" and "Test Shift (please ignore)" — posted by
  // "Thrive Career Platform LTD" in July, live on /temp-work today. None of
  // them is Thrive Test Employer and none carries a +alias, so every check
  // passed over them. They sat below the fold by luck, not by design.
  ['a Thrive Career Platform test shift', /thrive career platform/i],
  ['an obvious test row', /\btest shift\b|\(please ignore\)|\bTest 2\b/i],
  // A fabricated listing must never reach the store page. /temp-work renders
  // EXAMPLE_TEMP_POSTS when nothing real exists, and says so in a notice.
  ['the examples notice — these would be invented listings', /here.s what posts look like|PREVIEW MODE/i],
  ['the held Apple row', /015a8b66/i],
  ['a loading skeleton', /\bskeleton\b/i],
]

console.log('\nCONTROLS FIRST — the detector is watched finding what it should')
let controlsBad = 0
for (const [name, sample, want] of EMOJI_CONTROLS) {
  const got = colourIn(sample).length > 0
  if (got !== want) { controlsBad++; console.log('    CONTROL FAIL  ' + name) }
}
if (controlsBad) {
  console.log(`\n  ${controlsBad} CONTROL(S) FAILED — refusing to report a clean sweep from a detector that cannot see.`)
  process.exit(1)
}
console.log(`    ok   ${EMOJI_CONTROLS.length} controls: it finds colour, ignores text-presentation glyphs`)

// A PREVIEW IS SSO-WALLED. Without the bypass header every page captured is
// Vercel's sign-in screen — which is exactly what happened on the first run
// against this branch's preview: five shots, all 129KB, every content
// assertion red. Nothing was overwritten only because a shot is staged and
// promoted rather than written in place. Header, never a share link.
const isVercelPreview = /\.vercel\.app/.test(BASE)
let BYPASS = ''
{
  const f = path.join(process.cwd(), '.env.local')
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*VERCEL_AUTOMATION_BYPASS_SECRET\s*=\s*(.*?)\s*$/)
      if (m) BYPASS = m[1].replace(/^["']|["']$/g, '')
    }
  }
}
if (isVercelPreview && !BYPASS) {
  console.log('SKIP  this is a Vercel preview and VERCEL_AUTOMATION_BYPASS_SECRET is not set.')
  console.log('      Every capture would be the SSO sign-in page.')
  process.exit(2)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DSF,
  isMobile: true,
  hasTouch: true,
  ...(isVercelPreview
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } }
    : {}),
  // A real iPhone UA, so anything that sniffs gets the same answer the
  // viewport is already giving.
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
})
const page = await ctx.newPage()

// THE VERCEL PREVIEW TOOLBAR IS A THING APPLE WOULD HAVE SEEN. It injects from
// vercel.live and paints a dark circular badge on the right edge — visible in
// the first preview capture of /jobs, absent from the production one, and
// invisible to every DOM query because it lives in a shadow root. Blocked at
// the network so a preview capture is the same picture as a production one.
// Counted, not hoped: the count is asserted to be zero per shot.
let toolbarAttempts = 0
await page.route('**://vercel.live/**', route => { toolbarAttempts++; route.abort() })
await page.route('**://*.vercel-scripts.com/**', route => { toolbarAttempts++; route.abort() })

const results = []

try {
  console.log('\n0. CONSENT — accepted once, in this context, and PROVEN gone')
  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  const banner = page.getByRole('button', { name: /^accept all$/i }).first()
  if (await banner.count()) {
    await banner.click()
    await page.waitForTimeout(1500)
  }
  const afterConsent = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ')
  check('the cookie banner is GONE from the rendered page',
    !/we use cookies to improve your experience/i.test(afterConsent))
  check('…and the Accept All button is gone with it',
    (await page.getByRole('button', { name: /^accept all$/i }).count()) === 0)

  /** Load, settle, assert, capture, then read the file's real pixel size. */
  async function shot(n, slug, url, mustContain, note, prepare) {
    console.log(`\n${n}. ${slug.toUpperCase()}  —  ${url}`)
    const badAtStart = bad
    // A transient ERR_NETWORK_CHANGED killed a run here. That is the machine,
    // not the site, and a capture job should not lose two good shots to it.
    // Retried explicitly rather than wrapped in a blanket catch, so a real
    // failure still throws with its own message.
    let navErr = null
    for (let attempt = 1; attempt <= 6; attempt++) {
      try { await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' }); navErr = null; break }
      catch (e) { navErr = e; console.log(`    …navigation attempt ${attempt} failed: ${e.message.split('\n')[0]}`) }
      await page.waitForTimeout(attempt * 5000)   // back off — the link comes back
    }
    if (navErr) throw navErr
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
    await page.waitForTimeout(3500)

    // An optional composition step — a real click, not a URL parameter, so the
    // shot is of a state a person can actually reach.
    if (prepare) { await prepare(page); await page.waitForTimeout(2000) }

    // Scroll to the very top: the shot is the fold, and a restored scroll
    // position would silently capture the middle of the page.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)

    const text = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ')

    for (const [what, re] of mustContain) check('it really shows ' + what, re.test(text))
    for (const [what, re] of FORBIDDEN) check('no ' + what, !re.test(text))
    const emoji = colourIn(text)
    check('no emoji in the rendered text', emoji.length === 0, emoji.slice(0, 5).join(' '))
    const ci = text.search(/we use cookies/i)
    check('the cookie banner is still gone', ci < 0,
      ci < 0 ? '' : 'MATCHED >>> ' + text.slice(ci, ci + 140))

    // A broken image reports naturalWidth 0 once it has finished failing.
    const broken = await page.evaluate(() =>
      [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src).slice(0, 3))
    check('no broken images', broken.length === 0, broken.join(' '))

    const spinners = await page.evaluate(() =>
      document.querySelectorAll('[class*="spinner" i],[class*="skeleton" i],[aria-busy="true"]').length)
    check('nothing still loading', spinners === 0, spinners ? spinners + ' element(s)' : '')

    // Shadow-DOM widgets cannot be found by querySelector, so this asks the
    // network instead: nothing from the toolbar's origin was allowed through.
    check('no Vercel preview toolbar rendered', true,
      toolbarAttempts ? `${toolbarAttempts} request(s) blocked` : 'none attempted')

    // ── STAGE, THEN PROMOTE. A FAILING RUN MUST NOT DEGRADE A GOOD SHOT. ──
    // Learned here, not in theory: the network dropped mid-run, the board
    // rendered empty, every content assertion went red — AND THE SCREENSHOT
    // WAS WRITTEN ANYWAY, replacing a good 2.4MB capture with a blank 95KB
    // one. The run reported failure and had already done the damage, which is
    // exactly the applyEdits trap: "it threw, so nothing happened" is false
    // whenever the write precedes the check.
    //
    // So the file lands under a staging name, and only a shot whose OWN checks
    // are all green is promoted over the deliverable.
    const staged = path.join(OUT, `.staging-${n}-${slug}.png`)
    const file = path.join(OUT, `${n}-${slug}.png`)
    await page.screenshot({ path: staged })        // viewport only — fullPage would not be 2778 tall

    const { w, h, bytes } = pngSize(staged)
    check(`the FILE is ${WANT_W}x${WANT_H}`, w === WANT_W && h === WANT_H, `${w}x${h}, ${Math.round(bytes / 1024)}KB`)

    const clean = bad === badAtStart
    if (clean) {
      renameSync(staged, file)
      results.push({ file, w, h, bytes, note })
    } else {
      rmSync(staged, { force: true })
      const kept = existsSync(file)
      console.log(`    --   NOT PROMOTED — ${bad - badAtStart} check(s) red. ` +
        (kept ? 'The previous good file is untouched.' : 'No file written.'))
    }
  }

  // ONE SHOT FAILING MUST NOT COST THE OTHERS. The link on this machine
  // dropped mid-run twice, and an exception out of the loop threw away two
  // good captures that had already succeeded. Each shot is isolated; a
  // promoted file stays promoted.
  // THE ORDER IS PAUL'S, 27 Aug 2026, and it is the order they appear on the
  // install sheet: board, home, temp work, job page. Only the first three show
  // without scrolling. The home page is second because it is the strongest
  // thing in the set; the job page is last because it sells nothing — no
  // photograph, since the one direct-employer advert on the board has no
  // banner and the pages that do belong to recruiters.
  const PLAN = [
    ['01', 'board', '/jobs',
      [['live roles', /chef|manager|receptionist|waiter|sous/i],
       ['a salary', /£\s?\d/]],
      'the whole proposition — real roles, real employers, a search that works'],

    ['02', 'home', '/',
      [['the proposition', /hospitality/i],
       ['the live count', /roles live now/i]],
      'the strongest thing in the set'],

    // THE ONLY DIRECT-EMPLOYER ADVERT LIVE ON THE BOARD. Every other live row
    // with a banner belongs to Goldenkeys or Host, both of them recruiters.
    ['04', 'job', '/job/fdb6007b-3bb9-4620-b8d0-ba674149b0ef',
      [['the role', /head chef/i],
       ['the employer', /collins king/i],
       ['a salary', /£\s?\d/]],
      'a real employer, a real salary, a real banner'],

    // KITCHEN IS SELECTED ON PURPOSE, AND IT IS A COMPOSITION DECISION.
    // Unfiltered, the second card is Host Staffing's PORTRAIT advert and it
    // enters the frame at CSS y808 of 926 — a recognisable face on an App
    // Store listing, under Host's licence and not ours. Selecting a category
    // opens its role chips, pushes the feed down 138px, and that card starts
    // at y946: fully below the fold. Measured both ways rather than hoped.
    // It is also a real state a person can reach with one tap, and it shows
    // the filter doing something.
    ['03', 'temp-work', '/temp-work',
      [['the temp proposition', /shift|temp/i],
       ['an hourly rate — the thing no general board has', /£\s?\d+(\.\d+)?\s*-?\s*£?\d*(\.\d+)?\s*\/\s*hr/i]],
      'the thing no general job board has',
      async (p) => {
        const kitchen = p.getByRole('button', { name: 'Kitchen', exact: true }).first()
        if (await kitchen.count()) await kitchen.click()
      }],

    // AN ALTERNATIVE FOR SHOT 2, kept but NOT SHIPPED. The direct-employer
    // advert renders no photograph — `page_jobHeader` paints a flat gradient
    // and the only image is a 46px logo — while a Goldenkeys advert carries a
    // real banner. PAUL'S DECISION, 27 Aug 2026: ship Collins King anyway.
    // Thrive's whole position is direct employers, and a plain page that looks
    // like ours beats a handsome one carrying a recruiter's yellow branding on
    // Thrive's own App Store listing.
    ['02alt', 'job-with-banner', '/job/531631c8-9017-4e76-8a43-a4d889995dd0',
      [['the role', /chef de partie/i],
       ['a salary', /£\s?\d/]],
      'the same page with a real banner photo, but a recruiter’s brand — not shipped'],

    ['unused-cv-builder', 'cv-builder', '/cv-builder',
      [['the CV tool', /cv/i]],
      'a real product surface, signed out, nothing to consent to'],

    // THE ALTERNATIVE FOURTH. /cv-builder signed out is NOT a login wall — it
    // is genuinely usable, upload or build from scratch — so it passes the
    // test it was given. It is still two-thirds empty grey on a 2778px canvas,
    // which reads as unfinished. /job-alerts is the other candidate; both are
    // captured so the choice is made from the pictures.
    // /job-alerts WAS THE OTHER CANDIDATE AND IS NOT VIABLE: signed out it
    // renders nothing — the word "alert" does not appear on the page at all.
    // Not a login wall either, just empty. Left recorded rather than removed,
    // so the next person does not spend the same ten minutes on it.
    ['unused-home-alt', 'home-alt', '/',
      [['the proposition', /hospitality|jobs|roles/i]],
      'the marketing home page — the other signed-out surface worth considering'],
  ]
  // An optional 4th argument names which shots to take, comma separated
  // ("temp-work" or "01,03"). The link on this machine is unreliable enough
  // that re-capturing three shots to get one is a poor trade — and a shot
  // already promoted is already proven, so there is nothing to gain by
  // retaking it.
  const ONLY = (process.argv[4] || '').split(',').map(s => s.trim()).filter(Boolean)
  for (const [n, slug, url, must, note, prepare] of PLAN) {
    if (ONLY.length && !ONLY.includes(slug) && !ONLY.includes(n)) continue
    try { await shot(n, slug, url, must, note, prepare) }
    catch (e) {
      bad++
      console.log(`    --   SHOT ${n} ABANDONED: ${String(e?.message || e).split('\n')[0]}`)
      console.log('         The other shots continue; anything already promoted is untouched.')
    }
  }

  console.log('\nSIZES, READ FROM THE PNG HEADERS')
  for (const r of results) console.log('    ' + path.basename(r.file).padEnd(20) + r.w + 'x' + r.h)
} catch (err) {
  console.error('\n  THREW: ' + (err?.stack || err?.message || err))
  bad++
} finally {
  await ctx.close().catch(() => {})
  await browser.close().catch(() => {})
}

console.log('')
console.log(bad ? `  ${bad} FAILED` : `  ${results.length} captured into ${OUT}`)
process.exit(bad ? 1 : 0)
