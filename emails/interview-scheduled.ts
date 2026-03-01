import { emailLayout, ctaButton, BASE_URL } from './layout'

export function interviewScheduledEmail(
  companyName: string,
  jobTitle: string,
  date: string,
  time: string,
  notes?: string
): { subject: string; html: string } {
  const subject = `Interview scheduled with ${companyName}`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Interview Scheduled</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      You have an upcoming interview for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;background:#f8fafc;border-radius:8px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Company</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1e293b;">${companyName}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Position</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1e293b;">${jobTitle}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Date</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1e293b;">${date}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Time</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${time}</p>
        </td>
      </tr>
    </table>
    ${notes ? `
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#334155;">Notes from the employer</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;background:#f8fafc;padding:12px 16px;border-radius:8px;border-left:3px solid #FFE500;">
      ${notes}
    </p>
    ` : ''}
    ${ctaButton('View Messages', `${BASE_URL}/messages`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      Good luck with your interview!
    </p>
  `)

  return { subject, html }
}
