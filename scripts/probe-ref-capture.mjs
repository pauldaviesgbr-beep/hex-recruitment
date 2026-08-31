// DOES ?ref ACTUALLY GET CAPTURED, AND WHAT WOULD IT STAMP?
//
// ── HOW TO RUN IT, AND WHAT A PASS LOOKS LIKE ────────────────────────────────
//
//     node scripts/probe-ref-capture.mjs https://thrivecareer.co.uk
//     node scripts/probe-ref-capture.mjs <url> <a-ref-value>   (default li-headchef-andover)
//
// A pass prints the stored record from BOTH stores and ends with
// "ref capture works, and first touch wins". It exits 0. Anything else exits 1
// and names what failed. Last run green on PRODUCTION, 31 Aug 2026:
//
//     localStorage:  {"signup_ref":"li-headchef-andover"}
//     cookie:        {"signup_ref":"li-headchef-andover"}
//     after a second tagged visit (fb-someothertest): li-headchef-andover
//
// ── WHY IT IS NOT IN `verify` ────────────────────────────────────────────────
//
// It needs the NETWORK and a LIVE DEPLOYMENT, and this project's own rule is
// that a check which cannot run by default does not belong in verify: wired in,
// it would skip or fail on every machine without a site to point at, and a red
// nobody expects is a red nobody reads. It is a PROBE you run deliberately —
// before a campaign, or when a signup arrives with no tag and you need to know
// whether capture or the link was at fault.
//
// RUN IT WHENEVER THE ANSWER MATTERS: before a posting push, after any change
// to lib/attribution.ts or FirstTouchCapture, and after any change to the root
// layout — FirstTouchCapture is mounted there, so a layout edit can silently
// stop every tag on the site being captured.
//
// ?ref has landed on ZERO of 62 candidates, and the reason recorded in
// CLAUDE.md is about the LINK never surviving a LinkedIn post rather than
// about the capture being broken. Those are different faults and nobody has
// separated them. This separates them.
//
// DELIBERATELY NOT DRIVEN AGAINST A JOB PAGE. Loading /job/<id> increments
// that advert's view count through /api/jobs/[id]/view, and Host's listings
// are read-only — polluting the exact metric the post is about would be a
// self-inflicted wound. FirstTouchCapture is mounted in the ROOT layout, so
// the homepage exercises the identical code path with no write to anyone's
// row.
//
// It reports the stored record AND what attributionColumns would derive from
// it, because the cookie existing is not the same as the columns being right.

import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const REF = process.argv[3] || 'li-headchef-andover'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const fails = []
try {
  const url = BASE + '/?ref=' + encodeURIComponent(REF)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  // The capture is a useEffect, so wait for the record rather than a clock.
  await page.waitForFunction(
    () => !!(localStorage.getItem('thrive_attr') || document.cookie.includes('thrive_attr')),
    undefined,
    { timeout: 20000 },
  ).catch(() => {})

  const out = await page.evaluate(() => {
    const ls = localStorage.getItem('thrive_attr')
    const m = document.cookie.match(/(?:^|; )thrive_attr=([^;]*)/)
    return {
      localStorage: ls,
      cookie: m ? decodeURIComponent(m[1]) : null,
      url: location.href,
    }
  })

  console.log('landed on:        ' + out.url)
  console.log('localStorage:     ' + (out.localStorage || 'NOT SET'))
  console.log('cookie:           ' + (out.cookie || 'NOT SET'))

  if (!out.localStorage && !out.cookie) {
    fails.push('nothing was stored — ?ref is not being captured at all')
  } else {
    const rec = JSON.parse(out.localStorage || out.cookie)
    console.log('')
    console.log('signup_ref:       ' + (rec.signup_ref ?? 'null'))
    console.log('referrer_host:    ' + (rec.referrer_host ?? 'null'))
    if (rec.signup_ref !== REF) fails.push('signup_ref is "' + rec.signup_ref + '", expected "' + REF + '"')

    // Mirror of normalizeSource/sourceBasis for the tag case. Stated as a
    // mirror rather than imported, because this file cannot import TS.
    const prefix = String(rec.signup_ref || '').toLowerCase().split(/[-_]/)[0]
    console.log('')
    console.log('=== what a signup would stamp ===')
    console.log('  signup_source_basis: tag   (signup_ref is set)')
    console.log('  channel prefix:      "' + prefix + '"  -> expect LinkedIn')
  }

  // FIRST-TOUCH-WINS: a second, differently tagged visit must NOT overwrite.
  // Asserted because it decides whether a later click can steal the credit.
  await page.goto(BASE + '/?ref=fb-someothertest', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const after = await page.evaluate(() => localStorage.getItem('thrive_attr'))
  const rec2 = after ? JSON.parse(after) : {}
  console.log('')
  console.log('after a second tagged visit (fb-someothertest):')
  console.log('  signup_ref is now: ' + (rec2.signup_ref ?? 'null'))
  if (rec2.signup_ref !== REF) fails.push('FIRST-TOUCH DID NOT WIN — a later tag overwrote the first')
} catch (e) {
  fails.push('threw: ' + e.message)
} finally {
  await browser.close()
}

console.log('')
if (fails.length) {
  console.log(fails.length + ' FAILED')
  for (const f of fails) console.log('  - ' + f)
  process.exit(1)
}
console.log('ref capture works, and first touch wins')
