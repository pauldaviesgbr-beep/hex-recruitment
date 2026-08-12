import { emailLayout, ctaButton, BASE_URL } from './layout'
import { foundingPhraseFormal } from '@/lib/trialUtils'
import type { ActivationContext, ActivationEmail } from './activation-context'

/**
 * Day 1 — get the first job posted.
 *
 * THE FOUNDING OFFER BELONGS HERE. An earlier draft of this rewrite stripped
 * ALL money language, which over-corrected: "12 months free, no card needed"
 * for the first 100 employers is the ONE permitted claim, it is an offer being
 * honoured rather than a price, and it cannot age badly. "Your account is live"
 * is true and says nothing. The phrase comes from foundingPhraseFormal() so it
 * can never drift from FOUNDING_PERIOD_MONTHS.
 */
export function activationDay1Email(ctx: ActivationContext): ActivationEmail {
  const first = ctx.companyName

  if (!ctx.hasPostedJob) {
    const subject = 'Your first job takes about three minutes'
    return {
      subject,
      preheader: 'Job title, pay, and what the shift actually involves.',
      html: emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">You're in, ${first}</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          You're one of our founding employers, which means <strong style="color:#0f172a;">${foundingPhraseFormal()}</strong>.
          The only thing between you and your first applicants is one advert.
        </p>
        <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">Three minutes:</p>
        <ol style="margin:0 0 20px;padding-left:20px;font-size:15px;color:#475569;line-height:1.9;">
          <li>The role and the pay</li>
          <li>What the shift actually involves</li>
          <li>Publish</li>
        </ol>
        <p style="margin:0 0 8px;font-size:15px;color:#475569;line-height:1.6;">
          Be specific about hours. Hospitality candidates scan fast and skip anything vague &mdash;
          &ldquo;some evenings&rdquo; loses people that &ldquo;Thurs&ndash;Sun, 5pm&ndash;close&rdquo; keeps.
        </p>
        ${ctaButton('Post your first job', `${BASE_URL}/post-job`)}
        <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;text-align:center;">
          It's on the board the moment you publish.
        </p>
      `, 'Job title, pay, and what the shift actually involves.'),
    }
  }

  const subject = 'Your job is live — here’s what happens next'
  return {
    subject,
    preheader: 'What to expect in the first few days, and the one thing you control.',
    html: emailLayout(subject, `
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">You're up and running, ${first}</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        Your advert is on the board and candidates can apply from now on. You're a founding
        employer, so that's <strong style="color:#0f172a;">${foundingPhraseFormal()}</strong>.
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        Two things worth knowing early. Applications tend to arrive in bursts rather than a steady
        trickle, so a quiet first day means very little. And the biggest thing you control is how
        fast you reply &mdash; good hospitality staff are usually talking to more than one employer.
      </p>
      ${ctaButton('View your dashboard', `${BASE_URL}/employer/dashboard`)}
    `, 'What to expect in the first few days, and the one thing you control.'),
  }
}
