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

const JOB_ID = process.argv[2]
if (!JOB_ID) { console.error('usage: node scripts/make-social-card.mjs <job-id> [--out <dir>]'); process.exit(2) }
const outFlag = process.argv.indexOf('--out')
const OUT_DIR = outFlag > -1 ? process.argv[outFlag + 1] : path.join(os.homedir(), 'Downloads')

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

async function render({ job, width, height, label }) {
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
  const pay = money(Number(job.salary_min), Number(job.salary_max), job.salary_type)
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

  // Bottom-up, so a two-line role pushes the block up rather than off the edge.
  let y = height - pad
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

  // The Thrive mark, top-left, small. Thrive's own account, Thrive's own post.
  const markSize = Math.round(width * 0.085)
  const mark = await sharp(path.join(process.cwd(), 'public', 'logo', 'thrive-mark-512.png'))
    .resize(markSize, markSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  // Ground = photograph + scrim, no type. This is what the check reads.
  const ground = await sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png().toBuffer()

  const file = path.join(OUT_DIR, `thrive-${label}-${JOB_ID.slice(0, 8)}.jpg`)
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
  for (let row = top; row < height - Math.round(pad * 0.4); row += 6) {
    for (let col = pad; col < width - pad; col += 12) {
      const i = (row * info.width + col) * info.channels
      const ratio = (1.0 + 0.05) / (lum(data[i], data[i + 1], data[i + 2]) + 0.05)
      if (ratio < worst) worst = ratio
    }
  }

  const stat = fs.statSync(file)
  const verdict = worst >= 4.5 ? 'ok' : 'LOW'
  console.log(`  ${label.padEnd(6)} ${width}x${height}  ${(stat.size / 1024).toFixed(0)}kB  white-on-ground worst ${worst.toFixed(1)}:1 ${verdict}  ${file}`)
  if (worst < 4.5) process.exitCode = 1
  return file
}

async function main() {
  const { data: job, error } = await supa.from('jobs')
    .select('id, title, company, location, area, salary_min, salary_max, salary_type, company_banner_url, is_recruiter_posting, status')
    .eq('id', JOB_ID).single()
  if (error) throw error
  if (!job.company_banner_url) throw new Error('this advert has no photograph — nothing to build from')

  console.log(`\n${job.title}\n${job.company} · ${job.location} · ${job.status}\n`)
  fs.mkdirSync(OUT_DIR, { recursive: true })

  await render({ job, width: 1080, height: 1350, label: 'feed' })
  await render({ job, width: 1080, height: 1920, label: 'story' })
  console.log('')
}
main().catch(e => { console.error(e.message); process.exit(1) })
