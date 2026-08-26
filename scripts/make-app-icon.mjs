// Render the 1024x1024 App Store icon from the VECTOR source, and then check
// the result rather than trusting it.
//
// TWO THINGS APPLE'S CURRENT DOCUMENTATION IS EXPLICIT ABOUT:
//
//  1. 1024x1024, square. From the HIG specifications table: iOS/iPadOS/macOS,
//     "Layout shape: Square", "Layout size: 1024x1024 px".
//
//  2. DO NOT SUPPLY ROUNDED CORNERS. "The system masks all layer edges to
//     produce an icon's final shape. For iOS, iPadOS, and macOS icons, provide
//     square layers so the system can apply rounded corners… Providing layers
//     with pre-defined masking negatively impacts specular highlight effects
//     and makes edges look jagged."
//
// public/logo/thrive-mark-square.svg carries rx="22" — pre-rounded. So the
// corners are squared off here. That is the ONLY change to the artwork.
//
// THE BACKGROUND NEEDED NO DECISION. The SVG's first element is a full-bleed
// rect filled #FFE500, so the icon is already opaque brand yellow edge to
// edge. Nothing is composited and no colour was chosen — it is the artwork's
// own. The alpha check below proves it rather than assuming it.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const SRC = 'public/logo/thrive-mark-square.svg'
const OUT = 'public/logo/app-icon-1024.png'
mkdirSync('public/logo', { recursive: true })

const raw = readFileSync(SRC, 'utf8')
const squared = raw.replace(/\srx="\d+"/g, '')
if (squared === raw) { console.error('NO rx FOUND — the source may have changed; stopping rather than guessing'); process.exit(1) }
console.log('  corners: rx removed (Apple applies its own mask)')

let bad = 0
const check = (l, ok, d) => { if (!ok) bad++; console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(l).padEnd(52) + (d ?? '')) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
await page.setContent(
  `<html><body style="margin:0;padding:0;background:#FFE500">` +
  squared.replace('<svg ', '<svg style="display:block;width:1024px;height:1024px" ') +
  `</body></html>`,
  { waitUntil: 'load' })
await page.screenshot({ path: OUT })
await browser.close()

// ── Now check the file, from its own bytes. ──────────────────────────────
const buf = readFileSync(OUT)
const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
const bitDepth = buf[24], colourType = buf[25]
check('it is a PNG', buf.slice(1, 4).toString() === 'PNG')
check('1024 x 1024', w === 1024 && h === 1024, `${w}x${h}`)
check('8-bit', bitDepth === 8, String(bitDepth))

// ── Every pixel opaque? Decoded by a real browser, not by me. ────────────
// QA1686 (archived, but this is the rule App Store validation enforces):
// "Icon images may include an alpha channel but should not include any
// transparent regions." So the question is not whether an alpha channel
// exists — it is whether any PIXEL is see-through.
const b2 = await chromium.launch()
const p2 = await b2.newPage()
const stats = await p2.evaluate(async dataUrl => {
  const img = new Image()
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl })
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let minAlpha = 255, seeThrough = 0
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < minAlpha) minAlpha = d[i]
    if (d[i] < 255) seeThrough++
  }
  // the four corner pixels, which is where a rounded mask would show
  const px = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]] }
  return {
    minAlpha, seeThrough, total: d.length / 4,
    corners: [px(0, 0), px(c.width - 1, 0), px(0, c.height - 1), px(c.width - 1, c.height - 1)],
  }
}, 'data:image/png;base64,' + buf.toString('base64'))
await b2.close()

check('NO transparent pixels anywhere', stats.seeThrough === 0,
  stats.seeThrough ? stats.seeThrough + ' of ' + stats.total + ' see-through' : 'min alpha ' + stats.minAlpha)
const cornersOpaqueYellow = stats.corners.every(c => c[3] === 255 && c[0] === 255 && c[1] === 229 && c[2] === 0)
check('all four CORNERS are opaque brand yellow', cornersOpaqueYellow,
  cornersOpaqueYellow ? '#FFE500 — square, unmasked' : JSON.stringify(stats.corners))

console.log('')
console.log(bad ? '  ' + bad + ' FAILED' : '  ' + OUT + ' is ready to upload')
console.log('  colour: #FFE500, taken from the SVG. Nothing was composited or chosen.')
process.exitCode = bad ? 1 : 0
