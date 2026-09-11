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
//   node scripts/make-social-card.mjs <job-id> [--out <dir>]
//
// Writes 1080x1350 (feed) and 1080x1920 (story). Reads the database; writes
// only image files to disk.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { bottomSafePx } from './lib/social-formats.mjs'

const JOB_ID = process.argv[2]
if (!JOB_ID) { console.error('usage: node scripts/make-social-card.mjs <job-id> [--out <dir>] [--salary "<text>"]'); process.exit(2) }
const outFlag = process.argv.indexOf('--out')
const OUT_DIR = outFlag > -1 ? process.argv[outFlag + 1] : path.join(os.homedir(), 'Downloads')

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

/**
 * THE BRAND FOOTER: a solid yellow band carrying the lockup and the address.
 *
 * WHY A BAND RATHER THAN A BIGGER MARK. On Instagram the card IS the post — it
 * is screenshotted and reshared with no caption attached, so it has to say
 * where the job came from on its own. At thumbnail size a logo is a smudge and
 * a solid colour is a shape: a yellow stripe along the bottom is legible at
 * 100px, which is how these are first seen.
 *
 * IT SITS BELOW EVERYTHING ABOUT THE JOB. Brand second, job first — the eye
 * lands on the photograph, then the role, then the pay, and meets the band
 * last. Nothing about Thrive sits above anything about the vacancy.
 *
 * THE LOCKUP IS THE REPO'S OWN FILE WITH THE TILE TAKEN OUT. Both lockups carry
 * a #FFE500 rounded square behind the T, which would vanish on a #FFE500 band.
 * Dropping the container and its shadow plane leaves the navy T and the navy
 * wordmark — the existing asset, no new artwork and no new colour.
 */
async function brandFooter(width, barH) {
  const src = fs.readFileSync(path.join(process.cwd(), 'public', 'logo', 'thrive-lockup.svg'), 'utf8')
  const stripped = src
    .replace(/<rect id="container"[^>]*><\/rect>/, '')
    .replace(/<path id="t-shadow-plane"[^>]*><\/path>/, '')
  // ASSERT THE REMOVAL rather than announce it: a replace whose anchor missed
  // returns the string unchanged and would silently ship a yellow-on-yellow tile.
  if (stripped.includes('id="container"') || stripped.includes('id="t-shadow-plane"')) {
    throw new Error('the lockup tile was not removed — the asset shape has changed, check public/logo/thrive-lockup.svg')
  }
  if (!stripped.includes('id="wordmark"') || !stripped.includes('id="t-face"')) {
    throw new Error('the lockup lost its wordmark or its T — refusing to composite a partial mark')
  }
  // TRIM BEFORE SIZING. The lockup's viewBox was drawn around the tile, so
  // removing it leaves that space behind as transparent padding — the lockup
  // would sit smaller in the band than the band allows, for no reason. Render
  // large, trim to the ink, then size.
  const wide = await sharp(Buffer.from(stripped)).resize({ height: barH * 4 }).png().toBuffer()
  const trimmed = await sharp(wide).trim().png().toBuffer()
  const [a, b] = await Promise.all([sharp(wide).metadata(), sharp(trimmed).metadata()])
  if (b.height >= a.height) {
    throw new Error(`the lockup trim did nothing (${a.width}x${a.height} -> ${b.width}x${b.height}) — check the asset`)
  }
  const lockH = Math.round(barH * 0.42)
  return sharp(trimmed).resize({ height: lockH }).png().toBuffer()
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

  // THE FLOOR THE TYPE STANDS ON, and it is no longer the bottom of the image.
  //
  // Two things sit below it now: the platform's own UI, and the brand footer.
  // The type is lifted above BOTH. Before this, the card laid its type up from
  // a 4% pad off the bottom edge — which on the 9:16 output put every word of
  // it (78–96% of the frame) underneath a UI that starts at 70%.
  const barH = Math.round(width * 0.09)
  const safePx = bottomSafePx(platform, height)
  const footerBottom = height - safePx
  const footerTop = footerBottom - barH
  let y = footerTop - Math.round(pad * 0.55)
  const chips = []
  if (pay || where) {
    chips.push(`<text x="${pad}" y="${y}" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="${metaSize}" font-weight="600" fill="#FFFFFF">${esc([where, pay].filter(Boolean).join('   ·   '))}</text>`)
    y -= Math.round(metaSize * 1.9)
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

  // The band and the address. The lockup is composited separately as a PNG,
  // because an <image> inside an SVG string would need the file inlined.
  const urlSize = Math.round(width * 0.030)
  const footerSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${footerTop}" width="${width}" height="${barH}" fill="#FFE500"/>
    <text x="${width - pad}" y="${footerTop + Math.round(barH * 0.5) + Math.round(urlSize * 0.36)}"
          text-anchor="end" font-family="Archivo, Helvetica, Arial, sans-serif"
          font-size="${urlSize}" font-weight="600" fill="#0F172A">thrivecareer.co.uk</text>
  </svg>`
  const lockup = await brandFooter(width, barH)
  const lockMeta = await sharp(lockup).metadata()

  // THE FLOATING TILE IS GONE FROM THE PHOTOGRAPH. It used to sit top-left, on
  // the employer's image, as the only branding on the card. The footer carries
  // identity properly now, and two weak brand cues are worse than one strong
  // one — so the top of the picture goes back to the employer.

  // Ground = photograph + scrim, no type. This is what the check reads.
  const ground = await sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png().toBuffer()

  const file = path.join(OUT_DIR, `thrive-${label}-${JOB_ID.slice(0, 8)}.jpg`)
  await sharp(ground)
    .composite([
      { input: Buffer.from(typeSvg), top: 0, left: 0 },
      { input: Buffer.from(footerSvg), top: 0, left: 0 },
      { input: lockup, top: footerTop + Math.round((barH - lockMeta.height) / 2), left: pad },
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
  // Scan only where the TYPE is. It used to run to the bottom edge; the band is
  // opaque yellow and the strip below it on a story carries nothing, so
  // including either would measure ground no white glyph ever sits on.
  for (let row = top; row < footerTop; row += 6) {
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
  console.log(`         type ${(100 * top / height).toFixed(1)}%–${(100 * footerTop / height).toFixed(1)}%   band ${(100 * footerTop / height).toFixed(1)}%–${(100 * footerBottom / height).toFixed(1)}%   ${platform} UI from ${(100 * (height - safePx) / height).toFixed(1)}%`)
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

  fs.mkdirSync(OUT_DIR, { recursive: true })

  // Instagram only. TikTok is deliberately absent: a still card does not travel
  // there, and the one tool that makes video is barred from employer adverts
  // because footage nobody filmed is a claim about somebody's premises.
  await render({ job, width: 1080, height: 1350, label: 'feed', platform: 'instagram_feed' })
  await render({ job, width: 1080, height: 1920, label: 'story', platform: 'instagram_story' })
  console.log('')
}
main().catch(e => { console.error(e.message); process.exit(1) })
