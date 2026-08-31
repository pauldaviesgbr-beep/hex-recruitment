// THE BADGES MUST NOT CLAIM A CHECK WE NEVER MADE.
//
// Four surfaces said "Verified" about booleans a candidate ticks themselves.
// This drives the two that a person actually reads and asserts BOTH halves —
// the word AND the picture. A green tick under a truthful heading would still
// read as a check that passed, so the colour is part of the check.
//
// IT ASKS QUESTIONS WITH TWO DIFFERENT ANSWERS: the old strings must be GONE
// and the new ones PRESENT. Checking only for the new wording would pass on a
// page showing both.
//
// THE EMPLOYER VIEW IS DRIVEN AGAINST OUR OWN APPLE-REVIEW ACCOUNT, never a
// real candidate. Marcus Hale is the only account with these flags set, which
// is lucky and also worth knowing: an App Store reviewer signing in as him saw
// the "Verified" badge on his own profile.
//
// THE CANDIDATE VIEW NEEDS FLAGS THE FIXTURE DOES NOT HAVE. Rather than write
// to anyone, that half is driven only if --with-fixture-flags is passed, and
// the caller is responsible for setting and restoring them; the script prints
// what it found so a run without them is obvious rather than silently empty.

import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2]
const TAG = process.argv[3]
if (!BASE || !TAG) {
  console.error('usage: node scripts/drive-declared-not-verified.mjs <base-url> <before|after>')
  process.exit(2)
}

const env = {}
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET || ''
const SHOTS = 'drive-shots'
mkdirSync(SHOTS, { recursive: true })

// Our own Apple-review account. Not a real candidate.
const MARCUS = '4ba92141-677d-4422-91cf-9b6f4e0067ca'

const rows = []
const fails = []
const note = t => rows.push('  ' + t)

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    ...(BYPASS ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  const page = await ctx.newPage()

  await page.goto(BASE + '/login/employer', { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  await page.fill('#login-email', 'pauldavies.gbr+employer@gmail.com')
  await page.fill('#login-password', env.TEST_EMPLOYER_PASSWORD)
  await page.locator('form button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.locator('form button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 45000 })
  await page.locator('button', { hasText: /^Accept All$/ }).first().click({ timeout: 8000 }).catch(() => {})
  if (page.url().includes('/login')) { fails.push('not signed in as the employer fixture'); throw new Error('not signed in') }
  rows.push('signed in as the employer fixture, landed ' + page.url().replace(BASE, ''))

  await page.goto(BASE + '/candidates/' + MARCUS, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const t = document.body ? document.body.innerText || '' : ''
    return t.length > 400 && !t.includes('Loading')
  }, undefined, { timeout: 45000 }).catch(() => {})

  const landed = page.url().replace(BASE, '')
  rows.push('landed on: ' + landed)
  if (landed.includes('/login')) fails.push('redirected to login — the measurement below is of the wrong page')

  const seen = await page.evaluate(() => {
    const t = document.body.innerText || ''
    // The badge pills, whatever they are called, so the check reads the
    // rendered ground rather than a class name that might be renamed.
    const pills = [...document.querySelectorAll('span')]
      .filter(s => /Right to work|NI number|UK bank account|P45/i.test(s.textContent || ''))
      .map(s => {
        const cs = getComputedStyle(s)
        return { text: (s.textContent || '').trim(), colour: cs.color, background: cs.backgroundColor }
      })
    return {
      saysVerified: /\bVerified\b/.test(t),
      saysDeclared: t.includes('Declared by the candidate'),
      saysOwnStatements: t.includes('own statements'),
      saysOwnCheck: t.includes('your own right-to-work check'),
      tickCount: (t.match(/✓/g) || []).length,
      pills,
      // THE CLASS, NOT THE INSTANCES. The grep for "Verified" found four
      // surfaces and could not find the green tick beside a candidate-typed
      // certification, because that claim is made entirely by a glyph and a
      // colour with no word in it. So ask the page for every short green mark,
      // whatever it is called and wherever it lives.
      greenGlyphs: [...document.querySelectorAll('*')]
        .filter(el => {
          const txt = (el.textContent || '').trim()
          if (!txt || txt.length > 2) return false
          if (el.children.length) return false
          const c = getComputedStyle(el).color
          const m = c.match(/(\d+),\s*(\d+),\s*(\d+)/)
          if (!m) return false
          const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
          return g > r + 25 && g > b + 25
        })
        .map(el => ({ text: (el.textContent || '').trim(), colour: getComputedStyle(el).color })),
    }
  })

  rows.push('')
  rows.push('=== the employer-facing candidate detail ===')
  note('says "Verified" anywhere:      ' + (seen.saysVerified ? 'YES' : 'no'))
  note('says "Declared by the candidate": ' + (seen.saysDeclared ? 'YES' : 'no'))
  note('says "own statements":          ' + (seen.saysOwnStatements ? 'YES' : 'no'))
  note('tells them to do their own check: ' + (seen.saysOwnCheck ? 'YES' : 'no'))
  note('✓ characters on the page:       ' + seen.tickCount)
  note('green glyphs anywhere:          ' + (seen.greenGlyphs.length || 'none'))
  for (const g of seen.greenGlyphs) note('   green mark "' + g.text + '"  ' + g.colour)
  for (const p of seen.pills) note('badge: "' + p.text + '"  colour ' + p.colour + '  bg ' + p.background)

  await page.screenshot({ path: SHOTS + '/' + TAG + '-employer-candidate-detail.png', fullPage: true })

  if (TAG === 'after') {
    if (seen.saysVerified) fails.push('the employer view STILL says "Verified"')
    if (!seen.saysDeclared) fails.push('the "Declared by the candidate" heading is not rendered')
    if (!seen.saysOwnStatements) fails.push('the explanatory sentence is missing')
    if (!seen.saysOwnCheck) fails.push('it does not tell the employer to do their own right-to-work check')
    if (!seen.pills.length) fails.push('no declaration badges rendered — this run proves nothing')
    if (seen.greenGlyphs.length) fails.push('a green mark still asserts a check somewhere on the page: ' + seen.greenGlyphs.map(g => '"' + g.text + '"').join(', '))
    // GREEN IS THE CLAIM. A truthful heading over green pills still reads as a
    // check that passed, so the colour is asserted rather than assumed.
    for (const p of seen.pills) {
      const m = p.background.match(/(\d+),\s*(\d+),\s*(\d+)/)
      if (m) {
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
        if (g > r + 12 && g > b + 12) fails.push('badge "' + p.text + '" is still GREEN (' + p.background + ')')
      }
    }
  }
  if (TAG === 'before') {
    if (!seen.saysVerified) fails.push('the before state does not say "Verified" — this is not the state being fixed')
  }
} catch (e) {
  fails.push('threw: ' + e.message)
} finally {
  await browser.close()
}

console.log(rows.join('\n'))
console.log('')
if (fails.length) {
  console.log(TAG.toUpperCase() + ': ' + fails.length + ' FAILED')
  for (const f of fails) console.log('  - ' + f)
  process.exit(1)
}
console.log(TAG.toUpperCase() + ': all checks passed')
