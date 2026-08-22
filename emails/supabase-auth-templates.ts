/**
 * Paste-ready branded HTML for the Supabase Auth email templates.
 *
 * These are NOT sent by application code — Supabase Auth sends them directly
 * using its own Go-template variables ({{ .ConfirmationURL }} etc). This file
 * is reference source only: nothing imports it at runtime. To apply, copy the
 * relevant string into Supabase Dashboard → Authentication → Email Templates
 * (see HANDOVER / the email-branding report for exact paste steps).
 *
 * The shell is a literal mirror of emails/layout.ts emailLayout(): same light
 * card, yellow T-mark + dark "Thrive" wordmark header, single yellow CTA, and
 * "The Thrive Team" footer — but with absolute https URLs (email clients can't
 * resolve relative paths) and Supabase template variables left intact.
 */

const SITE = 'https://thrivecareer.co.uk'

/** Literal mirror of emailLayout() — used only to build the auth templates below. */
function authShell(opts: {
  preheader: string
  heading: string
  bodyHtml: string
  ctaText: string
  ctaVar: string // a Supabase variable expression, e.g. '{{ .ConfirmationURL }}'
  footnoteHtml: string
}): string {
  const { preheader, heading, bodyHtml, ctaText, ctaVar, footnoteHtml } = opts
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Thrive</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e8eaed;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #eef0f3;">
              <a href="${SITE}" style="text-decoration:none;">
                <img src="${SITE}/logo/thrive-mark-192.png" alt="Thrive" width="34" height="34" style="display:inline-block;vertical-align:middle;border:0;border-radius:8px;" />
                <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">Thrive</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;background-color:#ffffff;text-align:center;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">${heading}</h1>
              ${bodyHtml}
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:26px auto;">
                <tr>
                  <td style="background-color:#FFE500;border-radius:9px;">
                    <a href="${ctaVar}" style="display:inline-block;padding:13px 30px;color:#0f172a;font-size:15px;font-weight:700;text-decoration:none;border-radius:9px;">${ctaText}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;line-height:1.6;">${footnoteHtml}</p>
              <p style="margin:0;font-size:12px;color:#a8b0bd;line-height:1.6;word-break:break-all;">
                Or paste this link into your browser:<br />
                <a href="${ctaVar}" style="color:#64748b;text-decoration:underline;">${ctaVar}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 28px;background-color:#fbfbfc;border-top:1px solid #eef0f3;text-align:center;">
              <p style="margin:0 0 10px;font-size:14px;color:#334155;font-weight:600;">— The Thrive Team</p>
              <p style="margin:0 0 10px;font-size:13px;color:#94a3b8;line-height:1.5;">
                Thrive · hospitality hiring made simple<br />
                <a href="${SITE}" style="color:#64748b;text-decoration:none;">thrivecareer.co.uk</a>
              </p>
              <p style="margin:0;font-size:12px;color:#a8b0bd;">&copy; 2026 Thrive</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Confirm signup — the minimum required template.
 *
 * IMPORTANT: this CTA uses the app's VERIFIED token_hash link pattern, NOT the
 * generic {{ .ConfirmationURL }}. The app's confirmation handler
 * (app/auth/confirm/route.ts → lib/authCallback.ts) consumes the OTP via
 * verifyOtp({ token_hash, type }), reading ?token_hash, ?type and ?next.
 * Do NOT swap it for {{ .ConfirmationURL }}.
 *
 * `next` IS NOW {{ .RedirectTo }} AND IT USED TO BE THE STRING "/dashboard".
 * That hardcoding is the whole reason an apply-gate sign-up never came back to
 * the job: the app computed the right return path, passed it as
 * `emailRedirectTo`, and this template threw it away and sent everyone to the
 * dashboard. `{{ .RedirectTo }}` is Supabase's own documented pattern for
 * exactly this, and it carries whatever `emailRedirectTo` was given.
 *
 * THE OLD COMMENT HERE CLAIMED THIS "was driven end-to-end on prod and
 * confirms + lands correctly". That was true about CONFIRMING and blind to
 * where it landed — the test could not tell the two apart, because landing on
 * the dashboard is exactly what a working confirmation looked like when the
 * dashboard was the only destination it could produce. Removed rather than
 * softened: a claim of end-to-end proof is worth nothing if it names the half
 * that could not fail.
 *
 * {{ .RedirectTo }} arrives as an ABSOLUTE url. lib/safeRedirect.ts's
 * safeReturnPath is what accepts it — same-origin only, then straight into
 * the unchanged safeInternalPath.
 *
 * ⚠️ NOTHING IN THIS REPO SENDS THIS EMAIL OR CHECKS THIS STRING. It is
 * reference source for a value pasted into the Supabase dashboard. tsc cannot
 * see it, the build cannot see it, verify cannot see it. If you change one,
 * change both, and drive a real sign-up afterwards — reading the link out of
 * a real inbox is the only check that exists.
 */
export const CONFIRM_SIGNUP_LINK =
  '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}'

export const confirmSignupTemplate = authShell({
  preheader: 'Confirm your email to finish setting up your Thrive account.',
  heading: 'Confirm your email',
  bodyHtml: `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">Welcome to Thrive! Confirm this email address to activate your account and get started.</p>`,
  ctaText: 'Confirm email address',
  ctaVar: CONFIRM_SIGNUP_LINK,
  footnoteHtml: 'This link expires in 24 hours. If you didn\'t create a Thrive account, you can safely ignore this email.',
})

/** Magic Link — only if passwordless sign-in is enabled. */
export const magicLinkTemplate = authShell({
  preheader: 'Your secure sign-in link for Thrive.',
  heading: 'Sign in to Thrive',
  bodyHtml: `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">Click the button below to securely sign in to your Thrive account. No password needed.</p>`,
  ctaText: 'Sign in to Thrive',
  ctaVar: '{{ .ConfirmationURL }}',
  footnoteHtml: 'This link expires shortly and can only be used once. If you didn\'t request it, you can safely ignore this email.',
})

/**
 * Reset Password.
 *
 * Uses the same VERIFIED token_hash pattern as CONFIRM_SIGNUP_LINK above, and
 * for the same reason — which the signup template learned and this one did not.
 *
 * {{ .ConfirmationURL }} sends the user through Supabase's /auth/v1/verify, which
 * redirects back carrying a PKCE code that must be exchanged CLIENT-side using a
 * verifier stored when the reset was requested. That breaks whenever the link is
 * opened anywhere other than the browser that asked for it — a different device,
 * a webmail preview, a corporate mail scanner that prefetches links. On 27 Jul an
 * employer was locked out by exactly this.
 *
 * token_hash instead goes to /auth/confirm, which verifies SERVER-side via
 * verifyOtp({ token_hash, type }) and writes the session cookie itself. No
 * verifier, no device dependency, and it is excluded from middleware so nothing
 * races the single-use token. &next=/reset-password lands the user on the
 * set-a-new-password form already signed in.
 */
export const RESET_PASSWORD_LINK =
  '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password'

export const resetPasswordTemplate = authShell({
  preheader: 'Reset your Thrive password.',
  heading: 'Reset your password',
  bodyHtml: `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">We received a request to reset the password for your Thrive account. Click below to choose a new one.</p>`,
  ctaText: 'Reset password',
  ctaVar: RESET_PASSWORD_LINK,
  footnoteHtml: 'This link expires in 1 hour and can only be used once. If you didn\'t request a password reset, you can safely ignore this email — your password won\'t change.',
})

/** Change Email Address — confirm the new address. */
export const changeEmailTemplate = authShell({
  preheader: 'Confirm your new email address for Thrive.',
  heading: 'Confirm your new email',
  bodyHtml: `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">Confirm this is the new email address you'd like to use for your Thrive account.</p>`,
  ctaText: 'Confirm email change',
  ctaVar: '{{ .ConfirmationURL }}',
  footnoteHtml: 'If you didn\'t request this change, you can safely ignore this email and your address will stay the same.',
})

export const supabaseAuthTemplates: Record<string, string> = {
  'confirm-signup': confirmSignupTemplate,
  'magic-link': magicLinkTemplate,
  'reset-password': resetPasswordTemplate,
  'change-email': changeEmailTemplate,
}
