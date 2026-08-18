// DOES THE CAPTURE ACTUALLY FIRE IN A REAL BROWSER ON THE DEPLOYED PAGE?
//
// scripts/prove-attribution.mjs proves the LOGIC in isolation, against a
// stubbed document. It cannot prove the component is mounted, that the effect
// runs, or that the cookie survives the page. Every UI fault on this project
// has been found by someone unable to click something, never by reading — so
// the logic proof and this drive answer different questions and both are run.
//
// It drives the PREVIEW, with VERCEL_AUTOMATION_BYPASS_SECRET as a header
// (never a share link — those bind to one URL and die on the next deploy).
// The secret is read from the environment here and never printed.
//
// TWO QUESTIONS WITH DIFFERENT ANSWERS, which is the point:
//   arriving from LinkedIn        -> a referrer_host is stored
//   arriving from our own pages   -> nothing is stored
// If both produced the same cookie the drive could not tell them apart, and
// whichever way it landed would be luck.

import { chromium } from 'playwright'

const base = process.argv[2]
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
if (!base) { console.error('usage: node scripts/drive-first-touch-capture.mjs <preview-url>'); process.exit(2) }
if (!secret) { console.error('SKIP  no VERCEL_AUTOMATION_BYPASS_SECRET in the environment'); process.exit(2) }

const results = []
const check = (name, got, want) =>
  results.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })

const browser = await chromium.launch()

/** One fresh browser context per case — a shared one would carry the first
 *  case's cookie into the second and make first-touch look like a bug. */
async function visit({ referer, path = '/', timezoneId }) {
  const ctx = await browser.newContext({
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': secret,
      'x-vercel-set-bypass-cookie': 'true',
      ...(referer ? { referer } : {}),
    },
    ...(timezoneId ? { timezoneId } : {}),
  })
  const page = await ctx.newPage()
  await page.goto(base + path, { waitUntil: 'domcontentloaded' })
  // The capture runs in a useEffect, so it needs hydration — waited for
  // EXPLICITLY rather than slept on. A sleep long enough today is a race lost
  // later on a slower machine.
  await page.waitForFunction(
    () => document.cookie.includes('thrive_tz=') || document.cookie.includes('thrive_attr='),
    null, { timeout: 15000 },
  ).catch(() => {})
  const cookies = await page.evaluate(() => document.cookie)
  const read = (name) => {
    const m = cookies.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : null
  }
  const out = {
    tz: read('thrive_tz'),
    attr: read('thrive_attr') ? JSON.parse(read('thrive_attr')) : null,
    country: read('thrive_country'),
  }
  await ctx.close()
  return out
}

// ── 1. The timezone comes from the BROWSER, and follows it ────────────────
// Playwright's timezoneId is the control: if the cookie tracked the country
// or a hard-coded default instead, these two runs would agree.
const london = await visit({ timezoneId: 'Europe/London' })
const sydney = await visit({ timezoneId: 'Australia/Sydney' })
check('timezone captured (London)', london.tz, 'Europe/London')
check('timezone captured (Sydney)', sydney.tz, 'Australia/Sydney')
check('the two zones differ', london.tz !== sydney.tz, true)

// ── 2. An external referrer is captured; our own is not ───────────────────
const fromLinkedIn = await visit({ referer: 'https://www.linkedin.com/feed/' })
check('referrer_host from LinkedIn', fromLinkedIn.attr?.referrer_host, 'linkedin.com')

const fromSelf = await visit({ referer: base + '/jobs' })
check('own referrer stores no attribution', fromSelf.attr, null)

// ── 3. A tag still wins, and is recorded as a tag ─────────────────────────
const tagged = await visit({ path: '/?ref=li-drive-check' })
check('tag captured', tagged.attr?.signup_ref, 'li-drive-check')

// ── 4. The country cookie still lands (unchanged behaviour, re-checked) ───
check('country cookie present', typeof london.country === 'string' && london.country.length === 2, true)

await browser.close()

let failed = 0
for (const r of results) {
  if (r.ok) console.log(`  ok    ${r.name}  ->  ${JSON.stringify(r.got)}`)
  else { failed++; console.log(`  FAIL  ${r.name}\n          want ${JSON.stringify(r.want)}\n          got  ${JSON.stringify(r.got)}`) }
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
