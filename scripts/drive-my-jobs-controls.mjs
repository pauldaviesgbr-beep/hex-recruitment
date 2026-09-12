// WHAT AN EMPLOYER CAN ACTUALLY SEE AND CLICK ON /my-jobs.
//
// Fraser posted an advert and could not edit it. Reading the JSX said the edit
// control exists; only driving the page showed why he never reached it — the
// advert itself was not on any tab.
//
// ── WHAT THIS ASSERTS NOW, AND WHY IT CHANGED ────────────────────────────
//
// THE TAB SET CHANGED UNDER THIS SCRIPT, WHICH IS EXACTLY THE MOMENT A DRIVE
// GOES QUIETLY USELESS. It used to walk six tabs comparing each badge with the
// cards beneath it — the check written after "All Jobs 4" appeared above an
// empty list. Six became three, and a script that simply walked "whatever tabs
// are there" would have kept passing while asserting something weaker than
// before, with nothing to announce it. So what it asserts is decided here
// rather than inherited:
//
//   1. THE THREE TABS ARE THE ONLY TABS. A fourth appearing is a failure,
//      because the property below is about a partition and a partition has a
//      fixed number of parts.
//
//   2. EACH BADGE EQUALS THE CARDS UNDER IT. The original assertion, kept, and
//      now meaningful on ALL THREE tabs — the old Offers and Hired tabs had to
//      be exempted because they rendered offer records rather than adverts, so
//      a third of the strip was never checked at all.
//
//   3. THE TABS PARTITION THE ADVERTS — the new one, and the reason three tabs
//      are a stronger claim than six. Every advert appears on EXACTLY ONE tab:
//      the three id sets are disjoint, and together they account for every
//      advert this employer owns. Six overlapping tabs could never have
//      offered this, because an advert's tab depended on rows in another
//      table and two tabs did not list adverts at all.
//
//   4. THE TOTAL COMES FROM THE DATABASE, NOT FROM THE PAGE. This is the half
//      that matters. Summing the three badges and comparing it with the three
//      badges proves nothing — it is one computation's word repeated three
//      times, and the fault it is supposed to catch (an advert on no tab at
//      all) is invisible to it, because a missing advert is missing from the
//      badge too. The independent figure is a direct query for this
//      employer's rows, run as the employer under RLS. Screen against state.
//
//   5. THE STRIP FITS ON ONE ROW AT 320 with no horizontal scroller. The
//      handoff specifies a scrolling strip; this build deliberately does not
//      have one, because a sideways-scrolling control row hides whole controls
//      behind an edge and this product has fixed that fault four times. That
//      departure is only safe while the tabs FIT, so the thing that makes it
//      safe is asserted rather than assumed.
//
// Anyone changing the tabs again: you are breaking 1 and 3 on purpose. Decide
// what the new set asserts before editing the list.
//
// STRICTLY READ-ONLY. It reads tabs and opens the kebab. It clicks NOTHING
// that writes — no Archive, no Pause, no Duplicate, no Reactivate, no Edit
// submit. The fixture's four adverts are rows other drives assert against.
//
// SCREENSHOTS EVERY STATE, PASS OR FAIL. An earlier version screenshotted only
// on success, so its first failure produced a timeout string and no picture.
//
//   node scripts/drive-my-jobs-controls.mjs <base-url>

import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const PASSWORD = process.env.TEST_EMPLOYER_PASSWORD
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const SHOTS = 'drive-shots'

if (!PASSWORD) { console.error('SKIP  TEST_EMPLOYER_PASSWORD not in the environment'); process.exit(2) }
if (BASE.includes('.vercel.app') && !BYPASS) { console.error('SKIP  preview target needs the bypass secret'); process.exit(2) }

// Read from the environment inside the script. Nothing here reaches a URL, a
// log or an argument.
let env = {}
try {
  env = Object.fromEntries(
    readFileSync('.env.local', 'utf8').split(/\r?\n/)
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
  )
} catch { /* fall through to the guard below */ }
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPA_URL || !SUPA_ANON) {
  console.error('SKIP  NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY not available — the partition check needs a source of truth outside the page')
  process.exit(2)
}

mkdirSync(SHOTS, { recursive: true })

const TABS = ['live', 'filled', 'archived']
const LABEL = { live: 'Live', filled: 'Filled', archived: 'Archived' }

const results = []
const check = (name, got, ok) => results.push({ name, got, ok })

// ── THE INDEPENDENT TOTAL ────────────────────────────────────────────────
// Read as the EMPLOYER through RLS, with the anon key — not the service role.
// Two reasons: nothing here needs to see another employer's rows, and a drive
// holding a service key is a drive that can do damage if its target is ever
// wrong. It reads and never writes.
//
// The expected split is computed here from `status`, which is the same rule
// tabOf() applies in the page. That is NOT circular: the rule is being applied
// to rows fetched straight from the database, and what is under test is
// whether the RENDERED page agrees with it.
const supa = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } })
const { data: signIn, error: signInErr } = await supa.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (signInErr || !signIn?.user) {
  console.error(`SKIP  could not sign in to read the expected rows: ${signInErr?.message || 'no user'}`)
  process.exit(2)
}
const { data: rows, error: rowsErr } = await supa
  .from('jobs').select('id, status').eq('employer_id', signIn.user.id)
if (rowsErr) { console.error(`SKIP  could not read this employer's adverts: ${rowsErr.message}`); process.exit(2) }

const tabOf = (status) => status === 'archived' ? 'archived' : status === 'filled' ? 'filled' : 'live'
const expected = { live: new Set(), filled: new Set(), archived: new Set() }
for (const r of rows) expected[tabOf(r.status)].add(r.id)
const TOTAL = rows.length

// ZERO-GUARD. An employer with no adverts makes every assertion below
// vacuously true — three empty tabs partition nothing perfectly. A pass on
// nothing is the failure mode this whole file exists to avoid.
if (TOTAL === 0) {
  console.error('SKIP  this employer owns no adverts — every partition check would pass vacuously')
  process.exit(2)
}
console.log(`the database says: ${TOTAL} adverts — live ${expected.live.size}, filled ${expected.filled.size}, archived ${expected.archived.size}`)

const browser = await chromium.launch()

async function run(width, height, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } }
      : {}),
  })
  const page = await ctx.newPage()

  // ── sign in ───────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login/employer`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  // NOT /employer/ — that matches "/login/employer", the page we are on.
  await page.waitForURL(/\/(employer\/dashboard|my-jobs|dashboard)(\?|$|\/)/, { timeout: 40000 })

  const seen = { live: null, filled: null, archived: null }

  for (const tab of TABS) {
    await page.goto(`${BASE}/my-jobs?filter=${tab}`, { waitUntil: 'domcontentloaded' })

    // WAIT ON A PREDICATE THAT IS FALSE WHILE THE ANSWER IS MISSING — never on
    // a clock, and never on a length threshold. "innerText.length > 200" is
    // satisfied by the navigation menu alone, which is how a page was once
    // measured before it had rendered and reported as having no empty state.
    //
    // The tab strip is the discriminator: it renders only after the jobs fetch
    // resolves, because it carries the counts. Its presence means the answer
    // has arrived, whatever the answer is.
    await page.waitForFunction((label) => {
      const btns = [...document.querySelectorAll('button')]
      return btns.some(b => (b.innerText || '').trim().startsWith(label))
        || /no job ads yet/i.test(document.body.innerText || '')
    }, LABEL[tab], { timeout: 45000 }).catch(() => {})

    const strip = await page.evaluate((LABELS) => {
      const btns = [...document.querySelectorAll('button')]
      const tabs = btns.filter(b => {
        const t = (b.innerText || '').trim()
        return Object.values(LABELS).some(l => t.startsWith(l)) && /\d\s*$/.test(t)
      })
      const badges = {}
      for (const [key, label] of Object.entries(LABELS)) {
        const b = tabs.find(x => (x.innerText || '').trim().startsWith(label))
        if (b) {
          const m = (b.innerText || '').match(/(\d+)\s*$/)
          badges[key] = m ? Number(m[1]) : 0
        }
      }
      // One row, and nothing reachable only by scrolling sideways.
      const tops = new Set(tabs.map(b => Math.round(b.getBoundingClientRect().top)))
      const parent = tabs[0]?.parentElement
      const rightMost = Math.max(0, ...tabs.map(b => b.getBoundingClientRect().right))
      return {
        count: tabs.length,
        labels: tabs.map(b => (b.innerText || '').trim().replace(/\s+/g, ' ')),
        badges,
        rows: tops.size,
        scrolls: parent ? parent.scrollWidth > parent.clientWidth : false,
        overflowX: parent ? getComputedStyle(parent).overflowX : 'none',
        rightMost: Math.round(rightMost),
        viewport: window.innerWidth,
      }
    }, LABEL)

    const ids = await page.$$eval('[data-job-id]', els => els.map(e => e.getAttribute('data-job-id')))
    seen[tab] = ids

    await page.screenshot({ path: `${SHOTS}/${tag}-${tab}.png` })

    check(`${tag} ${tab}: badge ${strip.badges[tab]} == cards ${ids.length}`,
      `badge=${strip.badges[tab]} cards=${ids.length}`,
      strip.badges[tab] === ids.length)

    check(`${tag} ${tab}: exactly three tabs, no more`,
      strip.labels.join(' | '), strip.count === 3)

    // AN EMPTY LIST MUST SAY IT IS EMPTY. A blank area under a count reads as
    // a page that failed to load, which is half of why the original fault
    // went unreported for weeks.
    if (ids.length === 0) {
      const body = await page.evaluate(() => document.body.innerText || '')
      const spoke = /nothing live right now|nothing filled yet|nothing archived|no job ads yet|no ads match/i.test(body)
      check(`${tag} ${tab}: empty list carries a message`, `spoke=${spoke}`, spoke)
    }
  }

  // ── the partition, on this viewport ────────────────────────────────────
  const all = [...seen.live, ...seen.filled, ...seen.archived]
  const union = new Set(all)

  check(`${tag} partition: no advert on two tabs`,
    `${all.length} placements, ${union.size} distinct`,
    all.length === union.size)

  check(`${tag} partition: every advert is on a tab — ${union.size} of ${TOTAL}`,
    `page=${union.size} database=${TOTAL}` +
      (union.size === TOTAL ? '' : ` missing=${[...expected.live, ...expected.filled, ...expected.archived].filter(id => !union.has(id)).join(',') || 'none'}`),
    union.size === TOTAL)

  for (const tab of TABS) {
    const got = new Set(seen[tab])
    const want = expected[tab]
    const same = got.size === want.size && [...want].every(id => got.has(id))
    check(`${tag} ${tab}: the page's set matches the database's set (${want.size})`,
      `page=${got.size} database=${want.size}`, same)
  }

  await ctx.close()
}

// ── the narrow check, its own context ──────────────────────────────────────
// 320 is the narrowest width this product supports, and it is where a control
// row either fits or does not. Asserted separately from the walk above because
// it is a claim about GEOMETRY, and geometry is the thing the six-tab strip
// got wrong.
async function runNarrow() {
  const ctx = await browser.newContext({
    viewport: { width: 320, height: 780 },
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } }
      : {}),
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login/employer`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(employer\/dashboard|my-jobs|dashboard)(\?|$|\/)/, { timeout: 40000 })

  await page.goto(`${BASE}/my-jobs?filter=live`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const btns = [...document.querySelectorAll('button')]
    return btns.some(b => (b.innerText || '').trim().startsWith('Live'))
  }, null, { timeout: 45000 }).catch(() => {})

  const geo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
      .filter(b => /^(Live|Filled|Archived)\s*\d*$/.test((b.innerText || '').trim().replace(/\s+/g, ' ')))
    if (!btns.length) return null
    const parent = btns[0].parentElement
    const tops = new Set(btns.map(b => Math.round(b.getBoundingClientRect().top)))
    return {
      n: btns.length,
      rows: tops.size,
      scrolls: parent.scrollWidth > parent.clientWidth,
      overflowX: getComputedStyle(parent).overflowX,
      right: Math.round(Math.max(...btns.map(b => b.getBoundingClientRect().right))),
      vw: window.innerWidth,
    }
  })
  await page.screenshot({ path: `${SHOTS}/narrow320-live.png` })

  // A ZERO-GUARD, because "no tabs found" would otherwise satisfy every
  // condition below and report the geometry as perfect.
  check('320: the tab strip was found at all', geo ? `${geo.n} tabs` : 'NONE', !!geo && geo.n === 3)
  if (geo) {
    check('320: all three tabs on ONE row', `${geo.rows} row(s)`, geo.rows === 1)
    check('320: nothing hidden behind a sideways scroller',
      `scrollWidth>clientWidth=${geo.scrolls} overflow-x=${geo.overflowX}`, !geo.scrolls)
    check('320: the strip is NOT an overflow-x scroller',
      `overflow-x=${geo.overflowX}`, !/auto|scroll/.test(geo.overflowX))
    check('320: the last tab ends inside the viewport',
      `right=${geo.right} viewport=${geo.vw}`, geo.right <= geo.vw)
  }

  // ── the kebab ──────────────────────────────────────────────────────────
  // Read on whichever tab has adverts. The fixture's four are all filled, so
  // hardcoding a tab here would have made this section silently skip.
  const tabWithCards = ['live', 'filled', 'archived'].find(t => expected[t].size > 0)
  await page.goto(`${BASE}/my-jobs?filter=${tabWithCards}`, { waitUntil: 'domcontentloaded' })
  await page.locator('button[aria-label="Job actions"]').first().waitFor({ timeout: 45000 })
  await page.locator('button[aria-label="Job actions"]').first().click()
  await page.waitForSelector('[role="menu"]', { timeout: 10000 })
  const items = (await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts())
    .map(s => s.trim()).filter(Boolean)
  await page.screenshot({ path: `${SHOTS}/narrow320-kebab.png` })

  check('kebab no longer carries Edit — it moved to the action bar',
    items.join(' | '), !items.some(i => /^edit/i.test(i)))
  check('kebab carries Duplicate', items.join(' | '),
    items.some(i => /^duplicate$/i.test(i)))
  // View analytics is a DELIBERATE departure from the handoff's "only" list:
  // /employer/analytics/[id] is linked from this menu and nowhere else in the
  // codebase, so dropping it makes a whole page unreachable.
  check('kebab still reaches per-job analytics', items.join(' | '),
    items.some(i => /analytics/i.test(i)))

  await ctx.close()
}

let failure = null
try {
  await run(1440, 900, 'desktop')
  await run(390, 844, 'mobile')
  await runNarrow()
} catch (e) {
  failure = e.message
} finally {
  await browser.close()
}

let failed = 0
for (const r of results) {
  if (r.ok) console.log(`  ok    ${r.name}`)
  else { failed++; console.log(`  FAIL  ${r.name}   ->  ${r.got}`) }
}
if (failure) { failed++; console.log(`  FAIL  drive threw: ${failure}`) }
console.log(`\n${results.length - failed}/${results.length} passed — screenshots in ${SHOTS}/`)
process.exit(failed ? 1 : 0)
