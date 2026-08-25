import { NextRequest, NextResponse } from 'next/server'
import { buildOfferPdf } from '@/lib/buildOfferPdf'
import { appendSignaturesToPdf, dataUrlToBytes, type SignatureBlock } from '@/lib/signPdf'

import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Candidate counter-sign: rebuild the offer PDF with both signatures stamped
 * on the body, append the audit certificate page, swap offer_letter_url, and
 * notify the employer.
 *
 * Server-side because:
 *   - Storage write of the official signed copy lives under employer-scoped
 *     RLS; doing it server-side with the service role keeps the candidate
 *     out of the storage policy graph.
 *   - IP + user-agent come from request headers, which are more reliable for
 *     audit than client-supplied values.
 *
 * Status semantics:
 *   - 200: success, returns { ok: true, status: 'accepted', offerLetterUrl }
 *   - 401/404: auth or RLS — don't leak existence; both look like "not found"
 *   - 409: already accepted (idempotent — returns current offerLetterUrl) OR
 *           previously declined
 *   - 410: employer withdrew the offer between candidate opening URL and submit
 *   - 400: bad input or invalid state
 *   - 500: server-side build/upload failure
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const { offerId } = await params

  // ── Auth ────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse + validate body ───────────────────────────
  let body: { signatureDataUrl?: string; signerName?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const signatureDataUrl = body.signatureDataUrl
  const signerName = body.signerName?.trim()
  if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'Signature image required' }, { status: 400 })
  }
  if (!signerName) {
    return NextResponse.json({ error: 'Signer name required' }, { status: 400 })
  }

  // ── Load the offer (scoped to the candidate) ────────
  const { data: offer, error: fetchErr } = await supabaseAdmin
    .from('job_offers')
    .select('*, jobs(title, company)')
    .eq('id', offerId)
    .eq('candidate_id', user.id)
    .maybeSingle()

  if (fetchErr) {
    console.error('[counter-sign] offer fetch failed:', fetchErr)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
  if (!offer) {
    // RLS denied or doesn't exist — same response either way to avoid leaking
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── Status branching ────────────────────────────────
  if (offer.status === 'accepted') {
    return NextResponse.json(
      { ok: true, status: 'accepted', offerLetterUrl: offer.offer_letter_url, alreadySigned: true },
      { status: 409 },
    )
  }
  if (offer.status === 'withdrawn') {
    return NextResponse.json(
      { error: 'This offer has been withdrawn by the employer.', status: 'withdrawn' },
      { status: 410 },
    )
  }
  if (offer.status === 'declined') {
    return NextResponse.json(
      { error: 'You previously declined this offer.', status: 'declined' },
      { status: 409 },
    )
  }
  if (offer.status !== 'pending') {
    return NextResponse.json({ error: 'Invalid offer state.' }, { status: 400 })
  }

  // ── Audit trio: timestamp + IP + UA ─────────────────
  const nowIso = new Date().toISOString()
  // x-forwarded-for can be a comma-separated chain; take the originating client.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || null
  const userAgent = req.headers.get('user-agent') || null

  // ── Upload candidate signature PNG separately (in-app rendering + audit) ─
  let candidateSignatureImagePath: string | null = null
  try {
    const sigBytes = Buffer.from(signatureDataUrl.split(',')[1] || '', 'base64')
    const sigPath = `signatures/${user.id}/${offerId}-${Date.now()}.png`
    const { error: sigUpErr } = await supabaseAdmin.storage
      .from('profiles')
      .upload(sigPath, sigBytes, { contentType: 'image/png', upsert: true })
    if (!sigUpErr) candidateSignatureImagePath = sigPath
  } catch (err) {
    console.error('[counter-sign] candidate signature PNG upload failed:', err)
    // Non-fatal — the cert page still embeds the signature
  }

  // ── Fetch employer signature image bytes (for body re-stamp) ─
  let employerSignatureDataUrl: string | undefined
  let employerSignatureBytes: Uint8Array | undefined
  if (offer.employer_signature_image_url) {
    try {
      const { data: empSig } = await supabaseAdmin.storage
        .from('profiles')
        .download(offer.employer_signature_image_url)
      if (empSig) {
        const arrBuf = await empSig.arrayBuffer()
        employerSignatureBytes = new Uint8Array(arrBuf)
        employerSignatureDataUrl = `data:image/png;base64,${Buffer.from(arrBuf).toString('base64')}`
      }
    } catch (err) {
      console.error('[counter-sign] employer signature fetch failed:', err)
    }
  }

  const candidateName = (user.user_metadata as { full_name?: string } | null)?.full_name || signerName
  const company = (Array.isArray(offer.jobs) ? offer.jobs[0]?.company : (offer.jobs as { company?: string } | null)?.company) || 'The Company'
  const jobTitle = (Array.isArray(offer.jobs) ? offer.jobs[0]?.title : (offer.jobs as { title?: string } | null)?.title) || 'the role'
  const signedFileName = `offer-${candidateName.replace(/\s+/g, '-')}-signed.pdf`

  // ── Rebuild PDF with both signatures stamped on body lines ─
  // For offers that have offer_letter_text we rebuild from scratch (clean
  // path with body sigs). For offers without (legacy or employer-uploaded
  // PDFs), we fall back to the raw PDF + cert page only.
  let bodyStampedBytes: Uint8Array
  if (offer.offer_letter_text) {
    try {
      const built = await buildOfferPdf({
        bodyText: offer.offer_letter_text,
        companyName: company,
        candidateName,
        fileName: signedFileName,
        employerSignature: employerSignatureDataUrl
          ? {
              dataUrl: employerSignatureDataUrl,
              name: offer.employer_signature_name || 'Employer',
              signedAt: offer.employer_signature_timestamp ? new Date(offer.employer_signature_timestamp) : new Date(nowIso),
            }
          : undefined,
        candidateSignature: {
          dataUrl: signatureDataUrl,
          name: signerName,
          signedAt: new Date(nowIso),
        },
      })
      bodyStampedBytes = new Uint8Array(await built.file.arrayBuffer())
    } catch (err) {
      console.error('[counter-sign] buildOfferPdf failed:', err)
      return NextResponse.json({ error: 'Failed to build signed PDF' }, { status: 500 })
    }
  } else if (offer.offer_letter_url) {
    // Legacy / uploaded-PDF path — append cert page only, no body re-stamp
    try {
      const { data: pdfBlob } = await supabaseAdmin.storage
        .from('profiles')
        .download(offer.offer_letter_url)
      if (!pdfBlob) throw new Error('Could not fetch existing PDF')
      bodyStampedBytes = new Uint8Array(await pdfBlob.arrayBuffer())
    } catch (err) {
      console.error('[counter-sign] legacy PDF fetch failed:', err)
      return NextResponse.json({ error: 'Failed to load offer PDF' }, { status: 500 })
    }
  } else {
    return NextResponse.json({ error: 'Offer has no document to sign' }, { status: 400 })
  }

  // ── Append audit certificate page (employer + candidate cert blocks) ─
  let finalPdfBytes: Uint8Array
  try {
    const certBlocks: SignatureBlock[] = []
    if (employerSignatureBytes && offer.employer_signature_timestamp) {
      certBlocks.push({
        role: 'Employer',
        name: offer.employer_signature_name || 'Employer',
        imageBytes: employerSignatureBytes,
        signedAt: offer.employer_signature_timestamp,
        userAgent: offer.employer_signature_user_agent,
      })
    }
    certBlocks.push({
      role: 'Candidate',
      name: signerName,
      imageBytes: dataUrlToBytes(signatureDataUrl),
      signedAt: nowIso,
      userAgent,
    })
    finalPdfBytes = await appendSignaturesToPdf(bodyStampedBytes, certBlocks)
  } catch (err) {
    console.error('[counter-sign] cert page append failed (continuing without):', err)
    finalPdfBytes = bodyStampedBytes
  }

  // ── Upload final signed PDF ─────────────────────────
  const newPath = `offer-letters/${user.id}/signed-${offerId}-${Date.now()}.pdf`
  const { error: uploadErr } = await supabaseAdmin.storage
    .from('profiles')
    .upload(newPath, finalPdfBytes, { contentType: 'application/pdf', upsert: true })
  if (uploadErr) {
    console.error('[counter-sign] signed PDF upload failed:', uploadErr)
    return NextResponse.json({ error: 'Failed to upload signed PDF' }, { status: 500 })
  }

  // ── Update job_offers row ───────────────────────────
  const { error: updateErr } = await supabaseAdmin
    .from('job_offers')
    .update({
      status: 'accepted',
      signature_name: signerName,
      signature_timestamp: nowIso,
      signature_image_url: candidateSignatureImagePath,
      signature_ip: ip,
      signature_user_agent: userAgent,
      offer_letter_url: newPath,
    })
    .eq('id', offerId)
    .eq('candidate_id', user.id) // belt-and-suspenders

  if (updateErr) {
    console.error('[counter-sign] job_offers update failed:', updateErr)
    return NextResponse.json({ error: 'Failed to update offer status' }, { status: 500 })
  }

  // ── Notifications + emails (best-effort; never block the success response) ─
  // Both sides get an in-app notification + an email. The candidate's email
  // points back at /applications/[id]/review (auth-gated, fresh signed URL
  // generated on demand) rather than embedding a Supabase signed URL that
  // expires in an hour.

  // Employer in-app notification (preserves prior behaviour from SignatureModal)
  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: offer.employer_id,
      title: 'Offer Accepted',
      message: `${candidateName} has accepted the offer for ${jobTitle}`,
      type: 'application_status_change',
      read: false,
      related_id: offer.application_id,
      related_type: 'application',
      link: '/my-jobs',
    })
  } catch (err) {
    console.error('[counter-sign] employer notification insert failed:', err)
  }

  // Candidate in-app notification (new in commit 6)
  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: user.id,
      title: 'Offer Signed',
      message: `Your signed offer for ${jobTitle} is ready — download your copy.`,
      type: 'application_status_change',
      read: false,
      related_id: offer.application_id,
      related_type: 'application',
      link: `/applications/${offer.application_id}/review`,
    })
  } catch (err) {
    console.error('[counter-sign] candidate notification insert failed:', err)
  }

  // Employer email (preserves prior behaviour)
  fetch(new URL('/api/email/send', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'application_status',
      data: { recipientUserId: offer.employer_id, status: 'offer_accepted', companyName: company, jobTitle, candidateName },
    }),
  }).catch(err => console.error('[counter-sign] employer email failed:', err))

  // Candidate email (new in commit 6) — confirmation with link to download.
  fetch(new URL('/api/email/send', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'application_status',
      data: {
        recipientUserId: user.id,
        status: 'offer_counter_signed',
        companyName: company,
        jobTitle,
        candidateName,
        applicationId: offer.application_id,
      },
    }),
  }).catch(err => console.error('[counter-sign] candidate email failed:', err))

  return NextResponse.json({
    ok: true,
    status: 'accepted',
    offerLetterUrl: newPath,
  })
}
