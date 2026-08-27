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

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DSF,
  isMobile: true,
  hasTouch: true,
  // A real iPhone UA, so anything that sniffs gets the same answer the
  // viewport is already giving.
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
})
const page = await ctx.newPage()

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
  async function shot(n, slug, url, mustContain, note) {
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
  const PLAN = [
    ['01', 'board', '/jobs',
      [['live roles', /chef|manager|receptionist|waiter|sous/i],
       ['a salary', /£\s?\d/]],
      'the whole proposition — real roles, real employers, a search that works'],

    // THE ONLY DIRECT-EMPLOYER ADVERT LIVE ON THE BOARD. Every other live row
    // with a banner belongs to Goldenkeys or Host, both of them recruiters.
    ['02', 'job', '/job/fdb6007b-3bb9-4620-b8d0-ba674149b0ef',
      [['the role', /head chef/i],
       ['the employer', /collins king/i],
       ['a salary', /£\s?\d/]],
      'a real employer, a real salary, a real banner'],

    ['03', 'temp-work', '/temp-work',
      [['the temp proposition', /shift|temp/i]],
      'the thing no general job board has'],

    // AN ALTERNATIVE FOR SHOT 2, because the direct-employer advert renders NO
    // photograph: `page_jobHeader` paints a flat linear-gradient and the only
    // image is a 46px logo. A Goldenkeys advert does carry a real banner
    // (job-banners/goldenkeys/…jpg, 150px tall). The trade is a recruiter's
    // brand on the store page against a picture instead of a grey box —
    // Paul's call, so both are captured and neither is chosen here.
    ['02alt', 'job-with-banner', '/job/531631c8-9017-4e76-8a43-a4d889995dd0',
      [['the role', /chef de partie/i],
       ['a salary', /£\s?\d/]],
      'the same page with a real banner photo, but a recruiter’s brand'],
  ]
  // An optional 4th argument names which shots to take, comma separated
  // ("temp-work" or "01,03"). The link on this machine is unreliable enough
  // that re-capturing three shots to get one is a poor trade — and a shot
  // already promoted is already proven, so there is nothing to gain by
  // retaking it.
  const ONLY = (process.argv[4] || '').split(',').map(s => s.trim()).filter(Boolean)
  for (const [n, slug, url, must, note] of PLAN) {
    if (ONLY.length && !ONLY.includes(slug) && !ONLY.includes(n)) continue
    try { await shot(n, slug, url, must, note) }
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
