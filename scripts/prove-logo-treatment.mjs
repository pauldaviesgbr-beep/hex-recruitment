// WHEN DOES THE WHITE GROUND COME OFF A LOGO?
//
// That single decision got the answer wrong TWICE on real employer logos before
// it settled, so all four shapes are fixtures here rather than reasoning in a
// comment:
//
//   1. First rule asked whether the mark was DARK ON AVERAGE. Goldenkeys is a
//      thin gold circle on white — most of its interior legitimately IS the
//      white ground, so the mean read 244 and it looked like a blank image. The
//      mark was there; the question was wrong. It now asks whether a mark
//      EXISTS, which is a different question with a different answer.
//   2. Second rule measured the WHOLE BORDER. Once trimmed, a circle's bounding
//      box has white corners and GOLD at the edge midpoints, so the share never
//      reached the threshold. It now measures the CORNERS, which answer "is this
//      sitting on a page?" rather than "does it touch the edge?".
//
// The dangerous direction is a false YES: keying the white out of Collins King,
// which is white type on a solid purple block, would erase the type and leave a
// hollow shape on somebody's live advert. So the block case is asserted as a
// REFUSAL, and paired against the white-ground case so a stubbed rule cannot
// satisfy both.
//
// No network, no database. Fixtures are drawn with sharp each run.

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = join(process.cwd(), 'scripts')
mkdirSync(dir, { recursive: true })
const entry = join(dir, 'tmp-prove-logo-run.mts')
const mod = pathToFileURL(join(process.cwd(), 'lib', 'logoRender.ts')).href
const colourMod = pathToFileURL(join(process.cwd(), 'lib', 'brandColour.ts')).href

writeFileSync(entry, `
import sharp from 'sharp'
import { analyseLogo, renderLogo, shouldKeyWhite, sampleBrandColour } from ${JSON.stringify(mod)}
import { brandColourFrom, clampToBrandBand, rgbToOklab, BRAND_FALLBACK, L_MIN, L_MAX, C_MAX } from ${JSON.stringify(colourMod)}

const out: any[] = []
const rec = async (name: string, get: () => any, want: any) => {
  let got: any
  try { got = await get() } catch (e: any) { got = 'threw: ' + e.message }
  out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })
}

const solid = (w: number, h: number, colour: any) =>
  sharp({ create: { width: w, height: h, channels: 4, background: colour } })
const svg = (s: string) => Buffer.from(s)

// A dark mark on a white page — the commonest export there is.
const darkOnWhite = await solid(300, 300, { r: 255, g: 255, b: 255, alpha: 1 })
  .composite([{ input: svg('<svg width="300" height="300"><rect x="80" y="120" width="140" height="60" fill="#222"/></svg>'), top: 0, left: 0 }])
  .png().toBuffer()

// White type on a solid coloured block — Collins King. Keying erases the type.
const lightOnBlock = await solid(300, 300, { r: 91, g: 45, b: 142, alpha: 1 })
  .composite([{ input: svg('<svg width="300" height="300"><rect x="60" y="130" width="180" height="40" fill="#fff"/></svg>'), top: 0, left: 0 }])
  .png().toBuffer()

// Thin lines on white — Goldenkeys, and the case that broke rule 1.
const thinOnWhite = await solid(300, 300, { r: 255, g: 255, b: 255, alpha: 1 })
  .composite([{ input: svg('<svg width="300" height="300"><circle cx="150" cy="150" r="110" fill="none" stroke="#c8a24a" stroke-width="8"/></svg>'), top: 0, left: 0 }])
  .png().toBuffer()

// Already transparent — nothing to do.
const alreadyClear = await solid(300, 300, { r: 0, g: 0, b: 0, alpha: 0 })
  .composite([{ input: svg('<svg width="300" height="300"><circle cx="150" cy="150" r="90" fill="#c8a24a"/></svg>'), top: 0, left: 0 }])
  .png().toBuffer()

await rec('a dark mark on white is keyed', async () => shouldKeyWhite(await analyseLogo(darkOnWhite)), true)
await rec('white type on a coloured block is NOT keyed', async () => shouldKeyWhite(await analyseLogo(lightOnBlock)), false)
await rec('thin lines on white ARE keyed (the mean-luminance trap)', async () => shouldKeyWhite(await analyseLogo(thinOnWhite)), true)
await rec('an already-transparent logo is left alone', async () => shouldKeyWhite(await analyseLogo(alreadyClear)), false)

// THE PAIR. A stub returning a constant satisfies at most one of these.
await rec('white ground and coloured block disagree', async () =>
  (shouldKeyWhite(await analyseLogo(darkOnWhite))) !== (shouldKeyWhite(await analyseLogo(lightOnBlock))), true)

// PADDING COMES OFF — the other half of the job, and the half that produced
// white strips above and below every wide wordmark on the navy panel.
const padded = await solid(400, 400, { r: 255, g: 255, b: 255, alpha: 1 })
  .composite([{ input: svg('<svg width="400" height="400"><rect x="40" y="180" width="320" height="40" fill="#222"/></svg>'), top: 0, left: 0 }])
  .png().toBuffer()
await rec('a wide mark stops being square', async () => {
  const o = await renderLogo(padded, await analyseLogo(padded))
  return o.treatment.width > o.treatment.height * 2
}, true)

// AND THE OUTPUT FORMAT FOLLOWS THE TREATMENT, or a keyed logo is stored as an
// opaque WebP and the transparency is thrown away at the last step.
// THE CIRCLE, NOT THE RECTANGLE. Trimming a solid rect removes every white
// pixel, so there is nothing left to key and WebP is the right answer -- this
// assertion originally used darkOnWhite and failed for that reason, which was
// the test being wrong rather than the code. A circle leaves white INSIDE its
// bounding box, which is exactly when keying earns its place.
await rec('a keyed logo is stored as PNG', async () =>
  (await renderLogo(thinOnWhite, await analyseLogo(thinOnWhite))).extension, 'png')
await rec('an opaque block stays WebP', async () =>
  (await renderLogo(lightOnBlock, await analyseLogo(lightOnBlock))).extension, 'webp')


// -- THE BRAND COLOUR CLAMP -----------------------------------------------
// This is the guarantee the whole card direction rests on: NO CARD CAN COME
// OUT ILLEGIBLE AND NONE CAN COME OUT GARISH, whatever anyone uploads. So it
// is asserted as a PROPERTY over the whole colour wheel, not spot-checked.

const inBand = (hexStr: string) => {
  const n = parseInt(hexStr.slice(1), 16)
  const { L, a, bb } = rgbToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255)
  const C = Math.sqrt(a * a + bb * bb)
  return L >= L_MIN - 0.02 && L <= L_MAX + 0.02 && C <= C_MAX + 0.01
}

await rec('every colour in the wheel lands inside the band', async () => {
  const bad: string[] = []
  for (let r = 0; r <= 255; r += 51)
    for (let g = 0; g <= 255; g += 51)
      for (let b = 0; b <= 255; b += 51) {
        const o = clampToBrandBand(r, g, b)
        if (!inBand(o)) bad.push(r + ',' + g + ',' + b + ' -> ' + o)
      }
  return bad.slice(0, 3)
}, [])

// The extremes are what the band exists for: a white slab and a void.
await rec('white is dragged down into the band', async () => inBand(clampToBrandBand(255, 255, 255)), true)
await rec('black is lifted up into the band', async () => inBand(clampToBrandBand(0, 0, 0)), true)

// HUE IS NEVER TOUCHED -- it is the part that reads as their brand.
await rec('hue survives the clamp', async () => {
  const before = rgbToOklab(120, 40, 200)
  const n = parseInt(clampToBrandBand(120, 40, 200).slice(1), 16)
  const after = rgbToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255)
  return Math.abs(Math.atan2(before.bb, before.a) - Math.atan2(after.bb, after.a)) < 0.08
}, true)

// A grey logo must stay grey. atan2(0,0) is 0, which is RED, so without the
// guard a black wordmark comes back tinted.
await rec('grey stays grey', async () => {
  const n = parseInt(clampToBrandBand(31, 31, 31).slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return Math.max(r, g, b) - Math.min(r, g, b) < 6
}, true)

// STEP 3: hues all round the wheel are REFUSED, not averaged into mud.
await rec('a high hue-variance sample falls back to navy', async () =>
  brandColourFrom({ r: 132, g: 168, b: 176, hueVariance: 0.54 }), BRAND_FALLBACK)
await rec('a low hue-variance sample is clamped, not refused', async () =>
  brandColourFrom({ r: 67, g: 52, b: 104, hueVariance: 0.07 }) !== BRAND_FALLBACK, true)
await rec('no sample at all falls back to navy', async () => brandColourFrom(null), BRAND_FALLBACK)

// THE PAIR a stub cannot satisfy: same colour, different variance, different answer.
await rec('refused and clamped disagree on the same rgb', async () =>
  brandColourFrom({ r: 67, g: 52, b: 104, hueVariance: 0.54 }) !==
  brandColourFrom({ r: 67, g: 52, b: 104, hueVariance: 0.07 }), true)

// STEP 2: sampled from the KEYED image. Gold line art on white must report
// GOLD, not white -- the Goldenkeys case, and the only reason it gets a colour.
const goldOnWhite = await solid(300, 300, { r: 255, g: 255, b: 255, alpha: 1 })
  .composite([{ input: svg('<svg width="300" height="300"><circle cx="150" cy="150" r="110" fill="none" stroke="#c8a24a" stroke-width="10"/></svg>'), top: 0, left: 0 }])
  .png().toBuffer()
await rec('a keyed line-art logo samples its ink, not its page', async () => {
  const keyed = await renderLogo(goldOnWhite, await analyseLogo(goldOnWhite))
  const smp = await sampleBrandColour(keyed.buffer)
  return !!smp && smp.r > smp.b + 30
}, true)

console.log(JSON.stringify(out))
`)

let raw
try {
  raw = execFileSync('npx', ['tsx', entry], {
    encoding: 'utf8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
} catch (e) {
  console.error('prove-logo-treatment: could not run')
  console.error(e.stderr || e.message)
  rmSync(entry, { force: true })
  process.exit(1)
}
rmSync(entry, { force: true })

const results = JSON.parse(raw.trim().split('\n').filter(Boolean).pop())
let failed = 0
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}`)
  else {
    failed++
    console.log(`  FAIL  ${r.name}\n          got:  ${JSON.stringify(r.got)}\n          want: ${JSON.stringify(r.want)}`)
  }
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
