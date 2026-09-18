// Re-runnable Goldenkeys hospitality import.
//   Scrape (Firecrawl) all /industry/hospitality/ listing pages + each
//   /vacancies/<slug>/ detail page -> upsert under the Goldenkeys employer,
//   idempotent on jobs.source_url -> reconcile roles that have gone (status=archived).
//
// Usage:
//   node scripts/import-goldenkeys.mjs --enumerate   # scrape listings -> URL list (scratch json)
//   node scripts/import-goldenkeys.mjs --scrape      # scrape detail pages -> records (scratch json)
//   node scripts/import-goldenkeys.mjs --apply --dry-run   # plan writes, no DB changes
//   node scripts/import-goldenkeys.mjs --apply             # backfill + upsert + reconcile
//   node scripts/import-goldenkeys.mjs --all               # enumerate + scrape + apply
//   node scripts/import-goldenkeys.mjs --all --no-update-existing
//        # insert new roles, retire dead ones, and leave every advert we
//        # already hold exactly as it is. This is what the weekly cron runs.
// Env (from .env.local): FIRECRAWL_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const EMPLOYER_ID = '9eb99b46-2b86-454c-be37-30a34e11a3ed'
const COMPANY = 'Goldenkeys Recruitment'
const BASE = 'https://goldenkeys.co.uk/industry/hospitality/'
// Hard ceiling only — enumerate() stops as soon as a page yields nothing new.
// It exists so a site change (infinite pagination, a page that always echoes
// the last one) can't spin forever, not to bound the real catalogue.
const MAX_PAGES = 50
const SCRATCH = process.env.GK_SCRATCH || path.join(process.cwd(), 'scripts', '.goldenkeys')
const ENUM_FILE = path.join(SCRATCH, 'urls.json')
const REC_FILE = path.join(SCRATCH, 'records.json')

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')

// --no-update-existing: INSERT NEW ROLES, RETIRE DEAD ONES, AND DO NOT TOUCH
// THE TEXT OF AN ADVERT WE ALREADY HOLD.
//
// WHY. Measured 10 Sept 2026 against a fresh scrape of all 98 live vacancies:
// the upsert would have changed a field on 84 of the 92 adverts we hold — and
// changed a FACT on ZERO of them. No title, no salary, no location, no
// reference. Every one of those 84 rewrites was the extractor wording the same
// advert differently on a second pass, and on 18 of them it collapsed a clean
// bullet list into one run-on paragraph. So the weekly run was about to rewrite
// 84 live adverts on the public board and correct nothing at all.
//
// THE ONE GENUINE EMPLOYER EDIT IN THAT POPULATION — a Chef de Partie whose
// salary Goldenkeys raised from £36,240 to £42,000 on 10 Sept — was applied by
// hand the same day, which is what made the rest pure churn.
//
// THE COST, AND IT IS REAL RATHER THAN THEORETICAL: a genuine employer edit to
// an advert we ALREADY hold will no longer be picked up automatically. It is
// worth nothing today — zero of 92 — but Goldenkeys did edit that salary, so it
// does happen, and the next one will sit stale until somebody notices.
//
// THIS FLAG IS THEREFORE A STOP-GAP AND MUST NOT QUIETLY BECOME THE PERMANENT
// ANSWER. The real fix updates a row only when a FACT changes — title, salary,
// location, reference, work authorisation — and leaves the prose alone whatever
// the extractor did with it that week. That is a comparison per field rather
// than a flag, which is why it is not this change.
const NO_UPDATE_EXISTING = args.has('--no-update-existing')

// ── env ──
function loadEnv() {
  const env = {}
  // Local dev reads .env.local (or .env). In CI (GitHub Actions) there is no such
  // file — the secrets arrive via process.env — so overlay those on top.
  const f = fs.existsSync('.env.local') ? '.env.local' : fs.existsSync('.env') ? '.env' : null
  if (f) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  for (const k of ['FIRECRAWL_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SITE_URL', 'NEXT_PUBLIC_SITE_URL', 'CRON_SECRET']) {
    if (process.env[k]) env[k] = process.env[k]
  }
  return env
}
const ENV = loadEnv()
const FC_KEY = ENV.FIRECRAWL_API_KEY

function db() {
  return createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

// ── firecrawl credit accounting ──
//
// 1 CREDIT PER PAGE, PLUS 4 FOR THE JSON FORMAT. Every call this file makes
// uses `formats: ['json']`, so every page costs 5. Read from Firecrawl's
// pricing page on 11 Sept 2026: "the JSON, Question, and Highlight formats add
// 4 credits per page".
//
// THIS NUMBER IS WHY THE ACCOUNT WENT TO -21 AND THE ARITHMETIC LOOKED FINE.
// Assuming 1 credit a page makes a full cycle 108 and the plan 46 runs, which
// cannot explain an empty account — and an answer that cannot explain the
// evidence is not an answer. At 5 it is 540 a cycle and 9 runs, which fits.
const CREDITS_PER_PAGE = 5

// THE FLOOR A MANUAL OR DIAGNOSTIC RUN MAY NOT CROSS: two full cycles.
//
// Sized against the WORST CASE rather than the typical one. With the scrape
// filter above, a normal weekly run is ~75 credits — but the week Goldenkeys
// replaces their whole catalogue is 98 new roles, 540 credits, and that is
// exactly the week the import must not be the thing that fails. Two of those
// leaves room for one scheduled run plus a retry.
//
// A SCHEDULED RUN IS NOT HELD TO IT. It refuses only if it cannot finish. The
// point is that measurement must never starve production, not that production
// should be cautious.
const MANUAL_FLOOR = 1080

/** True when running inside the scheduled GitHub Actions import. */
const IS_SCHEDULED = process.env.GITHUB_ACTIONS === 'true'

/**
 * Refuse to start a scrape that cannot finish, or that would eat the reserve.
 *
 * ONE FREE CALL. /v1/team/credit-usage costs nothing and would have turned the
 * whole of 10 Sept from a mystery into a sentence: a 402 arrived as "29 of 98"
 * and read exactly like a schema change breaking extraction. **A partial scrape
 * looks like a complete one**, which is the hazard — records.json is a valid
 * file either way, and apply() cannot tell.
 *
 * IT FAILS OPEN ON A NETWORK ERROR, DELIBERATELY. If the balance cannot be
 * read, that is not a reason to block a scheduled import — the scrape itself
 * will fail honestly with a 402 if there is really no money. What this prevents
 * is the KNOWN-bad start, not every bad start.
 */
async function assertCredits(pages, what) {
  const needed = pages * CREDITS_PER_PAGE
  const reserve = IS_SCHEDULED ? 0 : MANUAL_FLOOR
  let remaining = null
  try {
    const r = await fetch('https://api.firecrawl.dev/v1/team/credit-usage', { headers: { Authorization: `Bearer ${FC_KEY}` } })
    const j = await r.json()
    remaining = j?.data?.remaining_credits
  } catch { /* fall through — see the note above */ }
  if (typeof remaining !== 'number') {
    console.warn(`WARNING: could not read the Firecrawl balance. Proceeding with ${what} (${needed} credits) unchecked.`)
    return
  }
  const after = remaining - needed
  console.log(`credits: ${remaining} remaining · ${what} needs ${needed} (${pages} pages x ${CREDITS_PER_PAGE}) · ${after} after`
    + (IS_SCHEDULED ? ' · SCHEDULED run, no reserve held' : ` · reserve ${MANUAL_FLOOR}`))
  if (after < reserve) {
    throw new Error(
      `REFUSING to start ${what}: ${needed} credits needed, ${remaining} remaining` +
      (reserve ? `, and a manual run may not take the balance below ${MANUAL_FLOOR} (two full cycles, so a scheduled import and one retry always survive).` : '.') +
      (IS_SCHEDULED
        ? ' A scheduled run refuses only when it cannot finish — the account is genuinely empty.'
        : ' Run it from the scheduled workflow, or wait for the billing period to reset.') +
      ' A HALF-FINISHED SCRAPE IS THE REAL HAZARD: records.json is a valid file with 29 of 98 records in it and nothing downstream can tell.'
    )
  }
}

// ── firecrawl ──
async function fcScrape(url, schema, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FC_KEY}` },
        body: JSON.stringify({ url, formats: ['json'], jsonOptions: { schema }, timeout: 30000 }),
      })
      if (r.status === 429) { await sleep(4000 * t); continue }
      const j = await r.json()
      if (j?.data?.json) return j.data.json
      if (t === tries) return null
    } catch (e) {
      if (t === tries) { console.error('  scrape failed', url, e.message); return null }
    }
    await sleep(1500 * t)
  }
  return null
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function pool(items, n, fn) {
  const out = []; let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  }))
  return out
}

// ── parsing ──
const nums = s => (String(s || '').match(/\d[\d,]*\.?\d*/g) || []).map(x => Math.round(parseFloat(x.replace(/,/g, ''))))
function parseSalary(txt) {
  const n = nums(txt).filter(x => x >= 1000) // ignore stray small numbers
  if (!n.length) return { min: null, max: null }
  return { min: n[0], max: n[n.length - 1] }
}
const cleanLoc = l => String(l || '').replace(/,?\s*(uk|united kingdom)\.?$/i, '').trim() || null
// jobs.{responsibilities,requirements,benefits,work_authorization} are text[] —
// normalise whatever the scrape produced into one.
//
// THE ARRAY BRANCH IS THE NORMAL PATH NOW that the schema asks for arrays. The
// string branch is kept deliberately rather than deleted: records.json files
// written before that change still hold strings, and a re-run against an old
// scratch file must not silently produce one-item lists — or worse, split a
// sentence on nothing and lose it.
function toArr(str) {
  if (!str) return null
  if (Array.isArray(str)) {
    const items = str.map(s => String(s).replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean)
    return items.length ? items : null
  }
  const items = String(str).split(/\r?\n+/).map(s => s.replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean)
  return items.length ? items : null
}
/**
 * A scraped list field, on its way into the scratch record.
 *
 * Accepts what the array schema returns, and still accepts a string in case a
 * page yields one — an empty list and an empty string both become null, so
 * "the employer said nothing here" stays distinguishable from "they said
 * nothing useful", which is what the advert renderers key on.
 */
function keepList(v) {
  if (Array.isArray(v)) { const a = v.map(x => String(x).trim()).filter(Boolean); return a.length ? a : null }
  const s = String(v ?? '').trim()
  return s || null
}
const normTitle = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const cleanUrl = u => { try { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/?$/, '/')}` } catch { return null } }

// ── phase: enumerate listing pages -> vacancy URLs ──
async function enumerate() {
  fs.mkdirSync(SCRATCH, { recursive: true })
  // `image` is pulled in the SAME pass that already fetches title+url, so each
  // role's own featured photo costs no extra Firecrawl calls. That image is why
  // this importer can brand a row honestly at insert: it is the picture
  // Goldenkeys publishes for THAT vacancy, not a stock photo we guessed.
  const schema = { type: 'object', properties: { jobs: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' }, image: { type: 'string' } } } } } }
  const seen = new Map()
  // Walk until a page yields nothing new, rather than stopping at a fixed count.
  //
  // WHY THIS MATTERS MORE THAN IT LOOKS: the enumerated set is what apply()
  // treats as "live", and anything absent from it gets reconciled to `archived`.
  // Listings are newest-first, so under a fixed ceiling the OLDEST still-live
  // roles are the ones that fall off the end — and we would have quietly marked
  // them archived while they were still open. A ceiling here doesn't just miss new
  // roles, it actively corrupts existing ones.
  // THE PAGE COUNT IS NOT KNOWN UNTIL THE WALK IS DONE, so this is checked
  // against what the last several runs have taken — 10 pages, plus headroom for
  // the catalogue growing. It is a floor on starting, not a budget.
  await assertCredits(15, 'the listing enumeration (~10 pages, 15 allowed for)')

  let pagesWalked = 0
  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = p === 1 ? BASE : `${BASE}page/${p}/`
    const data = await fcScrape(url, schema)

    // A FAILED page is not an empty page. fcScrape returns null after its
    // retries, which the "no new URLs" check below would read as "we've reached
    // the end" — silently truncating the live set. apply() then treats every
    // role beyond the failure as gone and reconciles it to `archived`. A transient
    // network blip would mass-retire live vacancies, non-deterministically.
    // Abort instead: a run that stops with an error is recoverable, a run that
    // quietly wipes the board is not.
    if (data === null) {
      throw new Error(
        `Enumeration failed on page ${p} (${url}) after retries. Aborting rather than ` +
        `treating a fetch failure as the end of the catalogue — continuing would ` +
        `mark every role beyond this page as archived.`
      )
    }

    const jobs = data?.jobs || []
    let added = 0
    for (const j of jobs) {
      const u = cleanUrl(j.url)
      if (u && u.includes('/vacancies/') && !seen.has(u)) {
        seen.set(u, { title: j.title || '', image: j.image || null })
        added++
      }
    }
    pagesWalked = p
    console.log(`page ${p}: ${jobs.length} listed, ${added} new (total ${seen.size})`)
    // Nothing new on this page: either past the end, or the site is echoing a
    // page we've already taken. Either way there is no more to collect.
    if (added === 0) {
      console.log(`stopping at page ${p} — no new vacancy URLs`)
      break
    }
    if (p === MAX_PAGES) {
      console.warn(`WARNING: hit the ${MAX_PAGES}-page ceiling and page ${p} still had new roles — the catalogue may be truncated. Raise MAX_PAGES.`)
    }
    await sleep(500)
  }
  const list = [...seen].map(([url, v]) => ({ url, title: v.title, image: v.image }))
  fs.writeFileSync(ENUM_FILE, JSON.stringify(list, null, 2))
  const withImage = list.filter(l => l.image).length
  console.log(`\nEnumerated ${list.length} unique vacancy URLs across ${pagesWalked} pages (${withImage} with a featured image) -> ${ENUM_FILE}`)
  return list
}

// ── phase: scrape detail pages -> normalized records ──
async function scrapeDetails() {
  const enumerated = JSON.parse(fs.readFileSync(ENUM_FILE, 'utf8'))

  // UNDER --no-update-existing WE ONLY SCRAPE URLS WE DO NOT ALREADY HOLD.
  //
  // The flag stopped the WRITES and left the READS alone: the run was still
  // fetching all 98 detail pages and discarding 93 of them, at 5 credits each.
  // 490 credits a week to read adverts we had decided not to update.
  //
  // KEYED ON THE SAME FLAG, DELIBERATELY, SO THE TWO CANNOT DRIFT APART. If
  // --no-update-existing is ever taken off the cron, the scrape widens again in
  // the same breath — because "do not update existing" and "do not fetch
  // existing" are the same decision, and a note asking someone to remember
  // both is exactly the coupling this project keeps being bitten by.
  //
  // NOTHING ELSE ON THE PATH NEEDS THE DISCARDED RECORDS, read from the code
  // rather than inferred from a run:
  //   · RECONCILE iterates `existing` and tests membership of `liveUrls`,
  //     which comes from ENUM_FILE. It never touches `recs`.
  //   · BACKFILL matches on `enumList` titles, also from ENUM_FILE. Also never
  //     touches `recs`.
  //   · THE UPSERT is the only consumer, and under the flag its update branch
  //     does nothing, so it only ever needs records for URLs that will INSERT.
  //
  // THE BLAST RADIUS OF A WRONG FILTER IS "NEW ROLES MISSED", NOT "BOARD
  // WIPED" — the reconcile decides what to archive from the enumeration, which
  // this does not touch. That is the reassuring direction, and it is why the
  // database read below throws rather than degrading: scraping nothing is
  // recoverable next week, but it must be loud.
  let list = enumerated
  if (NO_UPDATE_EXISTING) {
    const { data, error } = await db()
      .from('jobs').select('source_url').eq('employer_id', EMPLOYER_ID)
    if (error) throw new Error(`Cannot read existing source_urls, so cannot tell new roles from held ones: ${error.message}`)
    // ANY STATUS, matching apply()'s own urlToId, which is built from every
    // Goldenkeys row rather than the active ones. A URL we hold as ARCHIVED is
    // one the upsert would take down its update branch and skip, so fetching
    // it would be just as wasted.
    const held = new Set(data.map(j => j.source_url).filter(Boolean))
    list = enumerated.filter(item => !held.has(item.url))
    const skipped = enumerated.length - list.length

    // THE THREE NUMBERS MUST ADD UP IN FRONT OF THE READER, and `skipped` is
    // counted FROM THE ENUMERATION rather than from the database.
    //
    // This line used to print `held.size` — every Goldenkeys source_url we
    // hold, 264 of them — against an enumeration of 98. "98 enumerated, 264
    // already held, SCRAPING 5" is three true numbers that answer a question
    // nobody asked, and it cannot distinguish a filter that skipped 93 from
    // one that skipped 98. The figure that matters is how many of THESE were
    // skipped, and it is the one the reader can check: 93 + 5 = 98.
    console.log(`--no-update-existing: ${enumerated.length} enumerated = ${skipped} already held (skipped) + ${list.length} new (scraping)`)
    console.log(`  saved ~${skipped * CREDITS_PER_PAGE} credits by not re-reading adverts we are not updating`)

    // NAME THE URLS WHEN THERE ARE FEW. On a normal week this is a handful, and
    // seeing them is the difference between "the filter found 5 new roles" and
    // "the filter returned a number I am choosing to believe".
    if (list.length && list.length <= 15) for (const item of list) console.log(`    new: ${item.url}`)

    // ZERO NEW IS THE EXPECTED STEADY STATE AND ALSO WHAT A BROKEN FILTER
    // LOOKS LIKE, so it says which one it is rather than leaving a bare 0.
    if (!list.length) {
      console.log(`  every one of the ${enumerated.length} enumerated URLs is already held — Goldenkeys have published nothing new since the last run.`)
      console.log('  (A filter that wrongly excluded everything would print this same line. The check is the enumeration above: if it found 0 URLs, that is the fault — not this.)')
    }
  }

  // THE EXACT COST, not an estimate: by here we know precisely how many pages
  // will be fetched.
  if (list.length) await assertCredits(list.length, `the detail scrape of ${list.length} page(s)`)
  else console.log('nothing new to scrape — 0 credits')

  const schema = { type: 'object', properties: {
    title: { type: 'string' }, location: { type: 'string' }, salary_text: { type: 'string' },
    permanent: { type: 'boolean' }, full_time: { type: 'boolean' }, job_id: { type: 'string' },
    about: { type: 'string' },
    // ASK FOR A LIST AS A LIST. These three are <ul><li> on every Goldenkeys
    // vacancy page and text[] in our own schema — so the source and the column
    // both agree they are lists, and only this request used to disagree.
    //
    // WHEN IT SAID `string` THE MODEL HAD TO CHOOSE A SERIALISATION and nothing
    // told it which: sometimes newline-separated, sometimes comma-joined prose.
    // toArr() then split on /\r?\n+/ — A DELIMITER THE EXTRACTOR WAS NEVER TOLD
    // TO USE — so newlines became six items and commas became one. That is the
    // whole mechanism behind a clean bullet list arriving as a run-on
    // paragraph, and it was never the model being flaky: we forced the choice.
    //
    // Proven 10 Sept 2026 on one vacancy, two calls, one variable:
    //   string -> "£40,000 per annum plus £2,000 service charge, 40-hour
    //              contract across 5 days, responsibility for…"   1 item
    //   array  -> six items, matching the six <li> elements exactly
    responsibilities: { type: 'array', items: { type: 'string' } },
    requirements: { type: 'array', items: { type: 'string' } },
    benefits: { type: 'array', items: { type: 'string' } },
    right_to_work: { type: 'boolean' },
  } }
  let done = 0
  const recs = await pool(list, 5, async (item) => {
    const d = await fcScrape(item.url, schema)
    done++
    if (done % 20 === 0) console.log(`  scraped ${done}/${list.length}`)
    if (!d || !(d.title || item.title)) return null
    // A listing can point at a detail page that 404s (the source leaves dangling
    // links). Firecrawl returns the error page happily, and without this guard we
    // import a live vacancy titled "Page Not Found" with a £0 salary — which is
    // exactly what happened on 27 Jul. Drop it and let the reconcile step retire
    // whatever row already exists for that URL.
    const scrapedTitle = String(d.title || '').trim()
    if (/^(page\s+)?not\s+found$|^404\b|page not found/i.test(scrapedTitle)) {
      console.warn(`  skipping dead detail page: ${item.url}`)
      return null
    }
    const sal = parseSalary(d.salary_text)
    const et = ['Full-time']; et.push(d.permanent === false ? 'Temporary' : 'Permanent')
    return {
      source_url: item.url,
      title: (d.title || item.title).trim(),
      location: cleanLoc(d.location),
      salary_min: sal.min, salary_max: sal.max, salary_type: 'annual',
      employment_type: et,
      description: (d.about || '').trim() || null,
      full_description: (d.about || '').trim() || null,
      // THESE THREE ARRIVE AS ARRAYS NOW and are carried through as arrays.
      // They used to be `(d.x || '').trim()`, which threw the moment the schema
      // started returning lists — loudly, at the first record, which is the
      // right direction for a type change and the reason this consumer was
      // found at all. toArr() in apply() still accepts either shape.
      responsibilities: keepList(d.responsibilities),
      requirements: keepList(d.requirements),
      benefits: keepList(d.benefits),
      work_authorization: d.right_to_work ? 'Right to work in the UK required' : null,
      job_reference: d.job_id ? `GK-${String(d.job_id).trim()}` : null,
    }
  })
  const clean = recs.filter(Boolean)
  fs.writeFileSync(REC_FILE, JSON.stringify(clean, null, 2))
  console.log(`\nScraped ${clean.length}/${list.length} detail records -> ${REC_FILE}`)
  return clean
}

// ── branding ──
//
// WHY THIS LIVES HERE and not in a follow-up script: rows used to reach the
// public board with no banner and no logo, and were only branded when
// scripts/import-goldenkeys-images.mjs was run BY HAND afterwards. The workflow
// never called it, so every scheduled scrape published unbranded listings. On
// 27 Jul that was 16 roles, caught only because Paul saw them on the live site.
//
// Note this uses the role's OWN featured image from Goldenkeys, keyed off the
// vacancy URL — not a stock photo chosen by category. lib/jobBanner.ts is
// explicit that guessing a sector image is "wrong and a little dishonest", and
// it is right; the branded Thrive fallback exists precisely so we never have to
// guess. This isn't guessing — it's the picture Goldenkeys publishes for that
// exact vacancy.

const IMG_EXT = ct => (ct?.includes('png') ? 'png' : ct?.includes('webp') ? 'webp' : 'jpg')

/** Download a source image into our own bucket; returns our public URL. */
async function storeBanner(supa, srcUrl) {
  if (!srcUrl) return null
  try {
    const res = await fetch(srcUrl)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    // Content-addressed by source URL, so re-runs overwrite the same object
    // rather than accumulating duplicates.
    const key = crypto.createHash('sha256').update(srcUrl).digest('hex').slice(0, 20)
    const objPath = `goldenkeys/${key}.${IMG_EXT(ct)}`
    const up = await supa.storage.from('job-banners').upload(objPath, buf, { contentType: ct, upsert: true })
    if (up.error) throw up.error
    return supa.storage.from('job-banners').getPublicUrl(objPath).data.publicUrl
  } catch (e) {
    console.warn(`  banner fetch failed (${srcUrl}): ${e.message}`)
    return null
  }
}

/**
 * The logo this employer already uses, read from an existing row rather than
 * hardcoded — Goldenkeys' logo is a large inline data URI and duplicating it in
 * source would be worse than looking it up once per run.
 */
async function existingLogo(supa) {
  const { data } = await supa
    .from('jobs').select('company_logo_url')
    .eq('employer_id', EMPLOYER_ID).not('company_logo_url', 'is', null)
    .limit(1).maybeSingle()
  return data?.company_logo_url ?? null
}

// ── phase: backfill + upsert + reconcile ──
async function apply() {
  const recs = JSON.parse(fs.readFileSync(REC_FILE, 'utf8'))
  // The full LIVE set is every enumerated vacancy URL (223), NOT only the ones we
  // managed to detail-scrape — so a detail-scrape failure never marks a live role
  // "archived". Un-scraped live roles are simply imported on the next run (idempotent).
  const enumList = JSON.parse(fs.readFileSync(ENUM_FILE, 'utf8'))
  const liveUrls = new Set(enumList.map(e => e.url))
  const supa = db()

  const { data: existing, error: exErr } = await supa
    .from('jobs').select('id, title, source_url, status, company_banner_url, company_logo_url').eq('employer_id', EMPLOYER_ID)
  if (exErr) throw exErr

  // ── SANITY GUARD: does this crawl look plausible? ──
  //
  // The enumerated set IS the live set: anything absent from it gets reconciled
  // to `archived`. So an under-collected crawl doesn't just miss new roles, it
  // retires existing ones. The loud abort in enumerate() catches a page that
  // FAILS; this catches the cases it can't see — a layout change that yields
  // zero links, a redirect to a landing page, a silent partial crawl.
  //
  // A genuine week's churn on this source is a handful of roles. A drop of
  // dozens is a broken crawl, not a quiet week. Pausing on a real drop costs one
  // manual re-run; getting it wrong the other way costs the board.
  const activeNow = existing.filter(j => j.status === 'active').length
  const DROP_TOLERANCE = 0.2
  if (activeNow > 0 && liveUrls.size < activeNow * (1 - DROP_TOLERANCE)) {
    const pct = Math.round((1 - liveUrls.size / activeNow) * 100)
    throw new Error(
      `ABORTING: enumeration found ${liveUrls.size} live roles against ${activeNow} currently active — ` +
      `a ${pct}% drop, past the ${DROP_TOLERANCE * 100}% tolerance. That is far more likely to be a broken ` +
      `crawl than a genuine week's churn, and continuing would reconcile the difference to 'archived'. ` +
      `Re-run manually; if the drop is real, raise DROP_TOLERANCE for that run.`
    )
  }
  console.log(`Sanity: ${liveUrls.size} live vs ${activeNow} active — within tolerance`)

  // Branding inputs, resolved once per run.
  const imageByUrl = new Map(enumList.filter(e => e.image).map(e => [e.url, e.image]))
  const gkLogo = await existingLogo(supa)
  const bannerCache = new Map() // source image URL -> our public URL
  const bannerFor = async srcUrl => {
    if (!srcUrl) return null
    if (!bannerCache.has(srcUrl)) bannerCache.set(srcUrl, await storeBanner(supa, srcUrl))
    return bannerCache.get(srcUrl)
  }
  console.log(`Branding: ${imageByUrl.size} live roles have a featured image | employer logo ${gkLogo ? 'found' : 'MISSING'}`)
  console.log(`Live listing URLs: ${liveUrls.size} | detail records: ${recs.length}`)
  console.log(`Existing GK jobs: ${existing.length} (active ${existing.filter(j => j.status === 'active').length})`)

  // 1) BACKFILL: match existing (no source_url) to a LIVE role by normalized title.
  const enumByNormTitle = new Map()
  for (const e of enumList) if (e.title && !enumByNormTitle.has(normTitle(e.title))) enumByNormTitle.set(normTitle(e.title), e.url)
  let matched = 0, unmatched = 0
  for (const j of existing) {
    if (j.source_url) continue
    const url = enumByNormTitle.get(normTitle(j.title))
    if (url && !existing.some(e => e.source_url === url)) {
      console.log(`  backfill: "${j.title}" -> ${url}`)
      if (!DRY) { const { error } = await supa.from('jobs').update({ source_url: url }).eq('id', j.id); if (error) throw error }
      j.source_url = url; matched++
    } else unmatched++
  }
  console.log(`Backfill: ${matched} matched to live URL, ${unmatched} unmatched`)

  // Refresh existing source_url map (post-backfill) for insert-vs-update decision.
  const urlToId = new Map(existing.filter(j => j.source_url).map(j => [j.source_url, j.id]))

  // 2) UPSERT each scraped role on source_url (update in place if known, else insert).
  let inserted = 0, updated = 0, leftAlone = 0
  const newIds = []
  for (const r of recs) {
    const row = {
      ...r,
      // NOT-NULL columns: default missing salary to 0 ("not disclosed") and
      // location to 'UK' so a role with a "Competitive" salary still imports.
      salary_min: r.salary_min ?? 0,
      salary_max: r.salary_max ?? r.salary_min ?? 0,
      location: r.location || 'UK',
      responsibilities: toArr(r.responsibilities),
      requirements: toArr(r.requirements),
      benefits: toArr(r.benefits),
      work_authorization: r.work_authorization ? [r.work_authorization] : null,
      employer_id: EMPLOYER_ID, company: COMPANY, category: 'hospitality',
      is_recruiter_posting: true, status: 'active',
    }
    const id = urlToId.get(r.source_url)
    const prior = id ? existing.find(j => j.id === id) : null

    // Brand the row. INSERTS always get a banner + logo — that is the whole
    // point of this change. UPDATES only FILL GAPS: an existing banner is never
    // overwritten, so anything set by hand stays put and a re-run is cheap
    // rather than re-downloading every image. That is deliberately unlike
    // scripts/import-goldenkeys-images.mjs, which reassigns every row it can.
    //
    // UNDER --no-update-existing THE BANNER WORK IS SKIPPED FOR EXISTING ROWS
    // TOO, and that is not a tidy-up. bannerFor() DOWNLOADS the image and
    // UPLOADS it into our storage bucket — a real write — and the row it would
    // decorate is one we are about to leave alone. Gating only the database
    // update would leave this uploading objects nothing then references.
    const needsBanner = (!id || !prior?.company_banner_url) && !(id && NO_UPDATE_EXISTING)
    if (needsBanner && !DRY) {
      const url = await bannerFor(imageByUrl.get(r.source_url))
      if (url) row.company_banner_url = url
    }
    if (!id || !prior?.company_logo_url) {
      if (gkLogo) row.company_logo_url = gkLogo
    }

    if (id) {
      // THE SKIP IS HERE AND NOWHERE ELSE, so the insert path below is provably
      // untouched by the flag: new roles still get their banner, their logo and
      // their area resolution, which are already gated on !id.
      if (NO_UPDATE_EXISTING) { leftAlone++; continue }
      if (!DRY) { const { error } = await supa.from('jobs').update(row).eq('id', id); if (error) throw error }
      updated++
    } else {
      if (!DRY) {
        const { data: ins, error } = await supa
          .from('jobs').insert({ ...row, posted_at: new Date().toISOString() }).select('id').single()
        if (error) throw error
        if (ins?.id) newIds.push(ins.id)
      }
      inserted++
    }
  }
  // `updated` IS THE NUMBER TO READ UNDER THE FLAG, and it must be 0. Printing
  // `leftAlone` beside it makes the skip a measurement rather than an absence:
  // 0 updated with 0 left alone would mean the loop never ran at all, which is
  // a different and much worse state than the flag working.
  console.log(`Upsert: ${inserted} inserted, ${updated} updated in place`
    + (NO_UPDATE_EXISTING ? `, ${leftAlone} existing adverts LEFT ALONE (--no-update-existing)` : ''))

  // 2b) AREA RESOLUTION for the rows we just created. Every other path that
  // creates a listing resolves its area; this importer didn't, so a run left
  // brand-new roles with a null area_region. That is NOT harmless: an unresolved
  // job matches EVERY candidate's area filter (deliberately — better shown than
  // hidden), so 17 unresolved London/Bristol/Derbyshire roles would have been
  // recommended to candidates who chose none of those places.
  //
  // Done over HTTP against the deployed app rather than by importing
  // lib/jobAreaSync directly: this script runs under plain `node` in CI, which
  // cannot load a TypeScript module. Needs SITE_URL + CRON_SECRET; without them
  // it says so loudly instead of leaving the gap silent.
  if (!DRY && newIds.length) {
    const site = ENV.SITE_URL || ENV.NEXT_PUBLIC_SITE_URL
    const cron = ENV.CRON_SECRET
    if (!site || !cron) {
      console.warn(
        `WARNING: ${newIds.length} new roles have NO area_region — SITE_URL/CRON_SECRET not set, so they were not resolved.\n` +
        `         They will be recommended to every candidate regardless of location until resolved.`
      )
    } else {
      let resolved = 0
      for (const id of newIds) {
        try {
          const r = await fetch(`${site.replace(/\/$/, '')}/api/jobs/resolve-area`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cron}` },
            body: JSON.stringify({ jobId: id }),
          })
          if (r.ok) resolved++
        } catch { /* degraded-but-safe: a miss means "shown to everyone", not lost */ }
      }
      console.log(`Areas: resolved ${resolved}/${newIds.length} new roles`)
      if (resolved < newIds.length) console.warn(`WARNING: ${newIds.length - resolved} new roles still have no area.`)
    }
  }

  // 3) RECONCILE: active GK jobs whose source_url is NOT in the LIVE listing
  //    -> ARCHIVED.
  //
  // THIS WROTE 'filled' AND THAT WAS A CLAIM WE COULD NOT MAKE. A listing
  // vanishing from Goldenkeys' site means the role left THEIR board. It does
  // not mean a person was hired, it certainly does not mean anyone was hired
  // through Thrive, and we have no way of knowing which. By 24 Aug 2026 this
  // line had asserted 33 placements that never happened.
  //
  // 'filled' MEANS A THRIVE HIRE and nothing else. The other four writers in
  // the repo all honour that — the admin action, the employer marking a
  // candidate hired, lib/confirmHire, and the test seed. This was the only one
  // that did not, and it produced more 'filled' rows than all of them together.
  //
  // 'archived' is the honest word: off the board, reason unknown to us. Both
  // statuses are already off the public board, so nothing a candidate sees
  // changes — the difference is entirely in what we can truthfully say about
  // ourselves.
  let archived = 0
  for (const j of existing) {
    const stillLive = j.source_url && liveUrls.has(j.source_url)
    if (j.status === 'active' && !stillLive) {
      console.log(`  reconcile archived: "${j.title}" (${j.source_url || 'no source_url'})`)
      if (!DRY) { const { error } = await supa.from('jobs').update({ status: 'archived' }).eq('id', j.id); if (error) throw error }
      archived++
    }
  }
  console.log(`Reconcile: ${archived} set to archived`)
  console.log(`\n${DRY ? '[DRY RUN] ' : ''}Done. scraped=${recs.length} inserted=${inserted} updated=${updated} backfilled=${matched} archived=${archived}`
    + (NO_UPDATE_EXISTING ? ` leftAlone=${leftAlone}` : ''))
}

// ── main ──
const run = async () => {
  if (args.has('--all') || args.has('--enumerate')) await enumerate()
  if (args.has('--all') || args.has('--scrape')) await scrapeDetails()
  if (args.has('--all') || args.has('--apply')) await apply()
  if (![...args].some(a => ['--all', '--enumerate', '--scrape', '--apply'].includes(a))) {
    console.log('Specify a phase: --enumerate | --scrape | --apply [--dry-run] | --all')
  }
}
run().catch(e => { console.error(e); process.exit(1) })
