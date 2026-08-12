import { emailLayout, ctaButton, BASE_URL } from './layout'
import type { ActivationContext, ActivationEmail } from './activation-context'

/**
 * Day 3 — the practical nudge.
 *
 * THE OLD VERSION TOLD HOSPITALITY EMPLOYERS TO GO REMOTE OR HYBRID. It was tip
 * two of three: "offering remote or hybrid opens up a much bigger talent pool".
 * Every live role on this board is in-person work in a kitchen or a venue. That
 * tip is gone and is not coming back.
 */
export function activationDay3Email(ctx: ActivationContext): ActivationEmail {
  if (!ctx.hasPostedJob) {
    const subject = 'Still thinking about what to post?'
    return {
      subject,
      preheader: "You don't need the perfect advert. You need a live one.",
      html: emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">No advert yet, ${ctx.companyName}?</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          If you're stuck on the wording, don't be. You can edit an advert after it's live, and a
          plain specific one beats a polished one that never goes up.
        </p>
        <p style="margin:0 0 8px;font-size:15px;color:#475569;line-height:1.6;">
          The three things hospitality candidates actually look for:
        </p>
        <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;color:#475569;line-height:1.8;">
          <li><strong style="color:#0f172a;">The hours.</strong> Split shifts, weekends, late finishes &mdash; say so. The people who are fine with it apply, and the ones who aren't would have dropped out at interview anyway.</li>
          <li><strong style="color:#0f172a;">The pay.</strong> It's the first thing they filter on.</li>
          <li><strong style="color:#0f172a;">Where it is.</strong> The area, not just the city.</li>
        </ul>
        ${ctaButton('Post a job', `${BASE_URL}/post-job`)}
      `, "You don't need the perfect advert. You need a live one."),
    }
  }

  const subject = "Don't wait for applications to come to you"
  return {
    subject,
    preheader: 'You can search candidates directly and message them first.',
    html: emailLayout(subject, `
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Two ways to fill it faster, ${ctx.companyName}</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        Your advert is doing its job in the background. These two tend to move quicker:
      </p>
      <ol style="margin:0 0 20px;padding-left:20px;font-size:15px;color:#475569;line-height:1.8;">
        <li><strong style="color:#0f172a;">Search candidates directly.</strong> Browse by role, area and availability, and message someone before they've applied anywhere.</li>
        <li><strong style="color:#0f172a;">Reply the same day.</strong> Candidates rarely wait. The employer who answers first is very often the one who hires.</li>
      </ol>
      ${ctaButton('Browse candidates', `${BASE_URL}/candidates`)}
    `, 'You can search candidates directly and message them first.'),
  }
}
