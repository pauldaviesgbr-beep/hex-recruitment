import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyApprovalToken } from '@/lib/foundingApprovalToken'
import { calculateFoundingPeriodEnd } from '@/lib/foundingEntitlement'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'
import { sendEmail } from '@/lib/email'
import { emailLayout, ctaButton } from '@/emails/layout'

// Tamper-proof approve/reject endpoint hit from the email Paul receives
// when a freemail founding signup needs review. The token in `?t=...`
// is the only proof of intent — IDs alone are guessable.
//
// Idempotency / single-use: enforced by approval_status. Once a row is
// flipped to approved/rejected/waitlisted, re-submitting the same (or a
// stale) token is a no-op with a clear "already decided" message.
//
// GET and POST both supported so the email client's link-prefetcher
// doesn't break the flow (email scanners GET arbitrary links — we want
// idempotency to make that safe). The action is in the signed token,
// not the HTTP method, so a GET to an "approve" token does approve.

export const dynamic = 'force-dynamic'

async function handle(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get('t') || ''

  const verified = verifyApprovalToken(token)
  if (!verified) {
    return htmlResponse(
      403,
      'Invalid or expired link',
      'This approval link is invalid, tampered with, or has expired. Generate a new one by re-triggering the signup, or set approval_status manually via the dashboard.',
    )
  }

  const { userId, action } = verified

  // Read current state. If the row doesn't exist we can't approve.
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('employer_profiles')
    .select('user_id, email, company_name, contact_name, approval_status')
    .eq('user_id', userId)
    .maybeSingle()

  if (profileErr || !profile) {
    return htmlResponse(
      404,
      'Account not found',
      'No employer profile exists for this user. They may have deleted their account, or this token references a removed signup.',
    )
  }

  // Single-use: if already decided, surface the prior decision rather
  // than re-acting. A re-fired link from an email scanner shouldn't flip
  // approved → approved or rejected → approved.
  if (profile.approval_status === 'approved' || profile.approval_status === 'rejected' || profile.approval_status === 'waitlisted') {
    return htmlResponse(
      200,
      'Already decided',
      `This signup is already <strong>${profile.approval_status}</strong>. The link is single-use; no change made.`,
    )
  }

  if (action === 'reject') {
    const { error: rejectErr } = await supabaseAdmin
      .from('employer_profiles')
      .update({ approval_status: 'rejected' })
      .eq('user_id', userId)

    if (rejectErr) {
      console.error('[approve-founding] reject update failed', rejectErr)
      return htmlResponse(500, 'Update failed', rejectErr.message)
    }

    return htmlResponse(
      200,
      'Rejected',
      `Marked <strong>${escapeHtml(profile.company_name || profile.email || userId)}</strong> as rejected. No founding spot consumed. The user will see an "account under review" page on login.`,
    )
  }

  // action === 'approve'
  // Cap re-check at approval time: if the 100 spots filled up since the
  // signup landed, we waitlist rather than overfill.
  const { data: claimedRaw, error: countErr } = await supabaseAdmin.rpc('count_founding_spots_claimed')
  const claimed = countErr ? 0 : (typeof claimedRaw === 'number' ? claimedRaw : 0)

  if (claimed >= EMPLOYER_COHORT_CAP) {
    // Cohort full — waitlist this signup so it's distinguishable from a
    // bare rejected/pending row and can be flipped to approved later if
    // a spot opens.
    await supabaseAdmin
      .from('employer_profiles')
      .update({ approval_status: 'waitlisted' })
      .eq('user_id', userId)

    return htmlResponse(
      200,
      'Cohort full — waitlisted',
      `Cohort is at the ${EMPLOYER_COHORT_CAP} cap. Marked <strong>${escapeHtml(profile.company_name || profile.email || userId)}</strong> as waitlisted. They will not consume a spot. You can flip them to 'approved' manually in the DB if a spot opens.`,
    )
  }

  // Approve: write the founding subscription row + flip profile status
  // + email the employer to tell them they're in.
  const { error: subErr } = await supabaseAdmin
    .from('employer_subscriptions')
    .upsert(
      {
        user_id: userId,
        subscription_status: 'inactive',
        subscription_tier: 'free',
        founding_period_ends_at: calculateFoundingPeriodEnd().toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (subErr) {
    console.error('[approve-founding] sub upsert failed', subErr)
    return htmlResponse(500, 'Approval failed', subErr.message)
  }

  await supabaseAdmin
    .from('employer_profiles')
    .update({ approval_status: 'approved' })
    .eq('user_id', userId)

  if (profile.email) {
    const companyName = profile.company_name || 'there'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
    const firstName = escapeHtml(((profile.contact_name as string) || '').split(' ')[0] || '')
    const approvedSubject = "You're in — your Thrive account is approved"
    sendEmail(
      profile.email,
      approvedSubject,
      emailLayout(approvedSubject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">You're in${firstName ? `, ${firstName}` : ''} &#127881;</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          Your account for <strong style="color:#0f172a;">${escapeHtml(companyName)}</strong> has been approved for the Thrive founding cohort. You now have the full hiring pipeline &mdash; post jobs, browse candidates, schedule interviews and make offers &mdash; <strong>free for 12 months</strong>.
        </p>
        ${ctaButton('Go to your dashboard', `${siteUrl}/employer/dashboard`)}
        <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.6;">
          Questions, or something looks off? Just reply to this email &mdash; we'd love to help you get hiring.
        </p>
      `),
      undefined,
      undefined,
      { emailType: 'founding_approved' },
    ).catch(err => console.error('[approve-founding] employer email failed', err))
  }

  return htmlResponse(
    200,
    'Approved',
    `Approved <strong>${escapeHtml(profile.company_name || profile.email || userId)}</strong>. Founding spot consumed (${claimed + 1}/${EMPLOYER_COHORT_CAP}). Confirmation email sent to the employer.`,
  )
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }

function htmlResponse(status: number, title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
     <meta name="robots" content="noindex,nofollow">
     <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:80px auto;padding:0 16px;color:#0f172a;line-height:1.5}h1{font-size:22px;margin:0 0 12px}p{color:#475569}</style>
     </head><body><h1>${title}</h1><p>${body}</p></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
