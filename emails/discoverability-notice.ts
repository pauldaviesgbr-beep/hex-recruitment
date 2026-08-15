import { emailLayout, ctaButton, BASE_URL } from './layout'

/**
 * The notice that precedes the flip. Its whole job is to make the opt-out as
 * easy as doing nothing, so the copy leads with the change and the date, not
 * with a pitch.
 *
 * The single yellow CTA is deliberately spent on "Keep me hidden" rather than
 * on anything that benefits us — the prominent button should be the one the
 * candidate might otherwise not find.
 */
export function discoverabilityNoticeEmail(opts: {
  candidateName: string | null
  deadlineText: string
  stayHiddenUrl: string
}): { subject: string; html: string } {
  const firstName = (opts.candidateName || '').split(' ')[0] || 'there'
  const subject = `Your Thrive profile will become visible to employers on ${opts.deadlineText}`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">A change to your profile, ${firstName}</h1>

    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Thrive profiles are becoming visible to employers by default, so they can approach you
      about roles instead of waiting for you to apply. Yours is currently hidden.
    </p>

    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
      <strong style="color:#1e293b;">If you do nothing, your profile becomes visible on ${opts.deadlineText}.</strong>
      If you'd rather stay hidden, one click below and we'll leave it exactly as it is — no
      reason needed, no account login.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;width:100%;background:#f8fafc;border:1px solid #e8eaed;border-radius:10px;">
      <tr>
        <td style="padding:18px 20px;">
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.4px;">What an employer would see</p>
          <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">
            Your name, job title, location, and anything you've added to your profile —
            experience, skills and your CV if you've uploaded one.<br />
            They can then contact you about a role.
          </p>
          <p style="margin:12px 0 0;font-size:14px;color:#475569;line-height:1.7;">
            Only employers hiring on Thrive can see it. It is not a public web page, and
            your email address and phone number are never shown in search.
          </p>
        </td>
      </tr>
    </table>

    ${ctaButton('Keep me hidden', opts.stayHiddenUrl)}

    <p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.6;text-align:center;">
      Happy to be seen? There's nothing to do — you'll start appearing on ${opts.deadlineText}.
    </p>

    <p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #eef0f3;font-size:13px;color:#94a3b8;line-height:1.6;">
      You can change this whenever you like: the <strong>visibility switch</strong> at the
      top of <a href="${BASE_URL}/dashboard" style="color:#64748b;">your dashboard</a> turns visibility
      off and on at any time, before or after ${opts.deadlineText}.
    </p>
  `)

  return { subject, html }
}
