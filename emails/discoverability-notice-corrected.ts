import { emailLayout, ctaButton, BASE_URL } from './layout'

/**
 * The correction to the 26 July notice.
 *
 * A SEPARATE TEMPLATE RATHER THAN A VARIANT OF THE FIRST ONE. The original is
 * the record of what we told nine people on 26 July; teaching it to render a
 * second version risks changing what that record would say if anyone
 * re-rendered it. The furniture — layout, CTA, base URL — is shared, so what
 * is duplicated here is only the sentences that differ.
 *
 * One apology, plain, early, not repeated. The people receiving this are
 * hospitality workers who want to know what happened and what to do, not a
 * paragraph of contrition.
 *
 * The "What an employer would see" block is VERBATIM from the first email —
 * it was the most useful part of it, and someone reading this may not remember
 * the original.
 *
 * ── "26 JULY" AND "9 AUGUST" ARE LITERALS, NOT VALUES READ FROM THE ROW ──
 *
 * They are correct for the eight this template exists to email — notifiedAt
 * 26 July, deadlineAt 9 August — and correct for nobody else. They were
 * already wrong for the test row, which was notified on 5 August and received
 * this email saying it had been written to in July.
 *
 * SO IT CANNOT BE REUSED FOR A FUTURE CORRECTION WITHOUT EDITING IT. Anyone
 * reaching for it later must change these two dates or lift them into `opts`.
 * The failure mode if that is missed is the quiet kind: a correctly-addressed
 * email telling somebody a history that is not theirs, with nothing in the
 * send report to show for it.
 *
 * Only the NEW deadline is dynamic — `opts.deadlineText`, three times.
 *
 * A COMMENT HERE RATHER THAN AN HTML ONE BESIDE THE SENTENCE: everything
 * inside the template string is shipped to the recipient, and a note about our
 * own defect does not belong in their email.
 */
export function discoverabilityNoticeCorrectedEmail(opts: {
  candidateName: string | null
  deadlineText: string
  stayHiddenUrl: string
}): { subject: string; html: string } {
  const firstName = (opts.candidateName || '').split(' ')[0] || 'there'
  const subject = 'About that last email — your Thrive profile'

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">About that last email, ${firstName}</h1>

    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      On 26 July we emailed to say your Thrive profile would become visible to employers
      on 9 August, and that one click would keep it hidden.
    </p>

    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      <strong style="color:#1e293b;">That link didn't work.</strong> If you clicked it, nothing
      happened — and it may even have told you the link had expired. It hadn't. That was our
      mistake, not anything you did.
    </p>

    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
      It works now, and we've moved the date to
      <strong style="color:#1e293b;">${opts.deadlineText}</strong> so you get the fortnight you
      should have had in the first place.
    </p>

    ${ctaButton('Keep me hidden', opts.stayHiddenUrl)}

    <p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.6;text-align:center;">
      Happy to be seen? There's nothing to do — you'll start appearing on ${opts.deadlineText}.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;width:100%;background:#f8fafc;border:1px solid #e8eaed;border-radius:10px;">
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

    <p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #eef0f3;font-size:13px;color:#94a3b8;line-height:1.6;">
      You can change this whenever you like: the <strong>&ldquo;Hide my profile&rdquo;</strong> switch at the
      top of <a href="${BASE_URL}/dashboard" style="color:#64748b;">your dashboard</a> turns visibility
      off and on at any time, before or after ${opts.deadlineText}.
    </p>
  `)

  return { subject, html }
}
