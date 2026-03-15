import { emailLayout, ctaButton, BASE_URL } from './layout'

export function interviewRescheduledEmail(
  companyName: string,
  jobTitle: string,
  candidateName: string,
  newDate: string,
  newTime: string,
  interviewType: string,
): { subject: string; html: string } {
  const subject = `Your interview has been rescheduled — ${jobTitle} at ${companyName}`
  const firstName = candidateName.split(' ')[0]

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Interview Rescheduled</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Hi ${firstName}, your previous interview for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong> has been cancelled and replaced with a new time.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;background:#f8fafc;border-radius:8px;border-left:4px solid #FFE500;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;">New Interview Details</p>
          <p style="margin:8px 0 8px;font-size:14px;color:#64748b;">Company</p>
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1e293b;">${companyName}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Position</p>
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1e293b;">${jobTitle}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Date</p>
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1e293b;">${newDate}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Time</p>
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1e293b;">${newTime}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Type</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${interviewType}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      If you have any questions, please contact ${companyName} directly via your Hex messages inbox.
    </p>
    ${ctaButton('View on Hex', `${BASE_URL}/applications`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      Good luck with your interview!
    </p>
  `)

  return { subject, html }
}
