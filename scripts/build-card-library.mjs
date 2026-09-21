// A STANDING CARD LIBRARY: one card set for every live advert, sitting in Drive
// so a person can browse and pick. Not a weekly selection — the board IS the
// library, and choosing is a human job the data cannot do. Measured 20 Sept
// 2026: one category across all 119 adverts, `urgent` set on none of them,
// `venue` empty on every row. There is nothing in the data to rank on.
//
//   node scripts/build-card-library.mjs [--out <dir>] [--limit N] [--dry-run] [--force]
//
// WHAT IT WRITES: three cards per advert into the existing card-label folders,
// one caption per advert into "Post captions", and one manifest at the root.
// IT POSTS NOTHING AND SENDS NOTHING. The only network calls are reads.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { money } from './lib/social-pay.mjs'

const DRIVE_ROOT = 'G:/My Drive/Thrive Career Platform/Thrive — Marketing/Thrive Social/Job posts'
const outFlag = process.argv.indexOf('--out')
const OUT_DIR = outFlag > -1 ? process.argv[outFlag + 1] : DRIVE_ROOT
const limFlag = process.argv.indexOf('--limit')
const LIMIT = limFlag > -1 ? Number(process.argv[limFlag + 1]) : Infinity
const DRY = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')

const MANIFEST = path.join(OUT_DIR, '_card-library-manifest.json')
const CAPTION_DIR = path.join(OUT_DIR, 'Post captions')

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// EVERY TEXT FIELD AN ADVERT CARRIES — not `benefits` alone.
//
// That was a real error on 20 Sept 2026: Host key their money in
// `full_description`, and a scan of `benefits` reported "20 of 20 state no
// wage" when 19 of 20 do. A field list is a claim about where the words are,
// so it is written out here rather than assumed anywhere downstream.
const TEXT_FIELDS = ['description', 'full_description', 'responsibilities', 'requirements', 'benefits']
const asText = v => Array.isArray(v) ? v.filter(Boolean).join(' | ') : (v || '')
const MONEY_RE = /£\s?\d[\d,]*(?:\.\d+)?\s*(?:k\b)?/i

/**
 * Every sentence in the advert's own text that states a money figure, VERBATIM.
 *
 * NOTHING HERE COMPOSES A BREAKDOWN — it quotes. Where an advert does not break
 * its package down, this returns nothing and the role is flagged thin, which is
 * the honest outcome: a breakdown we assembled would be us editorialising
 * somebody else's advert in our own voice, on our own channel.
 */
function paySentences(job) {
  const out = []
  const seen = new Set()
  for (const field of TEXT_FIELDS) {
    const text = asText(job[field])
    if (!text) continue
    for (const raw of text.split(/(?<=[.!?])\s+|\s\|\s|\n+/)) {
      const sentence = raw.trim().replace(/\s+/g, ' ')
      if (!sentence || !MONEY_RE.test(sentence)) continue
      const key = sentence.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ field, sentence })
    }
  }
  return out
}

function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) } catch { return {} }
}

// THE MANIFEST IS KEYED ON JOB ID AND A FILENAME IS A VALUE IN IT, NEVER A KEY.
//
// Card filenames are built from the advert TITLE. An employer editing a title
// would otherwise present as a new job — writing a second set of cards for one
// role rather than recognising the set already there. The id is the only thing
// about an advert that cannot be edited.
function hasCards(entry) {
  if (!entry || !entry.cards) return false
  const files = Object.values(entry.cards)
  return files.length === 3 && files.every(f => fs.existsSync(f))
}

function captionFor(job, entry, sentences) {
  const url = `https://thrivecareer.co.uk/job/${job.id}`
  const place = [job.location, job.area].filter(Boolean)
  const where = place.length && place[1] && place[1].toLowerCase().startsWith(place[0].toLowerCase())
    ? place[1] : place.join(', ')
  const figure = entry.cardFigure
  const L = []
  L.push(`# ${job.title}`)
  L.push('')
  L.push(`${job.company} · ${where}${figure ? ` · ${figure}` : ''}`)
  L.push(`Job id \`${job.id}\` · live on the board`)
  L.push('')
  L.push('Cards in this folder, from `scripts/make-social-card.mjs`:')
  for (const file of Object.values(entry.cards)) L.push(`- \`${path.basename(file)}\``)
  L.push('')
  L.push('---')
  L.push('')
  L.push('## Pay')
  L.push('')
  L.push(`THE CARD SHOWS **${figure || '(no figure — the row holds none)'}** — the stored package`)
  L.push('figure, which matches how the agency advertises the role itself.')
  L.push('The breakdown is this caption\u2019s job, not the card\u2019s.')
  L.push('')
  if (sentences.length) {
    L.push('**The breakdown, in the advert\u2019s own words** — quoted verbatim, nothing composed:')
    L.push('')
    for (const s of sentences) L.push(`> ${s.sentence}   \`[${s.field}]\``)
  } else {
    L.push('**THIS ADVERT DOES NOT BREAK THE PACKAGE DOWN ANYWHERE IN ITS OWN TEXT.**')
    L.push('')
    L.push('No sentence in any of its fields states a money figure, so there is nothing')
    L.push('to quote and nothing has been invented. This caption is thin on purpose. If')
    L.push('you want a breakdown here it has to come from the agency, not from us.')
  }
  L.push('')
  L.push('---')
  L.push('')
  L.push('## What the advert says')
  L.push('')
  L.push(String(job.description || '(the row carries no description)').trim())
  L.push('')
  L.push('---')
  L.push('')
  L.push('## First comment')
  L.push('')
  L.push('Full advert and one-tap apply:')
  L.push(url)
  L.push('')
  L.push('---')
  L.push('')
  L.push('*Generated by `scripts/build-card-library.mjs`. Every fact above comes from the')
  L.push('row or from the advert\u2019s own text. The post copy itself is yours to write — this')
  L.push('file carries the facts so you are not re-reading the advert to find them.*')
  return L.join('\r\n')
}

async function main() {
  if (outFlag === -1 && !fs.existsSync(DRIVE_ROOT)) {
    console.error('Google Drive is not mounted, so the library has nowhere to land.')
    console.error(`  expected: ${DRIVE_ROOT}`)
    console.error('  start Google Drive for Desktop, or pass --out <dir>.')
    process.exitCode = 2
    return
  }

  const { data: jobs, error } = await supa.from('jobs')
    .select('id, title, company, location, area, description, full_description, responsibilities, requirements, benefits, salary_min, salary_max, salary_type, company_banner_url')
    .eq('status', 'active')
    .order('company', { ascending: true })
  if (error) throw error

  console.log(`\nlive adverts : ${jobs.length}`)
  console.log(`out          : ${OUT_DIR}`)
  console.log(`mode         : ${DRY ? 'DRY RUN — nothing will be written' : 'writing'}${FORCE ? '  (FORCE: regenerating existing)' : ''}`)
  if (LIMIT !== Infinity) console.log(`limit        : ${LIMIT}`)
  console.log('')

  const manifest = readManifest()
  const stats = { built: 0, skippedExisting: 0, skippedNoBanner: 0, failed: 0, withPay: 0, withoutPay: 0, thin: 0 }
  const noBanner = []
  const failures = []
  const thinRoles = []
  let considered = 0

  for (const job of jobs) {
    if (considered >= LIMIT) break

    // A NULL BANNER IS AN ORDINARY STATE, NOT A CRASH. One live Host advert has
    // none, and the generator does an unguarded fetch on that column — so an
    // unfiltered run would die at whatever point it happened to reach that row,
    // having built everything before it and nothing after.
    if (!job.company_banner_url) {
      stats.skippedNoBanner++
      noBanner.push(job.title)
      console.log(`SKIP  no banner   ${job.title}`)
      continue
    }
    if (!FORCE && hasCards(manifest[job.id])) {
      stats.skippedExisting++
      continue
    }
    considered++

    // --force MUST CLEAR THE OLD FILES FIRST, and this is not a tidy-up.
    //
    // The generator never overwrites: it bumps to "… (2).jpg" when the name is
    // taken, deliberately, because a card that has already been posted must not
    // change under the post. That is right for a single run and wrong for a
    // regenerate — without this, --force DOUBLES the library instead of
    // refreshing it, and the second file's name then defeats the stem rule
    // below so its caption lands under a nonsense filename. Both were observed
    // on 21 Sept 2026 before this existed.
    if (FORCE && manifest[job.id]) {
      for (const f of Object.values(manifest[job.id].cards || {})) {
        if (fs.existsSync(f)) fs.rmSync(f)
      }
      const oldCaption = manifest[job.id].captionFile
      if (oldCaption && fs.existsSync(oldCaption)) fs.rmSync(oldCaption)
    }

    const figure = money(Number(job.salary_min), Number(job.salary_max), job.salary_type)
    const sentences = paySentences(job)

    if (DRY) {
      console.log(`WOULD BUILD  ${(figure || 'no figure').padEnd(16)} ${String(sentences.length).padStart(2)} quote(s)  ${job.title}`)
      if (figure) stats.withPay++; else stats.withoutPay++
      if (!sentences.length) { stats.thin++; thinRoles.push(job.title) }
      continue
    }

    const args = ['scripts/make-social-card.mjs', job.id]
    if (outFlag > -1) args.push('--out', OUT_DIR)
    const run = spawnSync(process.execPath, args, { encoding: 'utf8' })

    // THE GENERATOR NAMES THE FILES, SO THE MANIFEST READS THEM BACK OFF ITS
    // OWN OUTPUT rather than recomputing the naming rule. A second copy of that
    // rule would drift the first time the sanitiser changed, and the manifest
    // would then point at paths that do not exist while looking perfectly fine.
    const written = (run.stdout || '').split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => /\.jpg$/i.test(l) && (l.includes('/') || l.includes('\\')))

    // exit 1 from the generator means LOW CONTRAST — the file is still written,
    // and that is a note rather than a failure. Anything above 1 is a refusal.
    if (run.status > 1 || written.length !== 3) {
      stats.failed++
      failures.push({ title: job.title, id: job.id, status: run.status, wrote: written.length })
      console.log(`FAIL  exit ${run.status}  wrote ${written.length}/3  ${job.title}`)
      const firstErr = (run.stderr || '').trim().split(/\r?\n/)[0]
      if (firstErr) console.log('      ' + firstErr)
      continue
    }

    const cards = {}
    for (const file of written) {
      const base = path.basename(file, '.jpg')
      cards[base.slice(base.lastIndexOf(' - ') + 3)] = file
    }
    // The caption's name derives from the card the generator actually wrote, so
    // it inherits that sanitising instead of repeating it.
    const feed = written.find(f => f.includes('1080x1350')) || written[0]
    // The trailing " (2)" is the generator's collision bump. It should never be
    // reached now that --force clears first, but the stem rule tolerates it
    // rather than silently producing a caption filename with a dimension in it.
    const stem = path.basename(feed, '.jpg').replace(/ - [^-]*\(\d+x\d+\)(?: \(\d+\))?$/, '')

    const entry = {
      id: job.id,
      title: job.title,
      company: job.company,
      cardFigure: figure,
      hasPayLine: Boolean(figure),
      paySentences: sentences.map(s => s.sentence),
      paySentenceFields: sentences.map(s => s.field),
      thin: sentences.length === 0,
      cards,
      lowContrast: run.status === 1,
      generatedAt: new Date().toISOString(),
    }

    fs.mkdirSync(CAPTION_DIR, { recursive: true })
    const captionFile = path.join(CAPTION_DIR, `${stem} - posts.md`)
    fs.writeFileSync(captionFile, captionFor(job, entry, sentences))
    entry.captionFile = captionFile

    // Written after EVERY advert, not once at the end. A run that dies at
    // advert 80 has still built 79 sets, and a manifest that only exists on a
    // clean finish would make the next run rebuild all of them.
    manifest[job.id] = entry
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))

    stats.built++
    if (figure) stats.withPay++; else stats.withoutPay++
    if (entry.thin) { stats.thin++; thinRoles.push(job.title) }
    console.log(`built ${String(stats.built).padStart(3)}  ${(figure || 'no figure').padEnd(16)} ${String(sentences.length).padStart(2)} quote(s)  ${job.title}`)
  }

  console.log('\n----------------------------------------------------------------')
  console.log(`built              ${stats.built}`)
  console.log(`skipped, existing  ${stats.skippedExisting}`)
  console.log(`skipped, no banner ${stats.skippedNoBanner}`)
  console.log(`failed             ${stats.failed}`)
  console.log('')
  // THE SPLIT, PRINTED EVERY RUN.
  //
  // "Everything came out blank" is what a broken pay path looks like from the
  // outside, and it is indistinguishable from a board that genuinely states no
  // wages unless both numbers are on the screen together.
  console.log(`PAY LINE ON THE CARD :  ${stats.withPay} with   ${stats.withoutPay} without`)
  console.log(`CAPTION BREAKDOWN    :  ${(DRY ? considered : stats.built) - stats.thin} quoted   ${stats.thin} THIN (the advert states none)`)

  if (noBanner.length) {
    console.log('\nno banner, skipped:')
    noBanner.forEach(t => console.log('  ' + t))
  }
  if (thinRoles.length) {
    console.log('\nTHIN captions — the advert breaks nothing down, so nothing was invented:')
    thinRoles.slice(0, 40).forEach(t => console.log('  ' + t))
    if (thinRoles.length > 40) console.log(`  ... and ${thinRoles.length - 40} more`)
  }
  if (failures.length) {
    console.log('\nFAILURES:')
    failures.forEach(f => console.log(`  exit ${f.status}  wrote ${f.wrote}/3  ${f.title}  ${f.id}`))
  }

  // THE ZERO GUARD. A run that produced nothing must say so loudly rather than
  // ending on a tidy summary — the 7 September scrape already proved that an
  // empty week and a broken week look identical from outside.
  const attempted = stats.built + stats.failed
  if (!DRY && attempted === 0) {
    console.log('\n****************************************************************')
    console.log('NOTHING WAS BUILT.')
    if (stats.skippedExisting > 0) {
      console.log(`Every advert considered already had all three cards on disk (${stats.skippedExisting}).`)
      console.log('That is the expected state on a second run. Pass --force to regenerate.')
    } else {
      console.log('And nothing was skipped as already-present either, so the query returned')
      console.log('adverts this run could not act on. Read the list above before assuming')
      console.log('the board is simply quiet.')
      process.exitCode = 1
    }
    console.log('****************************************************************')
  }
  if (stats.failed > 0) process.exitCode = 1
  console.log('')
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1) })
