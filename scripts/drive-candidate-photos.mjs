// DO CANDIDATE PHOTOS REACH THE SCREEN? DIAGNOSIS ONLY — READS, CLICKS NOTHING.
//
// THE INSTRUMENT TRAP THIS IS BUILT AROUND. Earlier today an image probe
// reported "fallback" on six job cards because it looked only at <img> while
// the banner was a CSS background-image. A photo can arrive as ANY of:
//   · <img src>
//   · a computed background-image on any element
//   · <picture>/<source srcset>
// So this reads all three, and reports absence only when all three are empty.
//
// AND A POSITIVE CONTROL RUNS FIRST. Adriano Castello is the one candidate
// whose row carries profile_picture_url. If the probe cannot see a photo on
// HIS detail page, the probe is broken and its "none on /candidates" means
// nothing. A clean pass is a claim about the instrument until it has been
// shown finding a thing known to be there.
//
//   node scripts/drive-candidate-photos.mjs [baseUrl]

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const PASSWORD = process.env.TEST_EMPLOYER_PASSWORD || process.env.TEST_ACCOUNT_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const SHOTS = 'drive-shots'

// TWO REAL ROWS, ONE PER COLUMN. Both ids and both column values were read
// from the live table, not remembered.
//
// This pair is the whole check. Adriano's photo has always worked, so he is
// the regression guard and the proof the probe can see a photo at all. Javier
// uploaded through the DASHBOARD, so his photo was mapped to nothing and no
// employer surface has ever shown it — he is the one that should newly work.
//
// A run where Adriano passes and Javier fails is the OLD behaviour. A run
// where both pass is the fix. A run where Adriano fails is a broken probe, not
// a product fault, and the labels below say so.
const ROWS = [
  { id: 'f3571e53-e11e-4b9a-b15d-e1cd69478957', name: 'Adriano Castello',
    column: 'profile_picture_url',  expect: 'worked before AND after' },
  { id: '3bbdfe1d-2fb3-42f1-ad88-5716b484295d', name: 'Javier Gonzalez Salido',
    column: 'dashboard_photo_url',  expect: 'BROKEN before, works after' },
]

if (!PASSWORD) { console.error('SKIP  TEST_EMPLOYER_PASSWORD / TEST_ACCOUNT_PASSWORD not set'); process.exit(2) }
if (BASE.includes('.vercel.app') && !BYPASS) { console.error('SKIP  preview needs the bypass secret'); process.exit(2) }
mkdirSync(SHOTS, { recursive: true })

// Reads every way an image can arrive, inside a given root selector.
const IMAGE_WALK = (rootSel) => {
  const root = document.querySelector(rootSel) || document.body
  const els = Array.from(root.querySelectorAll('*'))
  const imgs = els.filter(e => e.tagName === 'IMG' && e.getAttribute('src'))
    .map(e => ({ how: 'img[src]', value: e.getAttribute('src'),
                 shown: e.naturalWidth > 0, w: e.naturalWidth, h: e.naturalHeight }))
  const bgs = els.map(e => {
    const bg = getComputedStyle(e).backgroundImage
    return bg && bg !== 'none' && /url\(/.test(bg)
      ? { how: 'background-image', value: bg.slice(0, 160), shown: null } : null
  }).filter(Boolean)
  const srcsets = Array.from(root.querySelectorAll('source[srcset]'))
    .map(e => ({ how: 'source[srcset]', value: e.getAttribute('srcset').slice(0, 160), shown: null }))
  return { imgs, bgs, srcsets }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})
const page = await ctx.newPage()

// Every image request that failed, so "a URL that 403s" can never be confused
// with "a URL that was never emitted".
const imageFailures = []
page.on('response', async r => {
  const t = r.request().resourceType()
  if (t === 'image' && r.status() >= 400) imageFailures.push(r.status() + '  ' + r.url().slice(0, 120))
})

const pad = (k, v) => console.log('  ' + String(k).padEnd(44) + v)

try {
  console.log('\nSIGN IN AS THE TEST EMPLOYER')
  // /login/employer is now a REDIRECT to /login, and the unified panel's
  // inputs carry an id but NO name attribute — input[name="email"] matches
  // nothing. (scripts/drive-candidate-cannot-see-employer-tools.mjs still uses
  // the old selector and will be failing the same way.)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 45000 })
  pad('landed on', page.url().replace(BASE, ''))

  // ── ONE REAL ROW PER COLUMN ───────────────────────────────────────────
  console.log('\nBOTH PHOTO COLUMNS, ON REAL ROWS')
  const seen = []
  for (const row of ROWS) {
    await page.goto(`${BASE}/candidates/${row.id}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(6000)
    const walk = await page.evaluate(IMAGE_WALK, 'body')
    const photos = [...walk.imgs, ...walk.bgs, ...walk.srcsets]
      .filter(x => /supabase|storage|photos|googleusercontent|licdn/i.test(x.value))
    // A path is not a picture. naturalWidth > 0 means the bytes arrived and
    // decoded — an img whose src 404s still counts as an img element.
    const rendered = photos.filter(p => p.how !== 'img[src]' || p.shown)
    seen.push({ ...row, found: rendered.length > 0, photos: rendered })
    console.log('  ' + row.name + '  (' + row.column + ')  — ' + row.expect)
    pad('    renders a photo', rendered.length > 0 ? 'YES' : 'no')
    for (const p of rendered.slice(0, 2)) {
      console.log('      ' + p.how + '  shown=' + p.shown + (p.w ? '  ' + p.w + 'x' + p.h : ''))
      console.log('        ' + String(p.value).slice(0, 120))
    }
    await page.screenshot({
      path: `${SHOTS}/photos-detail-${row.column}.png`, fullPage: false })
  }

  const CONTROL_OK = seen[0].found
  console.log('')
  if (!CONTROL_OK) {
    console.log('  CONTROL FAILS — ' + seen[0].name + "'s photo has always rendered.")
    console.log('  The probe is broken. Nothing below is absence; stop and look at the probe.')
  } else if (seen[1].found) {
    console.log('  BOTH COLUMNS RENDER. The mapper reads either field.')
  } else {
    console.log('  OLD BEHAVIOUR: ' + seen[0].column + ' renders and ' +
                seen[1].column + ' does not — the mapper drops it.')
  }

  // ── THE PAGE PAUL NAMED ───────────────────────────────────────────────
  console.log('\n/candidates — THE DIRECTORY GRID')
  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
  // WAIT FOR THE CARDS, NOT FOR A DURATION. A fixed sleep raced a cold
  // preview lambda and photographed the word "Loading...", which reported
  // ZERO cards and read as a broken page. A sleep long enough today is a race
  // lost later, on a slower machine or a colder start.
  await page.waitForSelector('[class*="cardDirectory"]', { timeout: 60000 })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${SHOTS}/photos-candidates-grid.png`, fullPage: false })

  const grid = await page.evaluate(() => {
    // Find the cards without guessing a class name: the repeated clickable
    // blocks that carry a candidate name.
    const cards = Array.from(document.querySelectorAll('[class*="card"]'))
      .filter(e => e.className && /card/i.test(e.className) && e.querySelector('*'))
    const out = []
    for (const c of cards) {
      const imgs = Array.from(c.querySelectorAll('img[src]')).map(i => i.getAttribute('src'))
      const bgs = Array.from(c.querySelectorAll('*')).map(e => getComputedStyle(e).backgroundImage)
        .filter(b => b && b !== 'none' && /url\(/.test(b))
      const srcsets = Array.from(c.querySelectorAll('source[srcset]')).map(s => s.getAttribute('srcset'))
      const text = (c.innerText || '').trim().split('\n')[0]
      out.push({ text: text.slice(0, 40), imgs: imgs.length, bgs: bgs.length, srcsets: srcsets.length,
                 sample: imgs[0] || bgs[0] || srcsets[0] || null })
    }
    return { cardCount: cards.length, cards: out.slice(0, 60) }
  })
  pad('card-ish elements found', grid.cardCount)
  const withAny = grid.cards.filter(c => c.imgs || c.bgs || c.srcsets)
  pad('cards with ANY image of any kind', withAny.length + ' of ' + grid.cards.length)
  const photoShaped = grid.cards.filter(c => c.sample &&
    /supabase|storage|photos|googleusercontent|licdn/i.test(c.sample))
  pad('cards with a PHOTO-shaped source', photoShaped.length)
  if (withAny.length) {
    console.log('    what the images actually are:')
    for (const c of withAny.slice(0, 5)) console.log('      ' + String(c.sample).slice(0, 110))
  }

  // What IS in the avatar slot, read rather than assumed.
  const avatarSlot = await page.evaluate(() => {
    const el = document.querySelector('[class*="dirAvatar"]')
    if (!el) return null
    const cs = getComputedStyle(el)
    return { tag: el.tagName, text: (el.textContent || '').trim(),
             bg: cs.backgroundImage, kids: el.children.length,
             w: Math.round(el.getBoundingClientRect().width) }
  })
  pad('the avatar slot', avatarSlot
    ? `<${avatarSlot.tag}> "${avatarSlot.text}"  bg=${avatarSlot.bg}  children=${avatarSlot.kids}  ${avatarSlot.w}px`
    : '(not found)')

  console.log('\nIMAGE REQUESTS THAT FAILED')
  pad('4xx/5xx image responses', imageFailures.length)
  for (const f of imageFailures.slice(0, 8)) console.log('    ' + f)
  if (!imageFailures.length) {
    console.log('    none — so nothing is being emitted and refused.')
    console.log('    An absent photo here is one that was NEVER REQUESTED.')
  }

  console.log('\nSHOTS  ' + SHOTS + '/photos-control-detail.png, ' + SHOTS + '/photos-candidates-grid.png')
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
