import { emailLayout, ctaButton, BASE_URL } from './layout'

export function welcomeEmail(companyName: string): { subject: string; html: string } {
  const subject = "Welcome to Hex — let's get you hiring"

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Welcome to Hex, ${companyName}!</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      You're all set to start finding great hospitality talent. Here's how to get started:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;width:28px;height:28px;background:#FFE500;border-radius:50%;text-align:center;line-height:28px;font-weight:700;color:#1e293b;font-size:14px;margin-right:12px;vertical-align:middle;">1</span>
          <span style="font-size:15px;color:#334155;vertical-align:middle;"><strong>Post your first job</strong> — takes less than 5 minutes</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;width:28px;height:28px;background:#FFE500;border-radius:50%;text-align:center;line-height:28px;font-weight:700;color:#1e293b;font-size:14px;margin-right:12px;vertical-align:middle;">2</span>
          <span style="font-size:15px;color:#334155;vertical-align:middle;"><strong>Browse candidates</strong> — search by sector, location and experience</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;">
          <span style="display:inline-block;width:28px;height:28px;background:#FFE500;border-radius:50%;text-align:center;line-height:28px;font-weight:700;color:#1e293b;font-size:14px;margin-right:12px;vertical-align:middle;">3</span>
          <span style="font-size:15px;color:#334155;vertical-align:middle;"><strong>Manage applications</strong> — shortlist, interview and hire from your dashboard</span>
        </td>
      </tr>
    </table>
    ${ctaButton('Go to Dashboard', `${BASE_URL}/dashboard`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      Questions? Just reply to this email — we're here to help.
    </p>
  `)

  return { subject, html }
}
