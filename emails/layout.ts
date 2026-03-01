const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://hexrecruitment.co.uk'

export function emailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
              <span style="font-size:28px;font-weight:800;color:#FFE500;letter-spacing:2px;">HEX</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 32px;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">
                <a href="${BASE_URL}/settings/notifications" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>
                &nbsp;&middot;&nbsp;
                <a href="${BASE_URL}/privacy-policy" style="color:#64748b;text-decoration:underline;">Privacy Policy</a>
              </p>
              <p style="margin:0;font-size:12px;color:#94a3b8;">&copy; 2026 Hex. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#FFE500;border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:14px 28px;color:#1e293b;font-size:15px;font-weight:600;text-decoration:none;">
        ${text}
      </a>
    </td>
  </tr>
</table>`
}

export { BASE_URL }
