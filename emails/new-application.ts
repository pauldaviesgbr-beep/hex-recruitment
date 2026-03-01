import { emailLayout, ctaButton, BASE_URL } from './layout'

export function newApplicationEmail(
  candidateName: string,
  jobTitle: string,
  company: string
): { subject: string; html: string } {
  const subject = `New application for ${jobTitle}`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">New Application Received</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      <strong>${candidateName}</strong> has applied for the <strong>${jobTitle}</strong> position at ${company}.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;background:#f8fafc;border-radius:8px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Candidate</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1e293b;">${candidateName}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Position</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${jobTitle}</p>
        </td>
      </tr>
    </table>
    ${ctaButton('View Application', `${BASE_URL}/my-jobs`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      Review their profile and CV to decide your next steps.
    </p>
  `)

  return { subject, html }
}
