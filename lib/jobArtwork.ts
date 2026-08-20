/**
 * HOUSE-STYLE ARTWORK FOR AN ADVERT THAT HAS NO PHOTOGRAPH.
 *
 * The problem it solves: most employers will not upload a photo. Ricci did not,
 * and the guidance asking him to is good, sits beside a live preview, and was
 * still skipped — because by the time it appears the advert is already live.
 * Rather than argue with that flow, this gives the no-photo case something that
 * looks deliberate.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE RULE THAT SHAPES ALL OF THIS: THE ARTWORK MAY NOT MAKE A CLAIM.
 *
 * An image on a job advert is not read as decoration, it is read as EVIDENCE —
 * a candidate reasonably takes the picture to be the place they would work. A
 * photoreal kitchen we invented is therefore a statement about the venue that
 * the employer never made, and someone travels to an interview on the strength
 * of it. That is the same family as the employment-type defaults that had an
 * advert asserting a permanent full-time job nobody had chosen, except an image
 * is far more persuasive than a word.
 *
 * Two things keep it honest, and neither is a matter of prompt wording:
 *
 *   1. VECTOR OUTPUT. Recraft returns SVG, which is rasterised here. Flat
 *      geometric artwork CANNOT be mistaken for a photograph — the honesty is a
 *      property of the format rather than something we hope the prompt holds.
 *
 *   2. THE PROMPT DESCRIBES THE CRAFT, NEVER THE VENUE. It is built from the
 *      ROLE only: a chef's advert gets a kitchen, a bar manager's gets a bar.
 *      Nothing about scale, luxury, star rating or setting is passed through,
 *      even when the description is full of it — "Michelin", "5 star" and
 *      "luxury boutique" are exactly the claims we must not illustrate.
 *
 * It never overrides an uploaded photograph. The order is: the employer's own
 * image, then this, then the branded panel.
 *
 * AND IT IS THE EMPLOYER'S CHOICE, NOT A DEFAULT. Generating a picture and
 * attaching it to someone's advert is content we invented on their behalf, so
 * it happens when they ask for it and they can see the result before it stays.
 */

/** fal.ai's vector model. SVG out — see rule 1 above. */
export const ARTWORK_MODEL = 'fal-ai/recraft/v4.1/text-to-vector'

/** ~$0.08 per image at the time of writing. Recorded so the cost of a change
 *  of model is visible in the diff rather than discovered on an invoice. */
export const ARTWORK_COST_USD = 0.08

/**
 * THE HOUSE STYLE. One string, so every generated advert belongs to the same
 * family — which is the whole point of doing this rather than letting fifteen
 * agencies each find their own stock photo.
 *
 * Deep navy ground because the card overlays white text on a scrim: a light
 * illustration forces the scrim to fight the artwork. The first test render
 * came back cream-on-light and proved the point.
 */
const HOUSE_STYLE = [
  'Flat vector illustration, clean geometric shapes, generous negative space.',
  'Strictly limited palette: deep navy #0A1628 ground, warm cream shapes, a single yellow #FFD23F accent.',
  'Calm and editorial, not busy.',
  'No text, no lettering, no numbers, no logos, no signage.',
  'No faces and no recognisable people.',
  'Wide landscape composition, subject slightly left of centre, open space to the right.',
].join(' ')

/**
 * WHAT THE PICTURE IS OF, DERIVED FROM THE ROLE AND NOTHING ELSE.
 *
 * A table rather than a model call: it is cheap, it is readable, and — the part
 * that matters — it cannot wander into describing the venue. Anything not
 * matched falls through to a neutral hospitality interior.
 *
 * Ordered longest/most-specific first, the same rule lib/cvVocabulary needed:
 * "pastry chef" must not be caught by "chef".
 */
const SUBJECTS: [RegExp, string][] = [
  [/pastry|baker|patissier/i, 'a pastry bench with a rolling pin, piping bag and tray of unbaked pastries'],
  [/barista|coffee/i, 'an espresso machine, tamper and a row of cups on a counter'],
  [/bartender|bar manager|mixologist|bar staff/i, 'a bar counter with bottles on a back shelf, a shaker and citrus'],
  [/sommelier|wine/i, 'a wine rack, decanter and two glasses on a sideboard'],
  [/kitchen porter|dishwasher|steward/i, 'a stainless steel wash station with stacked trays and a hose'],
  [/butcher|larder/i, 'a butchery block with knives on a magnetic rail and hanging herbs'],
  [/chef|cook|kitchen/i, 'a professional kitchen pass with saucepans, a chef jacket and a sprig of herbs'],
  [/housekeep|room attendant|linen/i, 'a linen trolley with folded towels and a neatly made bed corner'],
  [/concierge|reception|front desk|host/i, 'a hotel reception desk with a bell, key rack and a potted plant'],
  [/waiter|waitress|server|front of house|restaurant manager/i, 'a laid restaurant table with plates, glassware and a folded napkin'],
  [/event|banquet|conference/i, 'a banqueting room with round tables, stacked chairs and a service trolley'],
  [/manager|supervisor|general manager/i, 'a dining room seen from the pass, with tables laid and warm lighting'],
]

const FALLBACK_SUBJECT = 'a welcoming hospitality interior with tables, soft lighting and a service counter'

/**
 * Build the prompt. PURE — no network, no model, so the judgement in it can be
 * read as a table and asserted without spending anything.
 *
 * Takes ONLY the job title. The description is deliberately not consulted: that
 * is where "Michelin Star", "Luxury 5 Star Hotel" and "Iconic" live, and those
 * are precisely the claims the artwork must not make.
 */
export function buildArtworkPrompt(jobTitle: string): { prompt: string; subject: string } {
  // The title format on this board is `Role – Marketing Phrase`, and the half
  // after the dash is sales copy about the venue. Cut it: matching on it would
  // reintroduce exactly the claims this function exists to keep out.
  const role = (jobTitle || '').split(/[–—]/)[0]
  const matched = SUBJECTS.find(([re]) => re.test(role))
  const subject = matched ? matched[1] : FALLBACK_SUBJECT
  return { prompt: `${subject}. ${HOUSE_STYLE}`, subject }
}

export interface ArtworkResult {
  /** The rasterised 16:11 webp, ready for the job-banners bucket. */
  buffer: Buffer
  subject: string
  model: string
}

/**
 * Generate and rasterise. Throws on any failure — the CALLER decides what a
 * failure means, and for the route that means leaving the advert exactly as it
 * was. A card with a broken image is worse than a card with the branded panel,
 * and we already know an exhausted API balance fails silently across this
 * codebase.
 */
export async function generateJobArtwork(
  jobTitle: string,
  targetWidth: number,
  targetHeight: number,
): Promise<ArtworkResult> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')

  const { prompt, subject } = buildArtworkPrompt(jobTitle)

  const res = await fetch(`https://fal.run/${ARTWORK_MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: { width: targetWidth, height: targetHeight } }),
  })
  if (!res.ok) throw new Error(`artwork provider returned ${res.status}`)

  const json = await res.json()
  const url: string | undefined = json?.images?.[0]?.url
  if (!url) throw new Error('artwork provider returned no image')

  const svgRes = await fetch(url)
  if (!svgRes.ok) throw new Error(`could not fetch generated artwork (${svgRes.status})`)
  const svg = Buffer.from(await svgRes.arrayBuffer())

  // RASTERISED, NOT STORED AS SVG. Three reasons, in order of weight: an SVG
  // can carry script and would have to be sanitised before it could ever be
  // served anywhere but a CSS background; the card slot wants one predictable
  // artefact at one size, exactly as every uploaded banner is; and it keeps
  // this path identical to the upload path, so there is one kind of thing in
  // the bucket rather than two.
  const sharp = (await import('sharp')).default
  const buffer = await sharp(svg, { density: 200 })
    .resize(targetWidth, targetHeight, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toBuffer()

  return { buffer, subject, model: ARTWORK_MODEL }
}
