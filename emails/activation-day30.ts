import { emailLayout, ctaButton, BASE_URL } from './layout'
import { applicationsPhrase, type ActivationContext, type ActivationEmail } from './activation-context'

/**
 * Day 30 — the founder's honest question, in four states.
 *
 * The old one asked "have you hired anyone through Thrive yet?" of every
 * employer, including those who never posted a job. Subject line: "30 days of
 * free hiring — how did we do?" To someone who posted nothing, that is a
 * survey about an event that never happened.
 */
export function activationDay30Email(ctx: ActivationContext): ActivationEmail {
  // A. they hired
  if (ctx.hasHired) {
    const subject = 'Did Thrive work for you?'
    return {
      subject,
      preheader: "You've made a hire — I'd like to know how it actually went.",
      html: emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">A month in, ${ctx.companyName}</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          It's Paul. I can see you've made a hire through Thrive, which is exactly what this is for.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          Two things, if you have a minute. How did the process actually feel &mdash; and would you
          be willing to say so publicly? A line from a real employer is worth more to us than
          anything we can write ourselves.
        </p>
        ${ctaButton('Leave feedback', `${BASE_URL}/feedback`)}
      `, "You've made a hire — I'd like to know how it actually went."),
    }
  }

  // B. applications, no hire
  if (ctx.applicationCount > 0) {
    const subject = 'A month in — did you find anyone?'
    return {
      subject,
      preheader: "And if it stalled, I'd like to know where.",
      html: emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">A month in, ${ctx.companyName}</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          It's Paul. You've had <strong style="color:#0f172a;">${applicationsPhrase(ctx.applicationCount)}</strong>
          but I can't see a hire yet &mdash; so either it's still in progress, or something stalled.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          If it stalled, I'd genuinely like to know where: not enough of the right people, wrong
          area, pay expectations? Hit reply. It's the most useful thing you could send me.
        </p>
        ${ctaButton('Share what happened', `${BASE_URL}/feedback`)}
      `, "And if it stalled, I'd like to know where."),
    }
  }

  // C. posted, no applications. LEFT EXACTLY AS WRITTEN — Paul's line, his name
  // on it, and the best in the set. Do not soften this one.
  if (ctx.hasPostedJob) {
    const subject = "A month, and it's been quiet"
    return {
      subject,
      preheader: "That's on us as much as the advert.",
      html: emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">A month in, ${ctx.companyName}</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          It's Paul, and I'll be straight: a month with no applicants isn't good enough, and I'd
          like to know what the role was.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          Hospitality hiring is regional and some roles are much harder than others. If you tell me
          the job and the area, I'll tell you honestly whether we have the candidates for it yet
          &mdash; and if we don't, I'd rather say so.
        </p>
        ${ctaButton('Tell me what you posted', `${BASE_URL}/feedback`)}
      `, "That's on us as much as the advert."),
    }
  }

  // D. never posted. SOFTENED TO A PAUSE, NOT AN EXIT.
  //
  // The earlier draft asked "Should we keep your account open?", which invites
  // a one-word goodbye. With nine employers on the platform we are not handing
  // anyone the door. This asks the same question — are you hiring? — without
  // offering to close anything.
  const subject = 'Not hiring right now?';
  return {
    subject,
    preheader: "No pressure either way — I'd just rather know than keep guessing.",
    html: emailLayout(subject, `
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">A month in, ${ctx.companyName}</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        It's Paul. You signed up a month ago and haven't posted a role, which is completely fine
        &mdash; hiring comes in waves and this may simply not be your moment.
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        Your account stays exactly as it is, with nothing to pay, and it'll be here when you need
        it. If it would help, reply and tell me roughly when you expect to be hiring and I'll leave
        you alone until then. And if something about the site got in the way, that's the more
        useful answer &mdash; tell me and I'll fix it.
      </p>
      ${ctaButton('Post a job when you’re ready', `${BASE_URL}/post-job`)}
    `, "No pressure either way — I'd just rather know than keep guessing."),
  }
}
