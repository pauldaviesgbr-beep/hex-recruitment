import { emailLayout, ctaButton, BASE_URL } from './layout'

export function newMessageEmail(
  senderName: string,
  messagePreview: string
): { subject: string; html: string } {
  const subject = `New message from ${senderName} on Hex`

  // Truncate preview to 200 chars
  const preview = messagePreview.length > 200
    ? messagePreview.substring(0, 200) + '...'
    : messagePreview

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">New Message</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      You have a new message from <strong>${senderName}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;background:#f8fafc;border-radius:8px;">
      <tr>
        <td style="padding:16px;border-left:3px solid #FFE500;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1e293b;">${senderName}</p>
          <p style="margin:0;font-size:15px;color:#475569;line-height:1.6;">${preview}</p>
        </td>
      </tr>
    </table>
    ${ctaButton('Reply on Hex', `${BASE_URL}/messages`)}
  `)

  return { subject, html }
}
