// A JOB ADVERT AS AN INSTAGRAM POST.
//
// The board card is 16:11 and Instagram's feed wants 4:5, so this is not a
// screenshot of the card — it is the same INGREDIENTS re-proportioned: the
// employer's photograph, the overlay, the role, the place and the pay, plus the
// Thrive mark.
//
// THE THRIVE MARK BELONGS HERE AND NOT ON THE JOB CARD. Design's whole
// objection to the old fallback was our branding sitting on somebody else's
// advert. This is Thrive's own Instagram account posting Thrive's own content,
// so the mark is the honest thing rather than the intrusive one.
//
// EVERY WORD COMES FROM THE ROW. Nothing is written for the picture: no
// invented benefits, no "apply now", no claim the employer did not make.
//
//   node scripts/make-social-card.mjs <job-id> [--out <dir>] [--flat]
//
// Writes THREE cards — 1080x1350 for the feed, and two 1080x1920 (Instagram
// Story and TikTok, which share a size and are not interchangeable). Reads the
// database; writes only image files to disk. By default they land in the Drive
// folder, each in a subfolder NAMED FOR ITS LABEL — the same string that names
// the file — so the folder and the file cannot drift apart. --flat writes them
// all into one directory instead.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { bottomSafePx } from './lib/social-formats.mjs'

const JOB_ID = process.argv[2]
if (!JOB_ID) { console.error('usage: node scripts/make-social-card.mjs <job-id> [--out <dir>] [--flat] [--salary "<text>"]'); process.exit(2) }
// CARDS LAND IN DRIVE AS THEY ARE GENERATED, so there is no upload step.
//
// G: is Google Drive for Desktop's streaming mount on this machine. A write
// here reaches Drive on its own — measured 20 Sept 2026 at about one minute
// from the write to the file being readable through the Drive API, which is
// the only check that means anything: "written to G:" and "present in Drive"
// are two different claims and only the second one is the promise.
//
// IT REFUSES RATHER THAN FALLING BACK TO Downloads. A silent fallback is the
// fault this project keeps recording — you would believe the cards were in
// Drive, they would be on one laptop, and nothing would say otherwise. The
// remedy is named in the message, and --out still points it anywhere.
const DRIVE_ROOT = 'G:/My Drive/Thrive Career Platform/Thrive — Marketing/Thrive Social/Job posts'
const outFlag = process.argv.indexOf('--out')
const OUT_DIR = outFlag > -1 ? process.argv[outFlag + 1] : DRIVE_ROOT
const FLAT = process.argv.includes('--flat')

// THE FOLDER IS THE LABEL. Not a map from platform to a folder name — the
// SAME STRING that names the file names the directory it goes in, so the two
// can never disagree and a new format brings its own folder with it.
//
// It replaces a table keyed on platform, which was already better than keying
// on the dimension (Story and TikTok are BOTH 1080x1920 and are NOT
// interchangeable — Instagram reserves 20% at the foot, TikTok 30%). But a
// table is still a second copy of a decision the label already carries, and a
// second copy does not stay a copy: rename a folder and the map is silently
// wrong, which is exactly what happened on 20 Sept 2026 when the folders were
// renamed to these labels and the map still pointed at the old names.

// --salary IS PRINTED VERBATIM AND IS THE ONLY WAY TO STATE A BASE.
//
// The Goldenkeys importer parses one `salary_text` string, so where the source
// names a single figure it writes salary_min = salary_max = THE FOLDED TOTAL —
// base plus service charge. A card built from those columns therefore prints a
// PACKAGE where a candidate reads a SALARY. Measured 11 Sept 2026: the Junior
// Sous Chef in Berkshire holds 46700 against an advert reading "£41,700 per
// annum plus £5,000 service charge", and its card printed £47k.
//
// THE BASE EXISTS NOWHERE IN ANY COLUMN. It is a sentence in the benefits
// prose, so a person reading the advert is the only honest source for it —
// which is a feature rather than a cost: anything derived would be invented.
const salFlag = process.argv.indexOf('--salary')
const SALARY_OVERRIDE = salFlag > -1 ? process.argv[salFlag + 1] : null
if (salFlag > -1 && (!SALARY_OVERRIDE || SALARY_OVERRIDE.startsWith('--'))) {
  console.error('--salary needs a value, e.g. --salary "£35,000 + service charge"')
  process.exit(2)
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Wrap to a character budget. Crude, and right enough for two or three lines. */
const wrap = (text, perLine) => {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    if (line && (line + ' ' + w).length > perLine) { lines.push(line); line = w }
    else line = line ? line + ' ' + w : w
  }
  if (line) lines.push(line)
  return lines
}

/**
 * THE EN DASH SPLITS THE ROLE FROM THE MARKETING PHRASE — 244 of the 247
 * imported titles use it. On the BOARD, cutting there is destructive: forty
 * cards collapse to "Chef De Partie · Goldenkeys Recruitment". On a single
 * poster it is the opposite of destructive, because both halves are kept and
 * given the size they deserve — the role large, the phrase as a strapline.
 */
const splitTitle = title => {
  const i = String(title).indexOf('–')
  if (i < 0) return { role: String(title).trim(), strap: null }
  return { role: title.slice(0, i).trim(), strap: title.slice(i + 1).trim() }
}

const money = (min, max, type) => {
  const per = type === 'annual' ? '/year' : '/hour'
  const k = n => (type === 'annual' && n >= 1000 ? `£${Math.round(n / 1000)}k` : `£${n}`)
  if (!min && !max) return null
  if (!max || min === max) return `${k(min)}${per}`
  return `${k(min)}–${k(max)}${per}`
}

async function render({ job, width, height, label, platform }) {
  const res = await fetch(job.company_banner_url)
  if (!res.ok) throw new Error(`${res.status} fetching the banner`)
  const photo = Buffer.from(await res.arrayBuffer())

  // 'attention' rather than a centre crop: these are room photographs and the
  // subject is rarely dead centre.
  const base = await sharp(photo)
    .rotate()
    .resize(width, height, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer()

  const { role, strap } = splitTitle(job.title)
  // The override wins and is printed exactly as typed — no parsing, no
  // rounding. A person read the advert and this is what it says.
  const pay = SALARY_OVERRIDE || money(Number(job.salary_min), Number(job.salary_max), job.salary_type)
  const place = [job.location, job.area].filter(Boolean)
  const where = place.length && place[1] && place[1].toLowerCase().startsWith(place[0].toLowerCase())
    ? place[1] : place.join(', ')

  // Type scale from the canvas, so feed and story share one set of rules.
  const pad = Math.round(width * 0.078)
  const roleSize = Math.round(width * (role.length > 34 ? 0.072 : 0.086))
  const strapSize = Math.round(width * 0.034)
  const metaSize = Math.round(width * 0.038)
  const eyebrowSize = Math.round(width * 0.030)

  const roleLines = wrap(role, role.length > 34 ? 22 : 18)
  const strapLines = strap ? wrap(strap, 40).slice(0, 2) : []

  // THE FLOOR THE TYPE STANDS ON, and it is not the bottom of the image.
  //
  // The platform's own UI sits below it. Before this, the card laid its type up
  // from a 4% pad off the bottom edge — which on the 9:16 output put every word
  // of it (78–96% of the frame) underneath a UI that starts at 70%. On the 4:5
  // feed the reservation is zero, so that card is laid out exactly as it always
  // was and this changes nothing about it.
  const safePx = bottomSafePx(platform, height)
  const typeFloor = height - safePx
  let y = typeFloor - pad
  const chips = []
  if (pay || where) {
    // THE META LINE HAS TO WRAP, because --salary can be any length.
    //
    // It used to be one unwrapped <text>. That was safe only while the pay
    // string came from money(), which is never longer than "£34,500–£38,000/year"
    // — and the moment a person typed "£60,000 + quarterly bonus" the line ran
    // off the right edge of the card and the pay was cut mid-word. SVG does not
    // wrap and it does not complain; it just draws past the canvas.
    const metaText = [where, pay].filter(Boolean).join('   ·   ')
    const metaPerLine = Math.max(12, Math.floor((width - pad * 2) / (metaSize * 0.56)))
    const metaLines = wrap(metaText, metaPerLine)
    for (const line of [...metaLines].reverse()) {
      chips.push(`<text x="${pad}" y="${y}" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="${metaSize}" font-weight="600" fill="#FFFFFF">${esc(line)}</text>`)
      y -= Math.round(metaSize * 1.35)
    }
    y -= Math.round(metaSize * 0.55)
  }
  for (const line of [...strapLines].reverse()) {
    chips.push(`<text x="${pad}" y="${y}" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="${strapSize}" font-weight="500" fill="#FFE500" letter-spacing="1.5">${esc(line.toUpperCase())}</text>`)
    y -= Math.round(strapSize * 1.5)
  }
  y -= Math.round(roleSize * 0.35)
  for (const line of [...roleLines].reverse()) {
    chips.push(`<text x="${pad}" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-size="${roleSize}" font-weight="700" fill="#FFFFFF">${esc(line)}</text>`)
    y -= Math.round(roleSize * 1.14)
  }
  y -= Math.round(eyebrowSize * 0.8)
  chips.push(`<text x="${pad}" y="${y}" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="${eyebrowSize}" font-weight="500" fill="rgba(255,255,255,0.86)">${esc(job.company)}${job.is_recruiter_posting ? ' · via recruiter' : ''}</text>`)

  // The scrim starts above the tallest block so the type always has ground.
  // A LONGER, STRONGER LEAD-IN THAN THE BOARD CARD USES. That card sits at
  // ~360px where a light gradient is enough; at 1080 the photograph carries far
  // more detail under the type, and the first render left the company line grey
  // on pale marble. The contrast report below is the check, not my eye.
  const scrimTop = Math.max(0, y - Math.round(height * 0.17)) / height

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="${scrimTop.toFixed(3)}" stop-color="#0A1628" stop-opacity="0"/>
        <stop offset="${Math.min(1, scrimTop + 0.16).toFixed(3)}" stop-color="#0A1628" stop-opacity="0.86"/>
        <stop offset="1" stop-color="#0A1628" stop-opacity="0.97"/>
      </linearGradient>
      <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0A1628" stop-opacity="0.42"/>
        <stop offset="0.24" stop-color="#0A1628" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#top)"/>
    <rect width="${width}" height="${height}" fill="url(#scrim)"/>
  </svg>`

  // THE TYPE IS A SEPARATE LAYER FROM THE GROUND IT SITS ON, so the contrast
  // check below can measure the GROUND. Measuring the finished image samples
  // the white glyphs against themselves and reports a confident 1.0:1 — which
  // is exactly what the first version of that check did.
  const typeSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${chips.join('\n    ')}
  </svg>`

  // The Thrive mark, top-left, small. Thrive's own account, Thrive's own post.
  //
  // A SOLID YELLOW BAND ACROSS THE FOOT WAS TRIED ON 11 SEPT 2026 AND DROPPED.
  // It carried the wordmark and the address and it read well at thumbnail size,
  // and it was still the wrong trade: it took a strip off every card, pushed the
  // type up, and on the 9:16 left a dead band of scrim between itself and the
  // platform's UI. The mark alone keeps the photograph full-bleed, which is the
  // thing the card is actually selling. Brand second, job first.
  const markSize = Math.round(width * 0.085)
  const mark = await sharp(path.join(process.cwd(), 'public', 'logo', 'thrive-mark-512.png'))
    .resize(markSize, markSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  // Ground = photograph + scrim, no type. This is what the check reads.
  const ground = await sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png().toBuffer()

  // NAMED BY THE JOB, because these are picked out of a folder by a person
  // about to post one. `thrive-feed-c05907b6.jpg` tells them nothing.
  //
  // AND IT NEVER SILENTLY OVERWRITES. Titles are not unique — two live rows
  // both read "Junior Sous Chef – Luxury Boutique Hotel" — so a title-only
  // filename can collide with a DIFFERENT job's card. A collision gets a
  // numbered suffix and a line saying so, rather than quietly replacing a card
  // that may already have been posted.
  const safeTitle = String(job.title)
    .replace(/[‒-―]/g, '-')      // en/em dashes -> hyphen
    .replace(/[\\/:*?"<>|]/g, '')          // illegal on Windows
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
  // A LABEL THAT CANNOT BE A DIRECTORY IS A REFUSAL, NOT A QUIET REWRITE.
  // Sanitising it here would make the folder and the filename disagree, which
  // is the one thing this arrangement exists to prevent.
  if (/[\\/:*?"<>|]/.test(label)) {
    throw new Error(`label "${label}" cannot be a folder name — it carries a character illegal in a path`)
  }
  const destDir = FLAT ? OUT_DIR : path.join(OUT_DIR, label)
  fs.mkdirSync(destDir, { recursive: true })

  let file = path.join(destDir, `${safeTitle} - ${label}.jpg`)
  let bump = 1
  while (fs.existsSync(file)) {
    bump++
    file = path.join(destDir, `${safeTitle} - ${label} (${bump}).jpg`)
  }
  if (bump > 1) console.log(`         NOTE: "${safeTitle} - ${label}.jpg" already existed — written as (${bump})`)
  await sharp(ground)
    .composite([
      { input: Buffer.from(typeSvg), top: 0, left: 0 },
      { input: mark, top: pad, left: pad },
    ])
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(file)

  // CONTRAST, MEASURED ON THE FINISHED PIXELS.
  //
  // Not on the scrim's declared opacity, which is a request rather than a
  // result — the photograph underneath decides the answer, and a marble wall is
  // a very different ground from a dark kitchen. The first render put the
  // company line grey on pale stone and looked fine in the stylesheet.
  //
  // Sampled across the band each line of type occupies: the WORST row is the
  // one that matters, because one bright patch is all it takes.
  const raw = await sharp(ground).raw().toBuffer({ resolveWithObject: true })
  const { data, info } = raw
  const lum = (r, g, b) => {
    const c = [r, g, b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  let worst = Infinity
  const top = Math.max(0, Math.round(y - eyebrowSize))
  // Scan only where the TYPE is. It used to run to the bottom edge, which on a
  // story measured 384px of ground no white glyph ever sits on.
  for (let row = top; row < typeFloor; row += 6) {
    for (let col = pad; col < width - pad; col += 12) {
      const i = (row * info.width + col) * info.channels
      const ratio = (1.0 + 0.05) / (lum(data[i], data[i + 1], data[i + 2]) + 0.05)
      if (ratio < worst) worst = ratio
    }
  }

  const stat = fs.statSync(file)
  const verdict = worst >= 4.5 ? 'ok' : 'LOW'
  // PRINT THE GEOMETRY, so the placement is a number on the screen rather than
  // a hope. The fault this replaces was invisible precisely because nothing
  // ever said where the type had landed.
  console.log(`  ${label.padEnd(6)} ${width}x${height}  ${(stat.size / 1024).toFixed(0)}kB  contrast ${worst.toFixed(1)}:1 ${verdict}`)
  console.log(`         type ${(100 * top / height).toFixed(1)}%–${(100 * typeFloor / height).toFixed(1)}%   ${platform} UI from ${(100 * (height - safePx) / height).toFixed(1)}%`)
  console.log(`         ${file}`)
  if (worst < 4.5) process.exitCode = 1
  return file
}

async function main() {
  const { data: job, error } = await supa.from('jobs')
    .select('id, title, company, location, area, salary_min, salary_max, salary_type, company_banner_url, is_recruiter_posting, status, benefits')
    .eq('id', JOB_ID).single()
  if (error) throw error
  if (!job.company_banner_url) throw new Error('this advert has no photograph — nothing to build from')

  console.log(`\n${job.title}\n${job.company} · ${job.location} · ${job.status}\n`)

  // THE GUARD: REFUSE RATHER THAN PRINT A NUMBER THAT MIGHT BE A PACKAGE.
  //
  // min === max on a Goldenkeys row is exactly the state in which the column
  // MIGHT be a folded total and nothing in the data can say whether it is. Of
  // the Junior Sous Chef rows alone, most are base + service charge folded
  // together, and a few ("£42,931 per annum", "Up to £39,000") genuinely are
  // flat. THEY ARE INDISTINGUISHABLE FROM THE COLUMNS. So the refusal is not a
  // claim that this row is wrong — it is a refusal to guess which kind it is,
  // and the fix is for a person to read the advert.
  const folded = job.company === 'Goldenkeys Recruitment'
    && Number(job.salary_min) === Number(job.salary_max)
    && Number(job.salary_min) > 0
  if (folded && !SALARY_OVERRIDE) {
    console.error(`REFUSING: this row holds salary_min = salary_max = ${Number(job.salary_min)}.`)
    console.error('On a Goldenkeys advert that is usually the FOLDED TOTAL — base plus service')
    console.error('charge — and the base exists only in the benefits prose, not in any column.')
    console.error('Printing it would advertise a package as a guaranteed salary.')
    console.error('\nRead the advert and pass what it actually says, e.g.')
    console.error('  --salary "£35,000 + service charge"')
    console.error(`\nThe benefits line on this row reads:\n  ${(job.benefits || []).join(' | ').slice(0, 300) || '(empty)'}`)
    // SET THE CODE AND RETURN, never process.exit() here. The supabase client
    // still holds an open socket, and exiting under it on Windows trips a libuv
    // assertion — which replaces the refusal's exit 2 with 127, the code that
    // means "command not found". A guard whose exit status lies about why it
    // stopped is worse than no guard, because 127 reads as a broken script
    // rather than a deliberate refusal.
    process.exitCode = 2
    return
  }

  // THE MOUNT IS NOT ALWAYS THERE. Drive for Desktop is a streaming virtual
  // drive, so an unmounted G: is an ordinary state rather than a broken one —
  // and it must stop the run rather than quietly write somewhere else.
  if (outFlag === -1 && !fs.existsSync(DRIVE_ROOT)) {
    console.error('Google Drive is not mounted, so the cards have nowhere to land.')
    console.error(`  expected: ${DRIVE_ROOT}`)
    console.error('  start Google Drive for Desktop, or pass --out <dir> to write elsewhere.')
    process.exitCode = 2
    return
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  // FEED is 4:5 and serves LinkedIn, Instagram and Facebook — none of those
  // overlay the image, so one file covers all three.
  //
  // STORY and TIKTOK are both 1080x1920 AND THEY ARE NOT INTERCHANGEABLE.
  // Instagram reserves 20% at the foot, TikTok 30%. A card laid out for
  // Instagram has its bottom line — the place and the pay — sitting inside
  // TikTok's caption and button column. Same pixels, different furniture.
  // THE LABEL IS THE FILENAME AND THE FILENAME IS THE INSTRUCTION. "feed" and
  // "story" describe a shape; the person holding the phone needs to know which
  // app it goes in, and a 4:5 that serves three platforms has to say all three.
  await render({ job, width: 1080, height: 1350, label: 'LinkedIn, Instagram, Facebook (1080x1350)', platform: 'instagram_feed' })
  await render({ job, width: 1080, height: 1920, label: 'Instagram Story (1080x1920)', platform: 'instagram_story' })
  await render({ job, width: 1080, height: 1920, label: 'TikTok (1080x1920)', platform: 'tiktok' })
  console.log('')
}
main().catch(e => { console.error(e.message); process.exit(1) })
