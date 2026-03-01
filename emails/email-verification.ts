import { emailLayout, ctaButton } from './layout'

export function emailVerificationEmail(verifyUrl: string): { subject: string; html: string } {
  const subject = 'Verify your email for Hex'

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Verify Your Email</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Thanks for signing up for Hex! Please confirm your email address by clicking the button below.
    </p>
    ${ctaButton('Verify Email', verifyUrl)}
    <p style="margin:0 0 8px;font-size:14px;color:#94a3b8;">
      This link expires in <strong>24 hours</strong>.
    </p>
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      If you didn't create an account on Hex, you can safely ignore this email.
    </p>
  `)

  return { subject, html }
}
