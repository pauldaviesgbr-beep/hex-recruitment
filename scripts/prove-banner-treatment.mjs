// WHATEVER SOMEONE UPLOADS HAS TO COME OUT USABLE — SO ASSERT IT ON REAL BYTES.
//
// The decision is a table of four branches. A check that only fed it a nice
// landscape photograph would go green while three of the four were broken, so
// every branch gets a fixture BUILT WITH SHARP, run through the real
// analyseImage → chooseTreatment → renderBanner path the route uses.
//
// THE PAIRS ARE THE POINT. "The output is 1200x825" is true of every branch and
// therefore proves nothing about the branching; what proves it is that a flat
// graphic and a photograph come out of chooseTreatment DIFFERENT, and that the
// rendered bytes differ too. A hard-coded `return 'crop'` would satisfy half of
// these and fail the other half.
//
// No network, no database. Fixtures are synthesised in memory each run — a
// control that lives outside the thing being changed.

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// THE ENTRY LIVES IN THE REPO, NOT IN tmpdir. It imports sharp, and a file in
// the OS temp directory cannot resolve a package from node_modules here — the
// first version failed with ERR_MODULE_NOT_FOUND for exactly that reason.
// scripts/tmp-* is gitignored, and it is removed at the end of the run.
const dir = join(process.cwd(), 'scripts')
mkdirSync(dir, { recursive: true })
const entry = join(dir, 'tmp-prove-banner-run.mts')
const mod = pathToFileURL(join(process.cwd(), 'lib', 'bannerRender.ts')).href

writeFileSync(entry, `
import sharp from 'sharp'
import { analyseImage, chooseTreatment, renderBanner, TARGET_WIDTH, TARGET_HEIGHT }
  from ${JSON.stringify(mod)}

const out: any[] = []
const rec = (name: string, got: any, want: any) =>
  out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })

// ── FIXTURES ────────────────────────────────────────────────────────────────
// A PHOTOGRAPH: random noise has high entropy, which is what separates a real
// scene from flat artwork. Built rather than committed so the control cannot be
// swept away by an operation on the repo — the emoji-detector lesson.
async function photo(w: number, h: number) {
  const px = Buffer.alloc(w * h * 3)
  // Deterministic pseudo-noise: no Math.random, so a failure is reproducible.
  let seed = 12345
  for (let i = 0; i < px.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    px[i] = seed % 256
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer()
}

// A FLAT GRAPHIC on solid white — a wordmark export. Low entropy, opaque.
async function flatGraphic(w: number, h: number) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{
      input: Buffer.from(
        \`<svg width="\${w}" height="\${h}"><rect x="\${w * 0.2}" y="\${h * 0.35}" width="\${w * 0.6}" height="\${h * 0.3}" fill="#5B2D8E"/></svg>\`
      ),
      top: 0, left: 0,
    }])
    .jpeg().toBuffer()
}

// A TRANSPARENT MARK — the Collins King case: a logo with a see-through
// background dropped into the banner box.
async function transparentLogo(w: number, h: number) {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{
      input: Buffer.from(
        \`<svg width="\${w}" height="\${h}"><circle cx="\${w / 2}" cy="\${h / 2}" r="\${Math.min(w, h) * 0.3}" fill="#5B2D8E"/></svg>\`
      ),
      top: 0, left: 0,
    }])
    .png().toBuffer()
}

// ── THE FOUR BRANCHES ───────────────────────────────────────────────────────
const bigPhoto = await photo(1600, 1100)
const facts1 = await analyseImage(bigPhoto)
const t1 = chooseTreatment(facts1)
rec('an ordinary photograph is cropped', [t1.mode, t1.reason], ['crop', 'photograph'])

const logo = await transparentLogo(600, 600)
const facts2 = await analyseImage(logo)
const t2 = chooseTreatment(facts2)
rec('a TRANSPARENT logo is contained on the brand panel',
  [t2.mode, t2.reason, t2.fill], ['contain', 'graphic', 'brand'])

const flat = await flatGraphic(1600, 1100)
const facts3 = await analyseImage(flat)
const t3 = chooseTreatment(facts3)
rec('a FLAT graphic is contained even though it is large and landscape',
  [t3.mode, t3.reason], ['contain', 'graphic'])

const strip = await photo(2400, 500)          // 4.8:1 letterbox
const t4 = chooseTreatment(await analyseImage(strip))
rec('an extreme strip is contained', [t4.mode, t4.reason], ['contain', 'extreme-aspect'])

const tiny = await photo(320, 240)            // under the old 400x300 rejection
const t5 = chooseTreatment(await analyseImage(tiny))
rec('a small photo is CONTAINED, not rejected', [t5.mode, t5.reason], ['contain', 'low-resolution'])

// ── THE DISCRIMINATORS ──────────────────────────────────────────────────────
// Each of these has a different answer before and after. A stubbed
// chooseTreatment cannot satisfy them together.
rec('photograph and flat graphic disagree', t1.mode !== t3.mode, true)
rec('the two contained kinds use different fills', t2.fill !== t4.fill, true)
rec('entropy actually separates them', facts1.entropy > facts3.entropy, true)
rec('transparency is detected on the logo and not the photo',
  [facts2.transparent, facts1.transparent], [true, false])

// ── THE GEOMETRY PROMISE ────────────────────────────────────────────────────
// Whatever the branch, the board gets one shape. This is what keeps fifteen
// agencies from looking like fifteen products.
for (const [name, buf, t] of [
  ['photo', bigPhoto, t1], ['logo', logo, t2], ['flat', flat, t3],
  ['strip', strip, t4], ['tiny', tiny, t5],
] as [string, Buffer, any][]) {
  const rendered = await renderBanner(buf, t, 80)
  const m = await sharp(rendered).metadata()
  rec(\`\${name}: rendered exactly \${TARGET_WIDTH}x\${TARGET_HEIGHT}\`,
    [m.width, m.height], [TARGET_WIDTH, TARGET_HEIGHT])
  rec(\`\${name}: output is webp\`, m.format, 'webp')
}

// A CONTAINED RENDER MUST DIFFER FROM A CROPPED ONE of the same source, or the
// treatment is decorative.
const asCrop = await renderBanner(strip, { mode: 'crop', reason: 'photograph', fill: 'blur' }, 80)
const asContain = await renderBanner(strip, t4, 80)
rec('contain and crop produce different bytes', asCrop.equals(asContain), false)

// AND THE CONTAINED ONE MUST NOT BE EMPTY AROUND THE EDGES — the whole reason
// for the fill. Sample the corner: it must not be flat black/transparent.
const corner = await sharp(asContain).extract({ left: 0, top: 0, width: 40, height: 40 }).stats()
const cornerMean = corner.channels.slice(0, 3).reduce((a: number, c: any) => a + c.mean, 0) / 3
rec('the fill is painted, not left empty', cornerMean > 8, true)

console.log(JSON.stringify(out))
`)

let raw
try {
  raw = execFileSync('npx', ['tsx', entry], {
    encoding: 'utf8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
} catch (e) {
  console.error('prove-banner-treatment: could not run')
  console.error(e.stderr || e.message)
  rmSync(entry, { force: true })
  process.exit(1)
}

// CLEANED UP ON THE WAY OUT, NOT ONLY ON THE WAY DOWN. rmSync sat inside the
// catch alone, so the generated entry file was removed when the run FAILED and
// left behind every time it SUCCEEDED — the inversion of the usual bug, and
// invisible because scripts/tmp-* is gitignored. Its sibling
// prove-logo-treatment already deletes after the try/catch; this now matches.
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
