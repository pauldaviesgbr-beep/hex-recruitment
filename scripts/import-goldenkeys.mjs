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
// split a scraped bullet/paragraph string into an array of items.
function toArr(str) {
  if (!str) return null
  const items = String(str).split(/\r?\n+/).map(s => s.replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean)
  return items.length ? items : null
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
  const list = JSON.parse(fs.readFileSync(ENUM_FILE, 'utf8'))
  const schema = { type: 'object', properties: {
    title: { type: 'string' }, location: { type: 'string' }, salary_text: { type: 'string' },
    permanent: { type: 'boolean' }, full_time: { type: 'boolean' }, job_id: { type: 'string' },
    about: { type: 'string' }, responsibilities: { type: 'string' }, requirements: { type: 'string' },
    benefits: { type: 'string' }, right_to_work: { type: 'boolean' },
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
      responsibilities: (d.responsibilities || '').trim() || null,
      requirements: (d.requirements || '').trim() || null,
      benefits: (d.benefits || '').trim() || null,
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
  let inserted = 0, updated = 0
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
    const needsBanner = !id || !prior?.company_banner_url
    if (needsBanner && !DRY) {
      const url = await bannerFor(imageByUrl.get(r.source_url))
      if (url) row.company_banner_url = url
    }
    if (!id || !prior?.company_logo_url) {
      if (gkLogo) row.company_logo_url = gkLogo
    }

    if (id) {
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
  console.log(`Upsert: ${inserted} inserted, ${updated} updated in place`)

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
  console.log(`\n${DRY ? '[DRY RUN] ' : ''}Done. scraped=${recs.length} inserted=${inserted} updated=${updated} backfilled=${matched} archived=${archived}`)
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
