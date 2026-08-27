import { emailLayout, ctaButton, BASE_URL } from './layout'

export function candidateWelcomeEmail(candidateName: string): { subject: string; html: string } {
  const firstName = candidateName.split(' ')[0] || 'there'
  const subject = `Welcome to Thrive, ${firstName} — let's find your next role`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Welcome to Thrive, ${firstName}!</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Your account's ready. Add a job title and the areas you'd work in, and we'll start matching you to roles. Here's how to get the most out of Thrive:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;width:28px;height:28px;background:#0f172a;border-radius:50%;text-align:center;line-height:28px;font-weight:700;color:#ffffff;font-size:14px;margin-right:12px;vertical-align:middle;">1</span>
          <span style="font-size:15px;color:#334155;vertical-align:middle;"><strong>Browse jobs</strong> — search by sector, location and salary across all UK industries</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;width:28px;height:28px;background:#0f172a;border-radius:50%;text-align:center;line-height:28px;font-weight:700;color:#ffffff;font-size:14px;margin-right:12px;vertical-align:middle;">2</span>
          <span style="font-size:15px;color:#334155;vertical-align:middle;"><strong>Complete your profile</strong> — add skills, experience and a CV to stand out</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;">
          <span style="display:inline-block;width:28px;height:28px;background:#0f172a;border-radius:50%;text-align:center;line-height:28px;font-weight:700;color:#ffffff;font-size:14px;margin-right:12px;vertical-align:middle;">3</span>
          <span style="font-size:15px;color:#334155;vertical-align:middle;"><strong>Apply with one click</strong> — track every application from your dashboard</span>
        </td>
      </tr>
    </table>
    ${ctaButton('Browse Jobs', `${BASE_URL}/jobs`)}
    <p style="margin:16px 0 0;font-size:14px;color:#94a3b8;">
      Thrive is 100% free for job seekers — always.
    </p>
  `)

  return { subject, html }
}
