import { emailLayout, ctaButton, BASE_URL } from './layout'
import { applicationsPhrase, type ActivationContext, type ActivationEmail } from './activation-context'

/**
 * Day 7 — the founder check-in, and the model for the rest of the set.
 *
 * The old day 7 was the best of the original five, because it handled BOTH the
 * busy week and the quiet one honestly rather than assuming activity. That
 * structure is kept; what is added is that it now knows which case it is in
 * instead of hedging across all of them.
 *
 * Signs off as Paul in the body. The shared layout already ends every email
 * "— The Thrive Team", so there is no second signature block; the old version
 * had both.
 */
export function activationDay7Email(ctx: ActivationContext): ActivationEmail {
  // A. applications have come in
  if (ctx.applicationCount > 0) {
    const subject = `How's it going, ${ctx.companyName}?`
    return {
      subject,
      preheader: `A week in — and ${applicationsPhrase(ctx.applicationCount)} so far.`,
      html: emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">A week in, ${ctx.companyName}</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          It's Paul. You've had <strong style="color:#0f172a;">${applicationsPhrase(ctx.applicationCount)}</strong> come in &mdash; a good start.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          The only thing I'd nudge you on is speed. Hospitality moves quickly and the strongest
          candidates are usually mid-conversation with someone else. Even a short
          &ldquo;thanks, we'll come back to you Friday&rdquo; keeps people warm.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          How's it actually going? Hit reply &mdash; it comes to us and I read them.
        </p>
        ${ctaButton('View your applicants', `${BASE_URL}/employer/dashboard`)}
      `, `A week in — and ${applicationsPhrase(ctx.applicationCount)} so far.`),
    }
  }

  // B. posted, but nothing yet
  if (ctx.hasPostedJob) {
    const subject = "A quiet first week — that's normal"
    return {
      subject,
      preheader: "What to change if it's still quiet next week.",
      html: emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">A quiet first week, ${ctx.companyName}</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          It's Paul. Nothing has come in yet. That's more common than you'd think in the first week,
          and it usually isn't the advert.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          The thing that tends to shift it is going to candidates rather than waiting for them &mdash;
          you can search by role and area and message people directly. If it's still quiet next week,
          reply to this and tell me the role. I'll look at it myself.
        </p>
        ${ctaButton('Browse candidates', `${BASE_URL}/candidates`)}
      `, "What to change if it's still quiet next week."),
    }
  }

  // C. never posted
  const subject = 'Anything stopping you posting?'
  return {
    subject,
    preheader: "Genuine question — I'd like to know what's in the way.",
    html: emailLayout(subject, `
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">A week in, ${ctx.companyName}</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        It's Paul. You signed up a week ago and haven't posted a role yet, which is useful for me
        to know.
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        If something's in the way &mdash; the form, the wording, or you're simply not hiring right
        now &mdash; hit reply and tell me. I'd rather fix it than send you another email about it.
      </p>
      ${ctaButton('Post a job', `${BASE_URL}/post-job`)}
    `, "Genuine question — I'd like to know what's in the way."),
  }
}
