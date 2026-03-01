import { emailLayout, ctaButton, BASE_URL } from './layout'

export function trialEndingEmail(
  companyName: string,
  daysLeft: number
): { subject: string; html: string } {
  const subject = `Your Hex trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Your trial is ending soon</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Hi ${companyName}, your free trial expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>. Subscribe now to keep access to:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
      <tr>
        <td style="padding:8px 0;font-size:15px;color:#334155;">
          &#10003;&nbsp;&nbsp;Posting and managing job listings
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:15px;color:#334155;">
          &#10003;&nbsp;&nbsp;Browsing and contacting candidates
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:15px;color:#334155;">
          &#10003;&nbsp;&nbsp;Messaging and interview scheduling
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:15px;color:#334155;">
          &#10003;&nbsp;&nbsp;Application management dashboard
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      Plans start from just <strong>&pound;29.99/month</strong>. Choose the plan that works for you.
    </p>
    ${ctaButton('Subscribe Now', `${BASE_URL}/dashboard/subscription`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      If you have any questions, just reply to this email.
    </p>
  `)

  return { subject, html }
}
