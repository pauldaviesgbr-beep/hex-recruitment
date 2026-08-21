import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import { generateJobArtwork, ARTWORK_MODEL } from '@/lib/jobArtwork'
import { TARGET_WIDTH, TARGET_HEIGHT } from '@/lib/bannerRender'

/**
 * GENERATE AN IMAGE FOR AN ADVERT I HAVE NOT PUBLISHED YET.
 *
 * The sibling route, /api/jobs/[id]/artwork, needs an advert to exist. This one
 * does not, and that is the point: the picture is chosen on step 3, and
 * publishing is the button at the bottom of step 3 — so at the moment someone
 * presses this there is no advert to attach anything to.
 *
 * IT WRITES NOTHING ANYWHERE. It generates, stores the file, and hands back a
 * URL. The form holds that URL in its own state and it reaches the database
 * only if the employer goes on to publish — so an employer who generates an
 * image, dislikes it and closes the tab has changed nothing at all.
 *
 * That also dissolves most of the consent question Paul raised. Nothing is
 * "done to" anyone's post: they ask for a picture, they see it in the preview
 * beside the button, and it becomes part of the advert only by publishing.
 *
 * The cost is real per call (~$0.08), so the rate limit is tight and the
 * capability check is the same one posting a job requires.
 */

const BUCKET = 'job-banners'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimit(`job-artwork-draft:${ip}`, 6, 60_000)) {
      return NextResponse.json(
        { error: 'That is a lot of images. Give it a minute.' }, { status: 429 })
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
        { error: 'Your session has expired. Sign in again and retry.', reason: 'not_signed_in' },
        { status: 401 })
    }

    // Same capability as posting a job, asked the same way — AS THE CALLER, so
    // has_employer_permission can read auth.uid(). There is one answer to "may
    // this person do this" and it does not get a second implementation here.
    const { data: memberships } = await admin
      .from('employer_members')
      .select('employer_id, employer_profiles!inner(user_id)')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (!memberships?.length) {
      return NextResponse.json(
        { error: 'Only employer accounts can create advert images.', reason: 'not_an_employer' },
        { status: 403 })
    }

    const asCaller = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } },
    )
    let permitted = false
    for (const m of memberships) {
      const ownerId = (m as any).employer_profiles?.user_id
      if (!ownerId) continue
      const { data: allowed } = await asCaller.rpc('has_employer_permission', {
        target: ownerId, cap: 'manage_jobs',
      })
      if (allowed === true) { permitted = true; break }
    }
    if (!permitted) {
      return NextResponse.json(
        { error: 'Your account does not have permission to post a job.', reason: 'missing_permission' },
        { status: 403 })
    }

    const { jobTitle } = await request.json().catch(() => ({}))
    if (!jobTitle || typeof jobTitle !== 'string' || !jobTitle.trim()) {
      return NextResponse.json(
        { error: 'Add a job title first — the picture is chosen from the role.' },
        { status: 400 })
    }

    let artwork
    try {
      artwork = await generateJobArtwork(jobTitle, TARGET_WIDTH, TARGET_HEIGHT)
    } catch (e) {
      // FAILS CLOSED. The employer keeps whatever they had, which at this point
      // is nothing, and the advert will simply publish with the branded panel.
      // A provider name or a billing state is not their problem, so the message
      // says what to do instead.
      console.error('[job-artwork-draft] generation failed:', (e as Error).message)
      return NextResponse.json(
        {
          error: 'We could not generate an image just now. You can publish without one, or upload a photo.',
          reason: 'generation_failed',
        },
        { status: 503 })
    }

    const path = `${randomUUID()}.webp`
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, artwork.buffer, { contentType: 'image/webp', upsert: false })
    if (uploadError) {
      console.error('[job-artwork-draft] storage upload failed:', uploadError.message)
      return NextResponse.json(
        { error: 'We could not save the image. Nothing has changed.', reason: 'storage_failed' },
        { status: 503 })
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

    return NextResponse.json({
      success: true,
      url: pub.publicUrl,
      // Named so the employer is told what was generated rather than left to guess:
      // "we've generated a kitchen pass" reads as a choice, an image appearing does
      // not.
      subject: artwork.subject,
      model: ARTWORK_MODEL,
    })
  } catch (error) {
    console.error('[job-artwork-draft] unexpected:', error)
    return NextResponse.json({ error: 'Something went wrong. Nothing has changed.' }, { status: 500 })
  }
}
