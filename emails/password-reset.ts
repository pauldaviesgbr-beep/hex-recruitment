import { emailLayout, ctaButton } from './layout'

export function passwordResetEmail(resetUrl: string): { subject: string; html: string } {
  const subject = 'Reset your Hex password'

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Reset Your Password</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      We received a request to reset your password. Click the button below to choose a new one.
    </p>
    ${ctaButton('Reset Password', resetUrl)}
    <p style="margin:0 0 8px;font-size:14px;color:#94a3b8;">
      This link expires in <strong>1 hour</strong>.
    </p>
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
    </p>
  `)

  return { subject, html }
}
