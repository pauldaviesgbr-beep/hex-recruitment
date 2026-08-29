// FORCE THE BOARD'S FETCH TO FAIL, AT THE NETWORK LAYER, AND READ WHAT THE
// PAGE SAYS.
//
// Not by faking state, not by stubbing the hook, not by reasoning about the
// code. The request to PostgREST is aborted by the browser, so supabase-js
// takes the same throw a phone with no signal takes, and the page renders
// whatever it really renders.
//
// THE CHECK ASKS A QUESTION WITH TWO DIFFERENT ANSWERS. Run against main it
// must find "No jobs match your search" — the board blaming the candidate for
// our failed request. Run against the fix it must find "We couldn't load the
// roles" and must NOT find the search sentence. A check that only looked for
// the new string would pass on a page that showed both.
//
// AND IT PROVES THE RETRY, WHICH IS THE HALF THAT COULD BE THEATRE. The abort
// is lifted and "Try again" is clicked: the board must actually come back
// populated. A Try again that re-renders the same failed state is the same
// fault in a new coat.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2]
const TAG = process.argv[3]
if (!BASE || !TAG) {
  console.error('usage: node scripts/drive-board-fetch-failure.mjs <base-url> <before|after>')
  process.exit(2)
}
const SHOTS = 'drive-shots'
mkdirSync(SHOTS, { recursive: true })

const rows = []
const fails = []
const note = t => rows.push('  ' + t)

const JOBS_REQUEST = '**/rest/v1/jobs**'

const seen = async (page, phrase) => page.evaluate(
  p => (document.body.innerText || '').includes(p), phrase
)
const cards = page => page.evaluate(() => document.querySelectorAll('[class*="jobCard"]').length)

const browser = await chromium.launch()
try {
  for (const vw of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    rows.push('')
    rows.push('=== ' + vw + ' — the jobs request is aborted at the network layer ===')

    let aborted = 0
    await page.route(JOBS_REQUEST, route => { aborted++; return route.abort('failed') })

    const t0 = Date.now()
    await page.goto(BASE + '/jobs', { waitUntil: 'domcontentloaded' })

    // WAIT FOR THE STATE TO SETTLE, DO NOT SLEEP AT IT.
    //
    // supabase-js RETRIES a failed request with exponential backoff — measured
    // at 1.1s, 2.1s, 4.1s and 8.1s from load — so the page sits on "Loading
    // roles…" for about NINE SECONDS before any final state appears. A first
    // run of this drive waited six seconds and reported "Loading roles" as the
    // answer, which would have been a made-up finding about a state that was
    // still in flight. Same fault as reading the board's count 1.5s in.
    //
    // THE HEADING MUST EXIST *AND* NOT SAY LOADING. The first version read
    // `h ? !h.textContent.includes('Loading') : true`, which returns TRUE when
    // there is no heading at all — so on a cold page it stopped waiting after
    // 0.7 seconds, before anything had rendered, and then reported every
    // string as "not found". A wait that is satisfied by an empty page is the
    // same fault as a check pointed at nothing.
    await page.waitForFunction(() => {
      const h = document.querySelector('[class*="emptyTitle"]')
      return !!h && !h.textContent.includes('Loading')
    }, { timeout: 45000 }).catch(() => {})
    const settledMs = Date.now() - t0
    await page.locator('button', { hasText: /^Accept All$/ }).first().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(600)

    note('landed on ' + page.url().replace(BASE, ''))
    note('settled after:         ' + (settledMs / 1000).toFixed(1) + 's of retries')
    note('jobs requests aborted: ' + aborted + (aborted === 0 ? '   <-- NOTHING WAS BLOCKED' : ''))
    if (aborted === 0) fails.push(vw + ': no jobs request was intercepted — the failure was never forced, so nothing below is about a failure')

    const nCards = await cards(page)
    const sawError = await seen(page, 'load the roles')
    const sawSearch = await seen(page, 'No jobs match your search')
    const sawTry = await seen(page, 'Try again')
    const sawLoading = await seen(page, 'Loading roles')

    note('cards on the page:     ' + nCards)
    note('"We couldn\'t load the roles"   ' + (sawError ? 'FOUND' : 'not found'))
    note('"No jobs match your search"     ' + (sawSearch ? 'FOUND' : 'not found'))
    note('"Try again"                    ' + (sawTry ? 'FOUND' : 'not found'))
    note('"Loading roles"                ' + (sawLoading ? 'FOUND' : 'not found'))

    await page.screenshot({ path: SHOTS + '/' + TAG + '-' + vw + '-fetch-failed.png' })

    if (TAG === 'after') {
      if (!sawError) fails.push(vw + ': the failure state was NOT rendered')
      if (sawSearch) fails.push(vw + ': the board still says "No jobs match your search" on a failed fetch')
      if (!sawTry) fails.push(vw + ': no Try again control')
      if (sawLoading) fails.push(vw + ': still showing the loading state — it never resolved, so this is not the error branch')
    }

    // ── THE RETRY, PROVED RATHER THAN ASSUMED ────────────────────────────
    if (sawTry) {
      await page.unroute(JOBS_REQUEST)
      note('abort lifted; clicking Try again')
      await page.locator('button', { hasText: /^Try again$/ }).first().click({ timeout: 8000 })
      await page.waitForFunction(
        () => document.querySelectorAll('[class*="jobCard"]').length > 0,
        { timeout: 30000 }
      ).catch(() => {})
      const afterCards = await cards(page)
      const stillError = await seen(page, 'load the roles')
      note('after Try again:       ' + afterCards + ' cards, failure message ' + (stillError ? 'STILL SHOWING' : 'gone'))
      if (afterCards === 0) fails.push(vw + ': Try again did not bring the board back — it is theatre')
      if (stillError) fails.push(vw + ': the failure message survived a successful retry')
      await page.screenshot({ path: SHOTS + '/' + TAG + '-' + vw + '-after-retry.png' })
    } else {
      note('no Try again control to click')
    }

    await ctx.close()
  }
} finally {
  await browser.close()
}

console.log(rows.join('\n'))
console.log('\n' + '-'.repeat(64))
if (fails.length) {
  console.log(TAG.toUpperCase() + ': ' + fails.length + ' problem(s)')
  fails.forEach(f => console.log('  ' + f))
} else if (TAG === 'after') {
  console.log('AFTER: the board says the request failed, and Try again really refetches')
} else {
  // THE BEFORE RUN ASSERTS NOTHING, so it must not print a pass. An earlier
  // version ended "the board says the request failed" underneath a run that
  // had just found the opposite — a summary line contradicting the evidence
  // printed above it, which is precisely the thing that gets believed.
  console.log(TAG.toUpperCase() + ': recorded, not asserted — this run exists to show what the page did BEFORE the change')
}
process.exit(0)
