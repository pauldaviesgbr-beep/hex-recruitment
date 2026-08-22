// BRAND VIDEO: Thrive's own words and mark, over footage.
//
// THIS IS FOR PROMOTING THE PLATFORM, NEVER FOR AN EMPLOYER'S JOB. The
// distinction is the same one that keeps lib/jobArtwork.ts unwired: a candidate
// reads footage on a job advert as evidence of a workplace, so generated video
// of "a kitchen" attached to somebody's vacancy is a claim about their premises
// that nobody filmed. On Thrive's own channel, advertising Thrive, the only
// thing being asserted is ours.
//
// THE TYPE IS COMPOSITED AS A PNG, NOT DRAWN BY FFMPEG. drawtext depends on
// fonts being found on the machine and fails differently on every one; sharp
// renders the overlay once, here, and ffmpeg only has to lay one image over the
// frames. It also means the scrim, the mark and the wrapping all follow the
// same rules as the still cards.
//
// SAFE AREAS ARE REAL AND THEY DIFFER. TikTok puts the caption, the username
// and a column of buttons over the bottom and right of the frame; Instagram
// Reels takes less but still takes some; LinkedIn's square feed takes none. Text
// placed for one is covered on another, so each format gets its own bottom
// margin rather than one guess.
//
//   node scripts/make-social-video.mjs <source.mp4> [--out <dir>]
//
// Writes one file per format. Reads nothing from the database.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'
import ffmpeg from 'ffmpeg-static'

const SRC = process.argv[2]
if (!SRC || !fs.existsSync(SRC)) {
  console.error('usage: node scripts/make-social-video.mjs <source.mp4> [--out <dir>]')
  process.exit(2)
}
const outFlag = process.argv.indexOf('--out')
const OUT_DIR = outFlag > -1 ? process.argv[outFlag + 1] : path.join(os.homedir(), 'Downloads')

// --only <format> exists because the three formats want DIFFERENT SOURCE
// FOOTAGE, not one clip cropped three ways. A 9:16 kitchen crops to a square
// acceptably, but a shot framed FOR the square is better than the middle of a
// tall one -- so LinkedIn is built from its own render.
const onlyFlag = process.argv.indexOf('--only')
const ONLY = onlyFlag > -1 ? process.argv[onlyFlag + 1] : null

const HEADLINE = 'Find your next hospitality role on Thrive'
const URL_LINE = 'thrivecareer.co.uk'

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const wrap = (text, perLine) => {
  const words = text.split(/\s+/)
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
 * bottomSafe is the share of the frame the PLATFORM'S OWN UI covers, measured
 * from the bottom. Text sits above it, never in it.
 */
const FORMATS = [
  { name: 'linkedin', w: 1080, h: 1080, bottomSafe: 0.06, perLine: 20 },
  { name: 'instagram', w: 1080, h: 1920, bottomSafe: 0.20, perLine: 16 },
  { name: 'tiktok', w: 1080, h: 1920, bottomSafe: 0.30, perLine: 16 },
]

async function overlay({ w, h, bottomSafe, perLine }) {
  const pad = Math.round(w * 0.075)
  const headSize = Math.round(w * (perLine > 18 ? 0.070 : 0.082))
  const urlSize = Math.round(w * 0.032)
  const lines = wrap(HEADLINE, perLine)

  let y = h - Math.round(h * bottomSafe)
  const parts = []

  parts.push(`<text x="${pad}" y="${y}" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="${urlSize}" font-weight="600" fill="#FFE500" letter-spacing="1.6">${esc(URL_LINE.toUpperCase())}</text>`)
  y -= Math.round(urlSize * 2.1)

  for (const line of [...lines].reverse()) {
    parts.push(`<text x="${pad}" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-size="${headSize}" font-weight="700" fill="#FFFFFF">${esc(line)}</text>`)
    y -= Math.round(headSize * 1.16)
  }

  // The scrim starts above the tallest line so the type always has ground, and
  // runs to the very bottom so it does not stop mid-frame on a light shot.
  const scrimTop = Math.max(0, y - Math.round(h * 0.10)) / h

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="${scrimTop.toFixed(3)}" stop-color="#0A1628" stop-opacity="0"/>
        <stop offset="${Math.min(1, scrimTop + 0.14).toFixed(3)}" stop-color="#0A1628" stop-opacity="0.84"/>
        <stop offset="1" stop-color="#0A1628" stop-opacity="0.96"/>
      </linearGradient>
      <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0A1628" stop-opacity="0.46"/>
        <stop offset="0.20" stop-color="#0A1628" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#t)"/>
    <rect width="${w}" height="${h}" fill="url(#s)"/>
    ${parts.join('\n    ')}
  </svg>`

  const markSize = Math.round(w * 0.10)
  const mark = await sharp(path.join(process.cwd(), 'public', 'logo', 'thrive-mark-512.png'))
    .resize(markSize, markSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: Buffer.from(svg), top: 0, left: 0 },
      { input: mark, top: pad, left: pad },
    ])
    .png()
    .toBuffer()
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  console.log(`\nsource: ${SRC}`)
  console.log(`headline: "${HEADLINE}"\n`)

  const chosen = ONLY ? FORMATS.filter(x => x.name === ONLY) : FORMATS
  if (!chosen.length) { console.error(`no such format: ${ONLY}`); process.exit(2) }

  for (const f of chosen) {
    const png = await overlay(f)
    const tmp = path.join(os.tmpdir(), `thrive-overlay-${f.name}.png`)
    fs.writeFileSync(tmp, png)

    const out = path.join(OUT_DIR, `thrive-${f.name}.mp4`)
    // scale+crop to the format, then lay the overlay on top. yuv420p because
    // every one of these platforms re-encodes and some reject anything else.
    execFileSync(ffmpeg, [
      '-y', '-i', SRC, '-i', tmp,
      '-filter_complex',
      `[0:v]scale=${f.w}:${f.h}:force_original_aspect_ratio=increase,crop=${f.w}:${f.h}[bg];[bg][1:v]overlay=0:0[v]`,
      '-map', '[v]',
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-crf', '19', '-preset', 'slow', '-movflags', '+faststart',
      '-an', out,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })

    fs.rmSync(tmp, { force: true })
    const kb = (fs.statSync(out).size / 1024).toFixed(0)
    console.log(`  ${f.name.padEnd(10)} ${f.w}x${f.h}  ${kb}kB  text clear of the bottom ${(f.bottomSafe * 100).toFixed(0)}%  ${out}`)
  }
  console.log('')
}
main().catch(e => { console.error(e.message); process.exit(1) })
