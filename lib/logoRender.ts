import sharp from 'sharp'

/**
 * TAKE THE BRANDED PART OF WHATEVER THEY UPLOAD AND MAKE IT FIT.
 *
 * Paul's brief, and it is the same one behind lib/bannerRender: "people will
 * always post different size logos and images, but we don't want it to make the
 * platform look bad. We want to almost make their life easy by fixing any poor
 * data uploads."
 *
 * WHAT THE OLD PIPELINE DID, AND WHY IT HURT. Every logo was stored as
 *
 *     resize(200, 200, { fit: 'contain', background: white })
 *
 * — forced square, and any logo that is not square got WHITE PADDING baked into
 * the pixels. That padding is invisible on a white page and obvious the moment
 * the logo is put anywhere else: on the navy card panel a wide wordmark arrives
 * with white strips above and below it and reads as a sticker. It also flattens
 * away any transparency the employer supplied, so a PNG that would have sat on
 * any background became an opaque block.
 *
 * The card then had no way to recover: an opaque rectangle laid on navy shows
 * as a rectangle, and no CSS filter fixes that. Two attempts at fixing it in
 * the browser both failed, one of them visibly on the live board. The problem
 * was never the card.
 *
 * WHAT THIS DOES INSTEAD, in order:
 *
 *   1. TRIM the uniform border, so what is stored is the mark and nothing else.
 *   2. KEY OUT a near-white background, but ONLY when the mark does not depend
 *      on it — see shouldKeyWhite. A logo that is white type on a coloured
 *      block must keep its block or the type disappears.
 *   3. KEEP THE NATURAL ASPECT inside a bounding box, rather than forcing a
 *      square. A wide wordmark stays wide; a round emblem stays round.
 *   4. PNG when there is transparency to preserve, WebP when there is not.
 *
 * The result sits correctly on the white chip, on the navy panel, and on
 * anything else we put behind it later — because it carries only the mark.
 */

/** The longest edge of a stored logo. Enough for a retina chip and the panel. */
export const LOGO_MAX = 400

/** Anything at or above this luminance counts as "white" for the border test. */
const NEAR_WHITE = 244

/** How much of the CORNERS must be near-white before it is treated as a ground. */
const CORNER_WHITE_SHARE = 0.9

export interface LogoFacts {
  width: number
  height: number
  hasAlpha: boolean
  /** True when the source already carries real transparency. */
  transparent: boolean
  /** Share of CORNER pixels that are near-white, 0..1.
   *
   *  CORNERS, NOT THE WHOLE BORDER, and a real logo decided it. Goldenkeys is a
   *  gold circle: once trimmed, its bounding box has white corners but GOLD at
   *  the edge midpoints, so a whole-border test never reached the threshold and
   *  refused to key the very case keying exists for. A filled block — Collins
   *  King's purple, Sauce's black — has coloured corners and is correctly left
   *  alone. The corners answer "is this mark sitting on a page?"; the border
   *  answers "does the mark touch the edge", which is a different question. */
  cornerWhiteShare: number
  /** Mean luminance of the non-border pixels. */
  innerLuminance: number
  /** Share of pixels that are NOT near-white, 0..1 — "is there a mark here?" */
  nonWhiteShare: number
}

/**
 * Look at the edges and the middle. Cheap, and done ONCE per upload rather than
 * per card — which is the difference between this and the client-side canvas
 * sampling that used to guess in the browser and fail silently on a
 * cross-origin read.
 */
export async function analyseLogo(buffer: Buffer): Promise<LogoFacts> {
  const upright = await sharp(buffer).rotate().toBuffer()
  const meta = await sharp(upright).metadata()
  const width = meta.width || 1
  const height = meta.height || 1

  const { data, info } = await sharp(upright)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const w = info.width
  const h = info.height
  const ch = info.channels
  const lum = (i: number) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]

  let cornerCount = 0
  let cornerWhite = 0
  let innerSum = 0
  let innerCount = 0
  let nonWhite = 0
  let total = 0
  const edge = Math.max(1, Math.round(Math.min(w, h) * 0.04))
  const corner = Math.max(2, Math.round(Math.min(w, h) * 0.12))

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch
      const isCorner = (x < corner || x >= w - corner) && (y < corner || y >= h - corner)
      const isEdge = x < edge || y < edge || x >= w - edge || y >= h - edge
      const alpha = ch === 4 ? data[i + 3] : 255
      if (isCorner) {
        cornerCount++
        // A transparent corner counts as "not a white ground" — nothing to key.
        if (alpha > 32 && lum(i) >= NEAR_WHITE) cornerWhite++
      }
      if (isEdge) {
        // kept for reporting only; the decision uses the corners
      } else if (alpha > 32) {
        innerSum += lum(i)
        innerCount++
      }
      // Counted over the WHOLE image, edges included: "is there a mark here at
      // all, distinct from the white?" See shouldKeyWhite for why the mean is
      // not the question.
      if (alpha > 32 && lum(i) < NEAR_WHITE) nonWhite++
      total++
    }
  }

  let transparent = false
  if (meta.hasAlpha) {
    const stats = await sharp(upright).stats()
    transparent = stats.isOpaque === false
  }

  return {
    width,
    height,
    hasAlpha: !!meta.hasAlpha,
    transparent,
    cornerWhiteShare: cornerCount ? cornerWhite / cornerCount : 0,
    innerLuminance: innerCount ? innerSum / innerCount : 255,
    nonWhiteShare: total ? nonWhite / total : 0,
  }
}

/**
 * Should the white ground be removed?
 *
 * PURE, so the judgement can be read as a rule and asserted without an image.
 *
 * YES when the border is overwhelmingly near-white AND there is a mark
 * distinct from that white — a logo sitting on a white page, which is the
 * commonest export there is. Keying it gives a mark that sits on any colour.
 *
 * NO when the source already has transparency (nothing to do), or when the
 * corners are not white — Collins King is white type on a solid purple block,
 * and keying white there would erase the type and leave a hollow shape.
 *
 * IT ASKS "IS THERE A MARK", NOT "IS THE MARK DARK ON AVERAGE", and the
 * difference decided a real case. The first version tested mean inner
 * luminance and refused to key Goldenkeys — thin gold lines on white, where
 * most of the interior legitimately IS the white ground, so the mean sat at
 * 244 and looked like an all-white image. The mark was there; the question was
 * wrong.
 */
export function shouldKeyWhite(facts: LogoFacts): boolean {
  if (facts.transparent) return false
  if (facts.cornerWhiteShare < CORNER_WHITE_SHARE) return false
  // Enough non-white pixels to be a mark rather than a blank or a stray speck.
  return facts.nonWhiteShare >= 0.02
}

export interface LogoResult {
  buffer: Buffer
  contentType: 'image/png' | 'image/webp'
  extension: 'png' | 'webp'
  /** What we did, so it can be reported and learned from. */
  treatment: {
    trimmed: boolean
    keyedWhite: boolean
    keptTransparency: boolean
    width: number
    height: number
  }
}

/**
 * Produce the stored logo: the mark, tight, at its own aspect ratio, with
 * transparency wherever transparency is honest.
 */
export async function renderLogo(buffer: Buffer, _facts: LogoFacts): Promise<LogoResult> {
  const upright = sharp(buffer).rotate()

  // 1. TRIM. Removes a uniform border of any colour, which is what turns a
  //    padded square back into the mark. Wrapped because sharp throws when an
  //    image is entirely one colour and there is nothing left to keep.
  let working: Buffer
  let trimmed = true
  try {
    working = await upright.clone().trim().toBuffer()
  } catch {
    trimmed = false
    working = await upright.clone().toBuffer()
  }

  // ANALYSED AFTER THE TRIM, NOT BEFORE, and this was wrong first time round.
  //
  // Measuring the border of the STORED file measures the white padding the old
  // pipeline baked in — not the mark's own surround, which is the thing the
  // decision is actually about. On the five real logos it read 69–87% white and
  // keyed none of them, including Goldenkeys: a gold circle on white, which is
  // precisely the case keying exists for. Sauce's black bar spans the full
  // width, so its left and right edges are black and dragged the share down
  // below the threshold even though its padding is white.
  //
  // After the trim the border IS the mark's ground, so the question being asked
  // is the question that matters.
  const trimmedFacts = await analyseLogo(working)
  const key = shouldKeyWhite(trimmedFacts)

  if (key) {
    // 2. KEY OUT THE WHITE GROUND, pixel by pixel: near-white becomes
    //    transparent, everything else is kept exactly as it is. Deliberately
    //    NOT a threshold on the whole image — that would posterise the mark.
    const { data, info } = await sharp(working).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true })
    const ch = info.channels
    for (let i = 0; i < data.length; i += ch) {
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      if (l >= NEAR_WHITE) data[i + 3] = 0
    }
    working = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer()
  }

  // 3. FIT INSIDE A BOX, NEVER FORCE A SHAPE. `inside` keeps the aspect ratio,
  //    and withoutEnlargement stops a small logo being blown up into mush.
  const keepAlpha = key || trimmedFacts.transparent
  const resized = sharp(working).resize(LOGO_MAX, LOGO_MAX, {
    fit: 'inside',
    withoutEnlargement: true,
  })

  // 4. PNG only where there is alpha worth keeping. WebP is smaller and is the
  //    right default for an opaque mark.
  const out = keepAlpha
    ? await resized.png({ compressionLevel: 9 }).toBuffer()
    : await resized.webp({ quality: 90 }).toBuffer()

  const meta = await sharp(out).metadata()

  return {
    buffer: out,
    contentType: keepAlpha ? 'image/png' : 'image/webp',
    extension: keepAlpha ? 'png' : 'webp',
    treatment: {
      trimmed,
      keyedWhite: key,
      keptTransparency: keepAlpha,
      width: meta.width || 0,
      height: meta.height || 0,
    },
  }
}

/**
 * SAMPLE THE DOMINANT COLOUR OF A KEYED LOGO — step 2 of the brand-colour rule.
 *
 * IT MUST RUN ON THE KEYED RESULT, NOT THE ORIGINAL, and Goldenkeys is the
 * reason. It is thin gold line art on white, so the dominant colour of the file
 * as uploaded is white — sampling it would produce a near-white panel, which
 * the clamp would then drag to a muddy grey. After the white is keyed out, the
 * only opaque pixels left ARE the mark, and the answer is gold.
 *
 * Fully transparent pixels are skipped for the same reason: they are not the
 * brand, they are the absence of it.
 *
 * The variance figure is what step 3 uses to decide the sample cannot be
 * trusted at all — a rainbow gradient averages to mud, and admitting that is
 * more honest than shipping the mud.
 */
export async function sampleBrandColour(buffer: Buffer): Promise<import('./brandColour').ColourSample | null> {
  const { rgbToOklab } = await import('./brandColour')

  // Small enough to be quick, large enough that a thin line survives.
  const { data, info } = await sharp(buffer)
    .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const ch = info.channels
  let rs = 0, gs = 0, bs = 0, n = 0
  // Circular mean of hue, weighted by chroma. Summing unit vectors is the only
  // honest way to average an angle — a plain mean of hue degrees puts the
  // average of red (5) and red (355) at 180, which is cyan.
  let hx = 0, hy = 0, wsum = 0

  for (let i = 0; i < data.length; i += ch) {
    const a = ch === 4 ? data[i + 3] : 255
    if (a < 200) continue                    // transparent — not the brand
    const r = data[i], g = data[i + 1], b = data[i + 2]
    // Near-white survivors of an unkeyed logo would drag the mean; a logo whose
    // ground was NOT keyed (a filled block) has few of them, so this is safe.
    if (r > 250 && g > 250 && b > 250) continue
    rs += r; gs += g; bs += b; n++
    const { a: oa, bb: ob } = rgbToOklab(r, g, b)
    const chroma = Math.sqrt(oa * oa + ob * ob)
    if (chroma > 1e-6) {
      hx += (oa / chroma) * chroma
      hy += (ob / chroma) * chroma
      wsum += chroma
    }
  }

  if (!n) return null

  // Mean resultant length. 1 = every pixel the same hue, 0 = spread evenly
  // round the wheel. Variance is its complement.
  const R = wsum > 0 ? Math.sqrt(hx * hx + hy * hy) / wsum : 1
  const hueVariance = 1 - Math.max(0, Math.min(1, R))

  return {
    r: Math.round(rs / n),
    g: Math.round(gs / n),
    b: Math.round(bs / n),
    hueVariance,
  }
}
