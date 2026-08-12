import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FREE_FOUNDING_MODE } from '@/lib/constants/cohort'
import { calculateFoundingPeriodEnd } from '@/lib/foundingEntitlement'
import { classifyEmail, type EmailClass } from '@/lib/emailDomains'
import { generateApprovalToken } from '@/lib/foundingApprovalToken'
import { sendEmail } from '@/lib/email'
import { emailLayout, ctaButton } from '@/emails/layout'

/**
 * Sets approval_status ONLY when it has not already been decided.
 *
 * Why this exists, and why `ignoreDuplicates` alone is not the whole fix.
 *
 * The upserts below used to run with a plain `{ onConflict: 'user_id' }`, which
 * REWRITES the row every time. Since provisioning runs on every trip through
 * /auth/confirm — email confirmation, a magic link, a password reset — an
 * employer who had been manually approved was silently returned to 'pending' and
 * bounced to /account-under-review with no explanation. The comment above the
 * upsert already claimed ignoreDuplicates was in use; it wasn't.
 *
 * But ignoreDuplicates on its own opens a hole in the other direction. The PAID
 * signup form writes an employer_profiles row at submit time WITHOUT an
 * approval_status. If provisioning then declines to touch the existing row, that
 * row keeps approval_status NULL — and app/employer/layout.tsx treats NULL as
 * "legacy, allow". A freemail employer would sail past the manual review they
 * are supposed to be held for.
 *
 * So: don't clobber a decision that exists, and do settle one that doesn't.
 * `is null` in the WHERE clause is the whole guarantee — it can only ever move a
 * row from undecided to decided, never between two decisions.
 */
async function settleApprovalStatus(
  admin: SupabaseClient,
  userId: string,
  status: 'approved' | 'pending',
): Promise<void> {
  const { error } = await admin
    .from('employer_profiles')
    .update({ approval_status: status })
    .eq('user_id', userId)
    .is('approval_status', null)
  if (error) console.error('[foundingSignup] settleApprovalStatus failed', error)
}

/**
 * Single source of truth for what happens at email-confirmation time
 * for a brand-new employer. Called from:
 *   - lib/authCallback.ts (email-link signup flow via /auth/confirm)
 *   - app/auth/callback/employer/route.ts (Google OAuth flow)
 *
 * The domain class lives in user_metadata.email_domain_class (stamped
 * server-side by /api/auth/employer-signup) but we re-classify the
 * email here so the OAuth path — which doesn't go through our signup
 * route — still gets the right treatment.
 *
 *   business  → employer_subscriptions(tier='free', founding_period_ends_at)
 *               + employer_profiles.approval_status='approved'. Spot
 *               consumed; gate opens.
 *   freemail  → employer_profiles.approval_status='pending'. NO
 *               employer_subscriptions row written; spot NOT consumed;
 *               gate stays closed; email Paul with signed approve/reject
 *               links.
 *   disposable → should never reach here for the email-signup flow (the
 *               signup endpoint blocks 422 first). For OAuth it's
 *               theoretically possible — treat as freemail-pending so
 *               Paul has a chance to reject explicitly rather than
 *               silently bouncing.
 */

// Recipient of the founding-cohort approval email. Configurable via
// env var FOUNDING_ADMIN_EMAIL — defaults to paul@thrivecareer.co.uk
// (the verified mailbox Paul confirmed receives reliably). Previously
// hardcoded to pauldavies.gbr@gmail.com; the change unblocks Resend
// deliverability if the gmail-recipient combo was triggering bounces
// and lets us swap the reviewer without redeploying.
function getFoundingAdminEmail(): string {
  return (process.env.FOUNDING_ADMIN_EMAIL || 'paul@thrivecareer.co.uk').trim()
}

export type ProvisionResult = {
  status: 'approved' | 'pending' | 'noop_legacy_mode'
  classification: EmailClass | 'unknown'
  /**
   * For 'pending' provisions, records what happened when we tried to
   * email Paul. 'sent' = Resend accepted the send; 'failed' includes
   * the (stringified) error; 'skipped' = this employer had already been
   * decided, so no review was requested. Absent on 'approved'/'noop' paths.
   *
   * The founding-row write is never blocked by an email failure — the
   * user is genuinely pending, Paul can still flip them via direct DB
   * if the email path is broken. But the result is now visible to the
   * caller so we can surface it.
   */
  approvalEmail?: { recipient: string; result: 'sent' | 'failed' | 'skipped'; error?: string }
}

export async function provisionFoundingEmployer({
  admin,
  userId,
  email,
  companyName,
  contactName,
  metadataClass,
  siteUrl,
  attribution,
}: {
  admin: SupabaseClient
  userId: string
  email: string | undefined
  companyName: string
  contactName: string
  metadataClass: EmailClass | undefined
  siteUrl: string
  // Signup source columns (already normalized). Empty object for organic/returning.
  attribution?: Record<string, string | null>
}): Promise<ProvisionResult> {
  const attr = attribution || {}
  if (!FREE_FOUNDING_MODE) {
    return { status: 'noop_legacy_mode', classification: 'unknown' }
  }

  // ── HAS THIS EMPLOYER ALREADY BEEN DECIDED? ────────────────────────────────
  //
  // READ BEFORE THE UPSERTS. This is the only moment the pre-existing state is
  // still visible: the upsert below writes approval_status on insert, so a
  // brand-new signup and a returning one look identical one line later.
  //
  // The obvious guard — "did settleApprovalStatus update a row?" — CANNOT WORK,
  // and it is worth saying why so nobody reaches for it later. Its WHERE clause
  // is `approval_status is null`, and it matches ZERO rows in both cases:
  //   new signup       the upsert already INSERTED approval_status='pending'
  //   returning user   the upsert is a no-op and the status is already set
  // Both answer 0. A check that returns the same value in the two states it is
  // meant to separate cannot separate them, whichever way it happens to fall.
  //
  // WHY THIS EXISTS AT ALL: the freemail branch below sent the admin review
  // email unconditionally, every time the auth callback ran. A magic link, a
  // password reset or a Google sign-in all run it — so a freemail employer
  // signing back in re-fired "please review this signup" at Paul for someone he
  // decided weeks ago. Found on 12 Aug 2026 when five such emails arrived during
  // a UI drive that signed the test employer in five times.
  //
  // ONLY THE EMAIL CHANGES. The data behaviour is untouched: the upserts still
  // use ignoreDuplicates and settleApprovalStatus still only writes over NULL.
  const { data: priorProfile } = await admin
    .from('employer_profiles')
    .select('approval_status')
    .eq('user_id', userId)
    .maybeSingle()
  const alreadyDecided = !!priorProfile && priorProfile.approval_status !== null

  // Prefer the metadata stamp (set server-side by /api/auth/employer-signup
  // so it's tamper-proof), but fall back to fresh classification for the
  // Google OAuth path where there's no signup intermediary.
  const classification: EmailClass = metadataClass || classifyEmail(email || '')

  if (classification === 'business') {
    // Approved on the spot. Write the profile (marked approved) and the
    // founding subscription row. BOTH upserts use ignoreDuplicates so a
    // returning confirmed user doesn't clobber edited fields — see
    // settleApprovalStatus below for why that alone isn't enough.
    await admin
      .from('employer_profiles')
      .upsert(
        {
          user_id: userId,
          company_name: companyName,
          contact_name: contactName,
          email: email || '',
          approval_status: 'approved',
          ...attr,
        },
        { onConflict: 'user_id', ignoreDuplicates: true },
      )
    await settleApprovalStatus(admin, userId, 'approved')

    await admin.from('employer_subscriptions').upsert(
      {
        user_id: userId,
        subscription_status: 'inactive',
        subscription_tier: 'free',
        founding_period_ends_at: calculateFoundingPeriodEnd().toISOString(),
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )

    return { status: 'approved', classification }
  }

  // freemail OR disposable-via-OAuth → pending
  await admin
    .from('employer_profiles')
    .upsert(
      {
        user_id: userId,
        company_name: companyName,
        contact_name: contactName,
        email: email || '',
        approval_status: 'pending',
        ...attr,
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
  await settleApprovalStatus(admin, userId, 'pending')

  // Approval email — result captured and returned. Email failure does
  // NOT block the founding-row/profile write: the user is genuinely
  // pending, Paul can still flip them via direct DB if the email path
  // is broken. But the result is surfaced (logged + returned) so we
  // can diagnose Resend issues without Vercel runtime logs.
  const recipient = getFoundingAdminEmail()
  let approvalEmail: { recipient: string; result: 'sent' | 'failed' | 'skipped'; error?: string } = {
    recipient,
    result: 'failed',
    error: 'unstarted',
  }

  // THE GUARD. Already decided → the review already happened, so do not ask for
  // it again. Recorded as 'skipped' rather than silently doing nothing, so the
  // caller's log distinguishes "we chose not to email" from "the email failed".
  //
  // The trade-off, stated rather than hidden: if the very first review email
  // FAILED to send, a later sign-in will not retry it. That is the correct
  // priority — one missed notification Paul can see in the result and in
  // email_log beats an unbounded repeat every time somebody signs in — but it
  // is a real edge. approval_status='pending' with no email_log row for that
  // recipient is how you would spot it.
  if (alreadyDecided) {
    console.log(`[foundingSignup] review email skipped — already ${priorProfile!.approval_status}`)
    return { status: 'pending', classification, approvalEmail: { recipient, result: 'skipped' } }
  }

  try {
    const approveToken = generateApprovalToken(userId, 'approve')
    const rejectToken = generateApprovalToken(userId, 'reject')
    const approveUrl = `${siteUrl}/api/admin/approve-founding?t=${approveToken}`
    const rejectUrl = `${siteUrl}/api/admin/approve-founding?t=${rejectToken}`

    const subject = `[Thrive] Founding-cohort review: ${companyName}`
    const html = emailLayout(subject, `
        <h1 style="margin:0 0 8px;font-size:21px;font-weight:700;color:#0f172a;">New founding-cohort signup to review</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
          A new signup arrived from a free-mail address (<strong style="color:#0f172a;">${classification}</strong>). Decide whether to admit them to the founding cohort.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 4px;font-size:14px;">
          <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;">Company</td><td style="padding:7px 0;color:#0f172a;font-weight:600;">${escapeHtml(companyName)}</td></tr>
          <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;">Contact</td><td style="padding:7px 0;color:#334155;">${escapeHtml(contactName)}</td></tr>
          <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;">Email</td><td style="padding:7px 0;color:#334155;">${escapeHtml(email || '')}</td></tr>
          <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;">Classification</td><td style="padding:7px 0;color:#334155;">${classification}</td></tr>
          <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;vertical-align:top;">User ID</td><td style="padding:7px 0;color:#334155;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all;">${userId}</td></tr>
        </table>
        ${ctaButton('Approve &amp; admit to cohort', approveUrl)}
        <p style="margin:0 0 24px;font-size:14px;">
          <a href="${rejectUrl}" style="display:inline-block;padding:11px 22px;border:1px solid #e2e8f0;border-radius:9px;color:#b91c1c;font-weight:600;text-decoration:none;">Reject this signup</a>
        </p>
        <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
          Approve consumes one of the founding spots. Reject locks the account out of founding entitlement. Both links are signed with HMAC, expire in 7&nbsp;days, and are single-use (enforced by approval_status).
        </p>
    `)
    const sendResult = await sendEmail(recipient, subject, html, 'noreply@thrivecareer.co.uk', undefined, { emailType: 'founding_signup' })
    if (sendResult.success) {
      approvalEmail = { recipient, result: 'sent' }
      console.log('[foundingSignup] approval email sent', { recipient, userId })
    } else {
      approvalEmail = { recipient, result: 'failed', error: sendResult.error }
      console.error('[foundingSignup] approval email FAILED', { recipient, userId, error: sendResult.error })
    }
  } catch (err: any) {
    // Thrown errors here are typically generateApprovalToken (missing/short
    // FOUNDING_APPROVAL_SECRET) — log with full detail.
    approvalEmail = { recipient, result: 'failed', error: err?.message || 'unknown error' }
    console.error('[foundingSignup] approval email threw', { recipient, userId, error: err?.message, stack: err?.stack?.slice(0, 300) })
  }

  return { status: 'pending', classification, approvalEmail }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
