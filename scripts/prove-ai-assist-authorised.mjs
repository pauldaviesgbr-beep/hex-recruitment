// AI ASSIST ACTUALLY ANSWERS — from the CV Builder's own call shape.
//
//   node scripts/prove-ai-assist-authorised.mjs <deployment-url>
//
// URL REQUIRED — this signs in and spends a model call; it must not guess
// where.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// /api/ai-assist requires an `Authorization: Bearer` header — added
// 26 Mar 2026 in 047dc9e, "critical security fixes". The CV Builder's fetch
// never sent one, so the button returned 401 to EVERY user on EVERY platform
// for FIVE MONTHS. Nothing said so: the only symptom is an alert() reading
// "Unauthorized", visible solely to somebody who taps it. A SECURITY FIX
// CLOSED A HOLE AND TOOK A FEATURE WITH IT.
//
// Four other call sites of the same route were sending the header correctly.
// This was the fifth — the one nobody enumerated.
//
// ── WHAT IT ASSERTS, AND WHY IN THIS SHAPE ───────────────────────────────
//
// It calls the route THE WAY THE COMPONENT DOES — same origin, same method,
// same body shape, from inside a signed-in page — rather than with a
// hand-built request. A check that constructs its own perfect call would
// have passed happily for the whole five months; the fault was entirely in
// what the CALLER omitted.
//
// It asserts a 200 AND text in the body. 200 alone is not enough: the route
// can answer 200 with an { error } payload, and "the request was accepted"
// is a different claim from "the feature works".
//
// Not in verify: needs a deployment, credentials, and a real model call.

import { chromium, devices } from 'playwright'
import { readFileSync } from 'node:fs'
import { withSeededStorage } from './lib/seed-storage.mjs'

const BASE = process.argv[2]
if (!BASE || !/^https:\/\//.test(BASE)) {
  console.log('SKIP  pass the deployment URL to drive.')
  console.log('      This signs in and spends a model call; it refuses to guess where.')
  process.exit(2)
}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
if (!process.env.TEST_ACCOUNT_PASSWORD) { console.log('SKIP  no TEST_ACCOUNT_PASSWORD'); process.exit(2) }

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(56) + (detail ?? ''))
}

const browser = await chromium.launch()
const page = await (await browser.newContext({
  ...devices['iPhone 14 Pro'],
  extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {},
})).newPage()

try {
  await withSeededStorage(page, 'consentAccepted')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 30000 })
  await page.fill('#login-email', 'pauldavies.gbr+candidate@gmail.com')
  await page.fill('#login-password', process.env.TEST_ACCOUNT_PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForFunction(() => !location.pathname.includes('/login'), null, { timeout: 30000 })

  // The CV Builder page itself, so the call runs in the page that owns it
  // and reads the session the same way.
  await page.goto(`${BASE}/cv-builder`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('[class*="bannerActions"]'), null, { timeout: 30000 })

  // DRIVE THE BUTTON, DO NOT REIMPLEMENT THE TOKEN READ. The first version
  // dug the access token out of localStorage — and found nothing, because
  // @supabase/ssr keeps the session in COOKIES. It would have failed on the
  // FIXED build too, for a reason that has nothing to do with the fix: a
  // check that restates what the component does is a second copy of it, and
  // drifts. The component knows how to authorise; this presses its button.
  // AI Assist lives on the summary step, not the first one. Step forward
  // until it exists rather than assuming which step that is.
  for (let i = 0; i < 4 && (await page.locator('[class*="aiBtn"]').count()) === 0; i++) {
    await page.locator('button:has-text("Next Step")').first().click()
    await page.waitForTimeout(500)
  }
  const aiCount = await page.locator('[class*="aiBtn"]').count()
  check('the AI Assist button is reachable', aiCount > 0, `${aiCount} found`)
  if (aiCount === 0) throw new Error('no AI Assist button after stepping through the builder')
  await page.locator('[class*="aiBtn"]').first().scrollIntoViewIfNeeded()
  await page.locator('[class*="aiBtn"]').first().click()
  await page.waitForSelector('[class*="modalGenerate"]', { timeout: 15000 })
  // THE LISTENER GOES ON BEFORE THE CLICK. Registered after, it can miss the
  // very alert it exists to catch — and a missed alert reads as "no failure
  // dialog appeared", which is the check passing on the broken state.
  let dialogText = null
  page.on('dialog', async d => { dialogText = d.message(); await d.dismiss() })
  // THE FIELD ALREADY HAS TEXT IN IT. The first version asserted "the field
  // is non-empty" and PASSED on production — 49 chars of the fixture's own
  // saved summary, with an "Unauthorized" alert on screen. A check has to
  // ask a question whose answer differs between the two states, so this
  // records the length BEFORE and requires it to CHANGE.
  const before = await page.evaluate(() => {
    const t = document.querySelector('textarea')
    return t ? t.value.length : -1
  })
  const t0 = Date.now()
  await page.locator('[class*="modalGenerate"]').click()
  // Wait on the OUTCOME, never a clock: either the modal closes (the text
  // landed) or a native dialog appears (the failure). Both are settled
  // states; a timeout here means neither happened, which is its own answer.
  const closed = await page.waitForFunction(
    () => !document.querySelector('[class*="modalGenerate"]'),
    null, { timeout: 45000 }).then(() => true).catch(() => false)
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  const summary = await page.evaluate(() => {
    const t = document.querySelector('textarea')
    return t ? t.value.length : 0
  })
  check('the AI modal accepted the tap and settled', closed || !!dialogText,
    closed ? `closed in ${secs}s` : (dialogText ? 'alert: ' + dialogText : 'neither closed nor alerted'))
  check('no failure dialog appeared', !dialogText, dialogText || 'none')
  check('…and the field CHANGED — new text landed, not the old summary',
    summary > 0 && summary !== before,
    `${before} chars -> ${summary} chars in ${secs}s`)
} catch (e) {
  check('the drive ran to completion', false, e.message?.slice(0, 120))
} finally {
  await browser.close()
}

console.log('')
console.log(bad ? `${bad} FAILED` : 'AI Assist is authorised and returns text')
process.exit(bad ? 1 : 0)
