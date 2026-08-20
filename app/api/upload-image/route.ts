import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import {
  analyseImage, chooseTreatment, renderBanner,
  type ImageFacts, type Treatment,
} from '@/lib/bannerRender'

const BANNER_BUCKET = 'job-banners'

/*
  WHO MAY UPLOAD WHAT.

  This route writes with the SERVICE ROLE, which bypasses every storage policy.
  So the bucket must never be taken from the request: a bucket name in a form
  field is the caller telling us what they are entitled to, which is the same
  coarse-attribute mistake the storage policies had, one layer up.

  Instead the request names a PURPOSE, and the purpose maps to a bucket and to
  the capability you must hold for it. Naming 'company-logos' does not get you
  company-logos — holding edit_company does.

  The capabilities are the ones the database policies already use, resolved
  through the same has_employer_permission() function, so there is one answer to
  "may this person do this" rather than a second one living in a route.

  Every employer has an owner row in employer_members: trg_create_owner_membership
  on employer_profiles seeds it. Measured on a brand-new employer before relying
  on it — has_employer_permission(self, 'edit_company') came back true with no
  backfill involved — because "all 9 current employers have one" only proved the
  July backfill ran, not that the next signup gets one.
*/
const PURPOSES = {
  'job-banners': { bucket: 'job-banners', capability: 'manage_jobs', plain: 'post a job' },
  'temp-posts': { bucket: 'temp-posts', capability: 'manage_jobs', plain: 'post a shift' },
  'company-logos': { bucket: 'company-logos', capability: 'edit_company', plain: 'edit the company profile' },
} as const

// THE BANNER GEOMETRY AND THE SIZE THRESHOLDS BOTH MOVED TO lib/bannerRender.
//
// It is the only thing that renders a banner now, and it owns the 16:11 frame
// (TARGET_WIDTH/TARGET_HEIGHT) — two copies of a frame size is how a stored
// image and the card slot drift apart.
//
// The old MIN_WIDTH/MIN_HEIGHT are CRISP_MIN_* there, and they no longer
// REFUSE anything: they choose between cropping to fill and containing on a
// filled frame. Every banner is still normalised exactly once, at upload, so
// the card, the preview, the modal and the shared-link image all show the same
// artefact rather than each cropping their own.
//
// Company logos: square, contained on white, matching what the old client-side
// canvas produced so nothing changes visually now the storage has moved.
const LOGO_SIZE = 200
const WEBP_QUALITY = 80
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    // Rate limit: max 20 requests per minute per IP
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimit(`upload-image:${ip}`, 20, 60000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // ── Who is asking? ──────────────────────────────────
    // Until this existed the route never established a caller at all, and wrote
    // to a public bucket with the service role for anyone who asked. Three
    // unauthenticated requests put objects in three different buckets.
    //
    // The refusals below are deliberately legible by CLASS — signed out, not an
    // employer, or missing one named capability — so a caller can act on the
    // answer, without naming tables, policies or which employer ids exist.
    const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '')
    if (!token) {
      return NextResponse.json(
        { error: 'You need to be signed in to upload an image.', reason: 'not_signed_in' },
        { status: 401 }
      )
    }
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Your session has expired. Sign in again and retry.', reason: 'not_signed_in' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('image') as File | null

    // The request names a PURPOSE. The bucket comes from our table, never from
    // the caller. '' stays job-banners so the existing post-job flow is unchanged.
    const purposeKey = ((formData.get('bucket') as string) || BANNER_BUCKET) as keyof typeof PURPOSES
    const purpose = PURPOSES[purposeKey]
    if (!purpose) {
      return NextResponse.json(
        { error: 'Unknown upload type.', reason: 'unknown_purpose' },
        { status: 400 }
      )
    }
    const targetBucket = purpose.bucket

    // ── May they do THIS? ───────────────────────────────
    // has_employer_permission reads auth.uid() internally, so it has to be asked
    // AS THE CALLER — asking as the service role would evaluate auth.uid() to
    // null and refuse everybody. The employer lookup below is plumbing; the
    // authorisation answer comes only from the function.
    const { data: memberships } = await admin
      .from('employer_members')
      .select('employer_id, employer_profiles!inner(user_id)')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (!memberships?.length) {
      return NextResponse.json(
        { error: 'Image uploads are only available to employer accounts.', reason: 'not_an_employer' },
        { status: 403 }
      )
    }

    const asCaller = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    let permitted = false
    for (const m of memberships) {
      const ownerId = (m as any).employer_profiles?.user_id
      if (!ownerId) continue
      const { data: allowed } = await asCaller.rpc('has_employer_permission', {
        target: ownerId,
        cap: purpose.capability,
      })
      if (allowed === true) { permitted = true; break }
    }
    if (!permitted) {
      return NextResponse.json(
        {
          error: `Your account does not have permission to ${purpose.plain}. An owner can grant it in Team settings.`,
          reason: 'missing_permission',
        },
        { status: 403 }
      )
    }

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      )
    }

    const isTempPost = targetBucket === 'temp-posts'
    const isLogo = targetBucket === 'company-logos'
    // Temp Work accepts any common photo (incl. phone HEIC); banners stay strict.
    const allowedTypes = isTempPost
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
      : ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const metadata = await sharp(buffer).metadata()

    if (!metadata.width || !metadata.height) {
      return NextResponse.json(
        { error: 'Could not read image dimensions.' },
        { status: 400 }
      )
    }

    // EXIF orientation is applied by .rotate() below, but sharp reports metadata
    // in the file's OWN axes — so a portrait phone photo tagged orientation 6
    // reports as landscape. Every size decision after this point must use the
    // dimensions the image will actually have, or the crop box is computed for
    // the wrong shape and a portrait photo comes out cropped to its middle.
    const rotated = (metadata.orientation ?? 1) >= 5
    const srcW = rotated ? metadata.height : metadata.width
    const srcH = rotated ? metadata.width : metadata.height

    // THE SIZE REJECTION IS GONE, DELIBERATELY.
    //
    // This used to refuse anything under 400x300 with "Image is too small…
    // smaller images will look blurry." It was honest and it was the wrong
    // trade: it is the moment a chef on a phone gives up, and it produced
    // exactly the back-and-forth the product is trying to delete. A small image
    // is now CONTAINED on a filled frame instead — see lib/bannerRender. It is
    // slightly soft and unmistakably deliberate, which beats being sent away.
    //
    // Temp posts were already exempt, and the reason written here was "the
    // person posting a Saturday shift is on a phone and should not meet a
    // dimensions error". That was always just as true of a job.
    //
    // MIN_WIDTH/MIN_HEIGHT still exist as the CRISPNESS threshold — they now
    // choose a treatment rather than refuse the upload.

    // ONE GEOMETRY FOR BOTH, as of the shared card.
    //
    // A temp post's image used to keep its own aspect ratio, because it rendered
    // as a photo inside a white text card and any shape looked fine. It is now
    // the BACKGROUND of the same 16:11 card a job gets, so it is cropped exactly
    // as a job banner is. An uncropped portrait phone photo behind that card
    // would have shown its middle third and nothing else.
    //
    // What stays different for temp posts is the INPUT, not the output: HEIC and
    // small images are still accepted, because the person posting a Saturday
    // shift is doing it on a phone and should not meet a dimensions error.
    //
    // Computing the box from the source — rather than relying on fit:'cover' +
    // withoutEnlargement, which skips the crop when the source is smaller than
    // the target — guarantees the stored image is exactly 16:11, so the card
    // shows it uncropped and the composer's preview is an exact match.
    let processedBuffer: Buffer
    // Recorded so the response can say what happened to the image. Undefined
    // on the logo path, which is not chosen — a logo is always contained on
    // white at 200x200.
    let facts: ImageFacts | undefined
    let treatment: Treatment | undefined
    if (isLogo) {
      // A LOGO IS NOT A BANNER. Cropping one to 16:11 would cut the top and
      // bottom off a square mark. Contain it in a 200x200 square on white —
      // deliberately the same geometry the old canvas code produced, so existing
      // logos are unchanged in appearance and only their storage moves.
      processedBuffer = await sharp(buffer)
        .rotate()
        .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer()
    } else {
      // WHAT THE IMAGE IS, NOT WHICH BOX IT CAME FROM.
      //
      // `isLogo` above means "arrived via the company-logos purpose" — it is a
      // fact about the FORM FIELD, not about the file. So a company logo
      // dropped into the banner box, which is precisely what a business does
      // with an empty image box, used to be cover-cropped to 16:11 and
      // enlarged, slicing the top and bottom off the mark. Ricci's first
      // advert is the worked example.
      //
      // The file is now inspected and the treatment chosen from what is
      // actually in it. A photograph still takes the attention-crop path that
      // already worked; a graphic, an extreme shape or a small image is
      // contained on a filled frame instead. Either way the output is exactly
      // 16:11, so the board stays uniform however varied the uploads are.
      facts = await analyseImage(buffer)
      treatment = chooseTreatment(facts)
      processedBuffer = await renderBanner(buffer, treatment, WEBP_QUALITY)
    }

    // Store the processed banner as a file in the public 'job-banners' bucket and
    // return its public URL. Falls back to an inline base64 data URL if Storage
    // is unavailable, so uploads keep working either way. (Existing banners were
    // migrated from base64 to this bucket by scripts/migrate-banners-to-storage.js.)
    let url: string | null = null
    try {
      // Reuses the service-role client built during the auth check above. It used
      // to be constructed here with a `SERVICE_ROLE_KEY || ANON_KEY` fallback —
      // removed, because that fallback would silently downgrade an authorised
      // upload into an anon-key write and fail against the storage policies for
      // reasons that would look nothing like a missing env var.
      const path = `${randomUUID()}.webp`
      const { error: upErr } = await admin.storage
        .from(targetBucket)
        .upload(path, processedBuffer, { contentType: 'image/webp', upsert: false })
      if (upErr) throw upErr
      url = admin.storage.from(targetBucket).getPublicUrl(path).data.publicUrl
    } catch (e: any) {
      console.error('[upload-image] Storage upload failed, falling back to base64:', e?.message)
    }

    const dataUrl = `data:image/webp;base64,${processedBuffer.toString('base64')}`

    return NextResponse.json({
      success: true,
      url: url || dataUrl, // prefer the Storage URL; base64 only if Storage failed
      dataUrl, // kept for back-compat
      storedToBucket: Boolean(url),
      originalSize: file.size,
      processedSize: processedBuffer.length,
      originalDimensions: { width: srcW, height: srcH },
      // WHAT WE DID AND WHY. Returned so the composer can eventually say
      // "we've fitted your logo onto a Thrive panel" rather than silently
      // changing what someone uploaded — and so the shape of real uploads is
      // visible at all. NOTHING PERSISTS IT YET; see the report.
      treatment: treatment
        ? { mode: treatment.mode, reason: treatment.reason, fill: treatment.fill }
        : null,
      sourceFacts: facts
        ? {
            width: facts.width, height: facts.height,
            aspect: Number(facts.aspect.toFixed(3)),
            transparent: facts.transparent,
            entropy: Number(facts.entropy.toFixed(2)),
          }
        : null,
    })
  } catch (error) {
    console.error('Image processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process image. Please try a different file.' },
      { status: 500 }
    )
  }
}
