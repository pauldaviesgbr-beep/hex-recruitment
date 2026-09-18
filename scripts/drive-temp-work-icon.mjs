// THE ROLE ICON ON /temp-work/manage IS AN ICON, NOT ITS OWN NAME.
//
//   node scripts/drive-temp-work-icon.mjs [base-url]
//
// ── WHY BOTH HALVES ────────────────────────────────────────────────────────
//
// On 6 Sept 2026 this page printed the literal words "chef-hat" and
// "utensils" beside post titles, on camera, in a take for Apple —
// `{meta.icon}` interpolated a NAME into JSX as text.
//
// "There is an <svg>" WOULD PASS ON THE BROKEN PAGE. The fix adds an svg; it
// does not remove anything that was there before, and a page rendering both
// the glyph and the word satisfies a check that only looks for the glyph.
// That is the exact shape of half-check this project has caught repeatedly
// this week, so this asserts BOTH: the svg is present AND the header's text
// does not contain any icon name from the mapping.
//
// The name is not hard-coded either — it is read from lib/tempWork.ts, so a
// seventh group added later is covered without anyone remembering. A check
// that invents its own search term can pass on nothing.

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

// EVERY ICON NAME THE MAPPING CAN PRODUCE, read from the source rather than
// typed here. If the file stops matching, the zero-guard below refuses to
// report a pass rather than quietly checking against an empty list.
const ICON_NAMES = [...readFileSync('lib/tempWork.ts', 'utf8').matchAll(/icon: '([^']+)'/g)].map(m => m[1])

let bad = 0
const check = (label, ok, detail = '') => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(56) + detail)
}

check(`the icon names were read from lib/tempWork.ts`, ICON_NAMES.length >= 5, ICON_NAMES.join(' '))
if (ICON_NAMES.length < 5) {
  console.log('\nrefusing to check against an empty or truncated name list')
  process.exit(1)
}

const browser = await webkit.launch()
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  ...(env.VERCEL_AUTOMATION_BYPASS_SECRET && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: {
        'x-vercel-protection-bypass': env.VERCEL_AUTOMATION_BYPASS_SECRET,
        'x-vercel-set-bypass-cookie': 'true',
      } } : {}),
})

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 30000 })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PASS)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForFunction(() => !location.pathname.includes('/login'), null, { timeout: 30000 })
  console.log(`\nsigned in as Thrive Test Employer against ${BASE}`)

  await page.goto(`${BASE}/temp-work/manage`, { waitUntil: 'domcontentloaded' })
  // WAIT ON THE POST ITSELF, not on a length or a spinner — the fixture title
  // is false while the answer is missing and true only once it has rendered.
  const arrived = await page.waitForFunction(
    () => document.body.innerText.includes('TAKE-8'),
    null, { timeout: 30000 },
  ).then(() => true).catch(() => false)
  check('the fixture post is on the manage page', arrived,
    arrived ? '' : 'never appeared — is --up --owner=test-employer done?')
  if (!arrived) throw new Error('no post to inspect')

  const seen = await page.evaluate((names) => {
    // The header row that carries the title. Find the element whose own text
    // is the title line, then look at it and its immediate wrapper.
    const all = [...document.querySelectorAll('span, div')]
    const host = all.find(el => (el.textContent || '').includes('TAKE-8') && el.querySelectorAll('*').length < 8)
    if (!host) return { found: false }
    const text = (host.textContent || '').trim()
    return {
      found: true,
      text,
      svgs: host.querySelectorAll('svg').length,
      leaked: names.filter(n => text.includes(n)),
    }
  }, ICON_NAMES)

  check('found the title row', seen.found, seen.text ? `"${seen.text.slice(0, 60)}"` : '')
  // HALF ONE — the glyph is there.
  check('the row renders an <svg> — the icon is a glyph', (seen.svgs || 0) > 0, `${seen.svgs} svg`)
  // HALF TWO — and the word is NOT. This is the half that fails on the old
  // build, and the reason the check is not just "is there an svg".
  check('…and NO icon name appears as text beside the title',
    (seen.leaked || []).length === 0,
    (seen.leaked || []).length ? `LEAKED: ${seen.leaked.join(', ')}` : 'none of ' + ICON_NAMES.length)
} catch (e) {
  check('the drive ran to completion', false, (e.message || '').slice(0, 120))
} finally {
  await browser.close()
}

console.log('')
console.log(bad ? `${bad} FAILED` : 'the role icon renders as a glyph, and its name appears nowhere')
process.exitCode = bad ? 1 : 0
