import sharp from 'sharp'

/**
 * MAKE WHATEVER SOMEONE UPLOADS WORK, RATHER THAN ASKING THEM TO TRY AGAIN.
 *
 * The goal, in Paul's words: "a product that anyone can post a job with any kind
 * of image and it renders to fit the area and look as good as possible… without
 * having to go back and forth." A chef or a venue manager should not have to
 * know what 1200x825 means.
 *
 * WHAT WAS ALREADY RIGHT, and is kept: every banner is normalised ONCE, at
 * upload, to a fixed 16:11 frame, with EXIF rotation honoured and an
 * attention-based smart crop rather than a dumb centre crop. A photograph of a
 * kitchen already came out well. Nothing here changes that path.
 *
 * WHAT THIS ADDS — the three cases where cropping was the wrong answer:
 *
 *   1. A GRAPHIC, NOT A PHOTOGRAPH. The route used to decide by which FORM
 *      FIELD the file arrived in: `isLogo` meant "came from the logo box", not
 *      "is a logo". So a company logo dropped into the banner box — which is
 *      exactly what a business does with an empty image box — was cover-cropped
 *      to 16:11 and enlarged, slicing the top and bottom off the mark. The file
 *      is now inspected instead of trusted.
 *
 *   2. AN EXTREME SHAPE. A letterbox strip or a tall portrait crop-fills to a
 *      sliver of the original. Better to show all of it.
 *
 *   3. TOO SMALL TO FILL THE FRAME. This used to be a hard 400x300 REJECTION
 *      with an error message, which is the back-and-forth we are trying to
 *      delete — and it is the moment someone on a phone gives up. Temp posts
 *      were already exempt, with the reason written down in the route: "the
 *      person posting a Saturday shift is on a phone and should not meet a
 *      dimensions error." That reasoning was always true of a job as well.
 *
 * In all three the image is CONTAINED rather than cropped, and the space around
 * it is filled so the frame is never empty — a blurred, darkened copy of the
 * image itself for photographs, and the brand navy for graphics with
 * transparency. Every stored banner is still exactly 16:11, so the board stays
 * uniform however varied the inputs are.
 *
 * WHY AT UPLOAD AND NOT AT RENDER. components/BrandedLogoFallback does the
 * client-side version of this judgement — it samples logo pixels on a canvas and
 * picks a treatment. It is good thinking and it is the fragile half: it runs per
 * card, and when a cross-origin read is blocked it silently guesses. Deciding
 * once, server-side, where sharp already is, is cheaper and deterministic — and
 * the answer is then the same in the card, the preview, the modal and the
 * shared-link image, because there is only one artefact.
 *
 * WHAT THIS HONESTLY CANNOT DO: make a dark, blurry, badly-lit photo good. It
 * makes it CONSISTENT — deliberate rather than broken. Worth being clear about
 * so nobody expects the pipeline to be a photographer.
 */

/** The job-card slot. Every banner ends up exactly this, whatever came in. */
export const TARGET_WIDTH = 1200
export const TARGET_HEIGHT = 825

/**
 * Below this, cropping to fill the frame means enlarging past the point where
 * it stays crisp — so we contain instead. NOT a rejection any more.
 */
export const CRISP_MIN_WIDTH = 400
export const CRISP_MIN_HEIGHT = 300

/**
 * Shannon entropy below which an image reads as flat artwork rather than a
 * photograph. Photographs of real rooms sit well above this; logos, wordmarks
 * and flat illustrations sit well below. Chosen with headroom on both sides
 * rather than tuned to a single sample — the proof script asserts a real
 * photograph and a real flat graphic land on opposite sides of it.
 */
export const GRAPHIC_ENTROPY_MAX = 4.2

/** Wider or taller than these and a fill-crop keeps only a sliver. */
export const MAX_CROPPABLE_ASPECT = 3.0
export const MIN_CROPPABLE_ASPECT = 0.5

/** How much of the frame a contained image is allowed to occupy. */
const CONTAIN_W = 0.78
const CONTAIN_H = 0.72

/** Brand navy — the same base BrandedJobFallback paints, so a contained
 *  graphic here and a fallback panel there read as one family. */
const BRAND_NAVY = { r: 10, g: 22, b: 40, alpha: 1 }

export interface ImageFacts {
  width: number
  height: number
  /** width / height, AFTER EXIF rotation has been accounted for. */
  aspect: number
  /** True when the image carries real transparency (not merely an alpha channel). */
  transparent: boolean
  /** Shannon entropy from sharp's stats(). */
  entropy: number
}

export type TreatmentMode = 'crop' | 'contain'

export interface Treatment {
  mode: TreatmentMode
  /** Why, in a word — stored alongside the upload so we can learn from it. */
  reason: 'photograph' | 'graphic' | 'extreme-aspect' | 'low-resolution'
  /** Graphics sit on the brand panel; photographs on a blur of themselves. */
  fill: 'blur' | 'brand'
}

/**
 * THE DECISION, AS A PURE FUNCTION.
 *
 * Separate from the measuring and the rendering on purpose: it is the part with
 * judgement in it, so it is the part that has to be readable as a table and
 * assertable without sharp, a file, or a network.
 */
export function chooseTreatment(facts: ImageFacts): Treatment {
  // Transparency is the strongest single signal of a logo or a mark. Nothing
  // photographic arrives with a see-through background.
  if (facts.transparent) return { mode: 'contain', reason: 'graphic', fill: 'brand' }

  // Flat artwork: a wordmark on solid white, an exported crest, a screenshot of
  // a menu. Cropping these cuts them in half.
  if (facts.entropy < GRAPHIC_ENTROPY_MAX) return { mode: 'contain', reason: 'graphic', fill: 'brand' }

  // A strip or a tower. Filling a 16:11 frame from these keeps a sliver.
  if (facts.aspect > MAX_CROPPABLE_ASPECT || facts.aspect < MIN_CROPPABLE_ASPECT) {
    return { mode: 'contain', reason: 'extreme-aspect', fill: 'blur' }
  }

  // Small. Previously a 400x300 hard error; now it is simply a different
  // treatment, and the employer never learns there was a threshold.
  if (facts.width < CRISP_MIN_WIDTH || facts.height < CRISP_MIN_HEIGHT) {
    return { mode: 'contain', reason: 'low-resolution', fill: 'blur' }
  }

  // An ordinary photograph of an ordinary room. The path that already worked.
  return { mode: 'crop', reason: 'photograph', fill: 'blur' }
}

/**
 * Measure an image. Kept beside the decision so the two cannot drift, but split
 * out because this half needs sharp and the decision half does not.
 *
 * SERVER ONLY — it imports sharp. Nothing in a client component may import
 * this module; the decision half above is pure and could move if that were
 * ever needed.
 */
export async function analyseImage(buffer: Buffer): Promise<ImageFacts> {
  // .rotate() FIRST. EXIF orientation is why a portrait phone photo reports as
  // landscape, and every size decision after this point must use the dimensions
  // the image will actually have — the route already learned this once.
  const rotated = await sharp(buffer).rotate().toBuffer()
  const meta = await sharp(rotated).metadata()
  const stats = await sharp(rotated).stats()

  const width = meta.width || 1
  const height = meta.height || 1

  return {
    width,
    height,
    aspect: width / height,
    // hasAlpha alone is not transparency: a PNG can carry a fully opaque alpha
    // channel. isOpaque is the question actually being asked.
    transparent: !!meta.hasAlpha && stats.isOpaque === false,
    entropy: typeof stats.entropy === 'number' ? stats.entropy : 8,
  }
}

/**
 * Produce the stored banner: always exactly TARGET_WIDTH x TARGET_HEIGHT.
 *
 * ONE PATH FOR BOTH MODES, so the card can rely on the geometry no matter which
 * branch ran. That uniformity is the whole point — a board of adverts from
 * fifteen different agencies should not look like fifteen different products.
 */
export async function renderBanner(
  buffer: Buffer,
  treatment: Treatment,
  quality: number,
): Promise<Buffer> {
  const upright = await sharp(buffer).rotate().toBuffer()

  if (treatment.mode === 'crop') {
    return sharp(upright)
      .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', position: 'attention' })
      .webp({ quality })
      .toBuffer()
  }

  // ── contain ──────────────────────────────────────────────────────────────
  // The image whole, centred, with the rest of the frame filled so there is
  // never a bare band. Dead space is what makes a card look unfinished; a
  // filled frame looks chosen.
  const inner = await sharp(upright)
    .resize(Math.round(TARGET_WIDTH * CONTAIN_W), Math.round(TARGET_HEIGHT * CONTAIN_H), {
      fit: 'inside',
      // Enlargement IS allowed here: a small image shown at its native size in
      // a 1200px frame is a stamp in the middle of nothing. Slightly soft and
      // clearly intentional beats sharp and obviously broken.
      withoutEnlargement: false,
    })
    .toBuffer()

  const background = treatment.fill === 'brand'
    // A transparent mark on the brand navy — the same ground
    // BrandedJobFallback paints, so the two treatments are one family.
    ? sharp({
        create: {
          width: TARGET_WIDTH, height: TARGET_HEIGHT, channels: 4, background: BRAND_NAVY,
        },
      })
    // A blurred, darkened copy of the image itself. Fills the frame with
    // something that belongs to the picture rather than a flat colour, and the
    // darkening keeps the overlaid card text readable.
    : sharp(
        await sharp(upright)
          .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', position: 'attention' })
          .blur(38)
          .modulate({ brightness: 0.62 })
          .toBuffer(),
      )

  return background
    .composite([{ input: inner, gravity: 'centre' }])
    .webp({ quality })
    .toBuffer()
}
