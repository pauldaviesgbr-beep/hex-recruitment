/**
 * THE EMPLOYER'S COLOUR, CLAMPED SO IT CANNOT BREAK THE CARD.
 *
 * From the design handoff for the no-photo job card. The panel becomes the
 * employer's own colour rather than Thrive navy, which is what makes it one
 * visual system per card instead of two.
 *
 * THE RULE, and every step exists because of a specific real logo:
 *
 *   1  trim, then key the background            (lib/logoRender, already built)
 *   2  sample the dominant colour FROM THE KEYED RESULT, not the original
 *   3  if chroma variance across the sample is high  →  navy #0F172A
 *   4  else convert to OKLCH and clamp:
 *          lightness  0.30 – 0.42
 *          chroma     max 0.12
 *          hue        UNTOUCHED
 *   5  store the hex
 *
 * STEP 2 IS WHAT SAVES GOLDENKEYS. It is thin gold line art on white, so the
 * dominant colour of the ORIGINAL is white. Sampling after the key finds the
 * gold — which is the only reason that employer gets a colour at all.
 *
 * STEP 3 IS WHAT SAVES NEWAY. A rainbow gradient has no dominant colour worth
 * trusting; averaging it returns mud. Falling back to navy is the one case
 * where our colour is honest, because we did not guess.
 *
 * STEP 4 IS WHAT MAKES THIS SAFE TO SHIP UNSEEN, and it is the difference
 * between this and the four attempts before it. Hue is the part that reads as
 * their brand; lightness and chroma are the parts that break things. White at
 * 100% over L <= 0.42 clears 7:1, so the 16%-white pills and the scrim are
 * guaranteed too. No card can come out illegible and none can come out garish
 * — so no per-logo judgement is required, which is precisely what kept going
 * wrong when taste was the instrument.
 *
 * The hue is deliberately never touched. Clamping it would be us choosing their
 * brand colour for them, which is the thing this exists to stop doing.
 */

/** High-variance logos get this. Not a guess — an admission we could not tell. */
export const BRAND_FALLBACK = '#0F172A'

export const L_MIN = 0.30
export const L_MAX = 0.42
export const C_MAX = 0.12

/**
 * Above this, the sample has no dominant colour worth trusting.
 *
 * IT MEASURES HUE SPREAD, NOT CHROMA SPREAD, and the first version got that
 * wrong in a way no threshold could rescue. Measured on the five real logos,
 * chroma variance put Neway (a rainbow gradient, which SHOULD trip) at 0.0292
 * and Collins King (a purple block, which must NOT) at 0.0304 — the case we
 * need to catch scored LOWER than the case we must not. Chroma variance is the
 * spread of saturation; what makes a rainbow untrustworthy is that its HUE goes
 * everywhere.
 *
 * This is circular variance of hue, chroma-weighted: 0 is one colour, 1 is
 * hues spread evenly round the wheel. Near-grey pixels carry almost no weight,
 * because their hue is meaningless.
 */
export const HUE_VARIANCE_MAX = 0.30

// ── sRGB <-> OKLab ─────────────────────────────────────────────────────────
// Björn Ottosson's OKLab. Used rather than HSL because HSL's "lightness" is
// not perceptual: clamping it leaves some hues visibly brighter than others,
// which is exactly the "one card shouts" failure the clamp exists to prevent.

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

export function rgbToOklab(r: number, g: number, b: number): { L: number; a: number; bb: number } {
  const lr = srgbToLinear(r / 255)
  const lg = srgbToLinear(g / 255)
  const lb = srgbToLinear(b / 255)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    bb: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  }
}

export function oklabToRgb(L: number, a: number, bb: number): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb
  const s_ = L - 0.0894841775 * a - 1.2914855480 * bb

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

  const to8 = (v: number) => Math.max(0, Math.min(255, Math.round(linearToSrgb(v) * 255)))
  return { r: to8(lr), g: to8(lg), b: to8(lb) }
}

/**
 * Is this OKLab colour reachable in sRGB at all?
 *
 * NOT every (L, C, hue) is. OKLab describes more colours than a monitor can
 * show, and oklabToRgb clips each channel independently when asked for one it
 * cannot make — which silently changes the lightness and chroma that were just
 * clamped. That is not a rounding error: saturated cyan asked for L 0.42 came
 * back as #005F61, comfortably outside the band the clamp exists to guarantee.
 */
function inSrgbGamut(L: number, a: number, bb: number): boolean {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb
  const s_ = L - 0.0894841775 * a - 1.2914855480 * bb
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  const eps = 1e-4
  return lr >= -eps && lr <= 1 + eps && lg >= -eps && lg <= 1 + eps && lb >= -eps && lb <= 1 + eps
}

export const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()

/**
 * Clamp one colour into the band. PURE, so the rule can be asserted without an
 * image — which matters, because this is the guarantee the whole direction
 * rests on.
 */
export function clampToBrandBand(r: number, g: number, b: number): string {
  const { L, a, bb } = rgbToOklab(r, g, b)

  // Chroma and hue in polar form. Hue is carried through untouched.
  const chroma = Math.sqrt(a * a + bb * bb)
  const hue = Math.atan2(bb, a)

  let cl = Math.min(chroma, C_MAX)
  const ll = Math.max(L_MIN, Math.min(L_MAX, L))

  // A greyscale input has no meaningful hue; atan2(0,0) is 0, which would tint
  // it red on the way back. Keep it grey.
  if (chroma < 1e-6) {
    const { r: gr, g: gg0, b: gb } = oklabToRgb(ll, 0, 0)
    return hex(gr, gg0, gb)
  }

  // GAMUT-MAP BY REDUCING CHROMA, NEVER BY CLIPPING CHANNELS.
  //
  // Some (lightness, chroma, hue) triples do not exist in sRGB — saturated
  // cyan at L 0.42 is one — and oklabToRgb answers those by clipping each
  // channel independently, which quietly moves the result OUT of the band the
  // clamp just guaranteed. Found by asserting the band over the whole colour
  // wheel rather than on a handful of samples: rgb(0,204,204) came back as
  // #005F61.
  //
  // Chroma is the right thing to give up. Lightness is what protects the white
  // type, and hue is what reads as their brand — so the only safe axis is
  // saturation, and a binary search finds the most colourful version that
  // genuinely exists.
  if (!inSrgbGamut(ll, Math.cos(hue) * cl, Math.sin(hue) * cl)) {
    let lo = 0, hi = cl
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inSrgbGamut(ll, Math.cos(hue) * mid, Math.sin(hue) * mid)) lo = mid
      else hi = mid
    }
    cl = lo
  }

  const { r: rr, g: gg, b: bbb } = oklabToRgb(ll, Math.cos(hue) * cl, Math.sin(hue) * cl)
  return hex(rr, gg, bbb)
}

export interface ColourSample {
  /** Dominant colour of the keyed image. */
  r: number
  g: number
  b: number
  /** Circular variance of hue, chroma-weighted, 0..1 — step 3's input. */
  hueVariance: number
}

/**
 * Decide the stored colour from a sample. PURE.
 *
 * Separated from the pixel work so the two judgements — "is this too varied to
 * trust" and "where does it land in the band" — can both be asserted directly.
 */
export function brandColourFrom(sample: ColourSample | null): string {
  if (!sample) return BRAND_FALLBACK
  if (sample.hueVariance > HUE_VARIANCE_MAX) return BRAND_FALLBACK
  return clampToBrandBand(sample.r, sample.g, sample.b)
}
