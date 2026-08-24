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

// The positive control — established from the row, not from memory.
const CONTROL_ID = 'f3571e53-e11e-4b9a-b15d-e1cd69478957'
const CONTROL_NAME = 'Adriano Castello'

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

  // ── POSITIVE CONTROL FIRST ────────────────────────────────────────────
  console.log('\nPOSITIVE CONTROL — ' + CONTROL_NAME + ', whose row HAS a photo')
  await page.goto(`${BASE}/candidates/${CONTROL_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  const ctrl = await page.evaluate(IMAGE_WALK, 'body')
  const ctrlPhotos = [...ctrl.imgs, ...ctrl.bgs, ...ctrl.srcsets]
    .filter(x => /supabase|storage|photos|googleusercontent|licdn/i.test(x.value))
  pad('url', page.url().replace(BASE, ''))
  pad('img elements on the page', ctrl.imgs.length)
  pad('background-images on the page', ctrl.bgs.length)
  pad('anything photo-shaped', ctrlPhotos.length)
  for (const p of ctrlPhotos.slice(0, 4)) {
    console.log('    ' + p.how + '  shown=' + p.shown + (p.w ? ' ' + p.w + 'x' + p.h : ''))
    console.log('      ' + String(p.value).slice(0, 130))
  }
  await page.screenshot({ path: `${SHOTS}/photos-control-detail.png`, fullPage: false })
  const CONTROL_OK = ctrlPhotos.length > 0
  console.log('  ' + (CONTROL_OK
    ? 'CONTROL PASSES — the probe can see a photo when one is there.'
    : 'CONTROL FAILS — the probe found nothing on a row known to carry a photo.\n' +
      '  Everything below is therefore UNRELIABLE and must not be read as absence.'))

  // ── THE PAGE PAUL NAMED ───────────────────────────────────────────────
  console.log('\n/candidates — THE DIRECTORY GRID')
  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
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
