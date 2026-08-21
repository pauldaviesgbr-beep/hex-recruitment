import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import { generateJobArtwork, ARTWORK_MODEL } from '@/lib/jobArtwork'
import { TARGET_WIDTH, TARGET_HEIGHT } from '@/lib/bannerRender'

/**
 * MAKE ME AN IMAGE FOR THIS ADVERT.
 *
 * Employer-initiated, always. Generating a picture and attaching it to
 * someone's advert is content invented on their behalf, so it happens because
 * they pressed a button and they can see the result. It is not a default and it
 * never runs on its own.
 *
 * IT NEVER OVERWRITES A PHOTOGRAPH. If the advert already has a banner the
 * request is refused rather than silently replacing what the employer chose —
 * a destructive write needs a condition that makes the wrong outcome
 * impossible, and here that condition is "the field is empty".
 *
 * IT FAILS CLOSED. Any failure — no key, provider down, an exhausted balance,
 * an SVG sharp cannot read — leaves the advert exactly as it was, still showing
 * the branded panel. Nothing half-written, no broken image. This codebase has
 * already been bitten once by an API balance running out quietly across five
 * routes; the answer is that the advert must not depend on the call succeeding.
 */

const BUCKET = 'job-banners'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Generation costs real money per call, so the limit is much tighter than
    // the image-upload route's twenty a minute.
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimit(`job-artwork:${ip}`, 6, 60_000)) {
      return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 })
    }

    const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '')
    if (!token) {
      return NextResponse.json(
        { error: 'You need to be signed in.', reason: 'not_signed_in' }, { status: 401 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Your session has expired. Sign in again and retry.', reason: 'not_signed_in' }, { status: 401 })
    }

    // ── Is this their advert, and may they change it? ────────────────────
    // The same question the upload route asks, answered the same way: through
    // has_employer_permission, AS THE CALLER, so there is one answer to "may
    // this person do this" rather than a second one living in a route.
    const { data: job } = await admin
      .from('jobs')
      .select('id, title, employer_id, company_banner_url')
      .eq('id', params.id)
      .maybeSingle()

    if (!job) {
      return NextResponse.json({ error: 'Advert not found.' }, { status: 404 })
    }

    const asCaller = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } },
    )
    const { data: allowed } = await asCaller.rpc('has_employer_permission', {
      target: job.employer_id,
      cap: 'manage_jobs',
    })
    if (allowed !== true) {
      return NextResponse.json(
        { error: 'Your account cannot change this advert.', reason: 'missing_permission' }, { status: 403 })
    }

    // THE GUARD THAT MAKES THE WRONG OUTCOME IMPOSSIBLE. An employer's own
    // photograph is the one thing this must never replace.
    const existing = (job.company_banner_url || '').trim()
    if (existing) {
      return NextResponse.json(
        {
          error: 'This advert already has an image. Remove it first if you want artwork instead.',
          reason: 'already_has_image',
        },
        { status: 409 },
      )
    }

    // ── Generate ─────────────────────────────────────────────────────────
    let artwork
    try {
      artwork = await generateJobArtwork(job.title || '', TARGET_WIDTH, TARGET_HEIGHT)
    } catch (e) {
      // FAIL CLOSED — the advert is untouched and still renders the branded
      // panel. The reason is logged, not shown: a provider name or a billing
      // state is not the employer's problem.
      console.error('[job-artwork] generation failed:', (e as Error).message)
      return NextResponse.json(
        {
          error: 'We could not create an image just now. Your advert is unchanged — try again shortly, or upload a photo.',
          reason: 'generation_failed',
        },
        { status: 503 },
      )
    }

    const path = `${randomUUID()}.webp`
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, artwork.buffer, { contentType: 'image/webp', upsert: false })
    if (uploadError) {
      console.error('[job-artwork] storage upload failed:', uploadError.message)
      return NextResponse.json(
        { error: 'We could not save the image. Your advert is unchanged.', reason: 'storage_failed' },
        { status: 503 },
      )
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
    const url = pub.publicUrl

    // The write re-asserts the empty-banner precondition, so an employer who
    // uploaded a photo in the seconds this took is not overwritten by a stale
    // read. Same reasoning as the discoverability flip re-evaluating its gate
    // at write time rather than trusting the row it selected.
    const { data: updated, error: writeError } = await admin
      .from('jobs')
      .update({ company_banner_url: url })
      .eq('id', job.id)
      .or('company_banner_url.is.null,company_banner_url.eq.')
      .select('id')
      .maybeSingle()

    if (writeError || !updated) {
      return NextResponse.json(
        {
          error: 'Your advert changed while we were working. Nothing was overwritten.',
          reason: 'raced',
        },
        { status: 409 },
      )
    }

    return NextResponse.json({
      success: true,
      url,
      // What we drew and why, so the employer can be told rather than left to
      // notice. "We've generated a kitchen pass" is a different experience from an
      // image appearing.
      subject: artwork.subject,
      model: ARTWORK_MODEL,
    })
  } catch (error) {
    console.error('[job-artwork] unexpected:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Your advert is unchanged.' }, { status: 500 })
  }
}
