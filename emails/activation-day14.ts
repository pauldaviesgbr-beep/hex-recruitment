import { emailLayout, ctaButton, BASE_URL } from './layout'
import { applicationsPhrase, type ActivationContext, type ActivationEmail } from './activation-context'

/**
 * Day 14 — what to do with what has arrived.
 *
 * ── WHY THIS TEMPLATE WAS REWRITTEN RATHER THAN DELETED ──
 *
 * The previous day 14 opened "You're 2 weeks into your 3-month free trial" and
 * promised "we'll send a reminder a few days before your trial ends". Both were
 * wrong: the trial contradicted the founding cohort's actual offer of 12 months
 * free, and the reminder it promised was an email nothing in the repo ever
 * called. A branch existed to delete this file outright; the decision instead
 * was to keep day 14 and give it an honest job.
 *
 * THE LESSON WORTH MORE THAN THAT BRANCH'S DIFF, recorded here because it would
 * otherwise be lost when the branch is deleted:
 *
 *   AN EMAIL IS THE WORST POSSIBLE CARRIER FOR A CLAIM YOU MAY NEED TO
 *   WITHDRAW. A page can be edited, a price can be hidden behind a flag, a
 *   legal clause can be rewritten. An email that has been sent is in somebody's
 *   inbox permanently and cannot be corrected, only apologised for. So the bar
 *   for putting a number, a date or a promise in one is higher than anywhere
 *   else in the product.
 *
 * Nothing in this file promises anything we do not already do.
 *
 * ── ITS NEW JOB ──
 *
 * Day 7 asks how it is going. Day 14 is about the pile that has arrived and is
 * sitting there, which is where hires are actually lost.
 *
 * "waiting", not "unopened": unactionedCount comes from status = 'pending' —
 * nobody has been moved anywhere. It deliberately is NOT viewed_at, which the
 * applications page stamps automatically on load and which a glance satisfies.
 * An application viewed and left at 'pending' is precisely who this email is
 * for, so the copy says waiting, and never claims to know what was read.
 */
export function activationDay14Email(ctx: ActivationContext): ActivationEmail {
  // A. applications have arrived — the bottleneck is what happens next
  if (ctx.applicationCount > 0) {
    const waiting = ctx.unactionedCount
    const subject = waiting > 0
      ? `${applicationsPhrase(ctx.applicationCount)}, ${waiting} still waiting`
      : "You've got applicants — the next bit is where hires are lost"

    const waitingLine = waiting > 0
      ? `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
           You've had <strong style="color:#0f172a;">${applicationsPhrase(ctx.applicationCount)}</strong>, and
           <strong style="color:#0f172a;">${waiting}</strong> ${waiting === 1 ? 'is' : 'are'} still waiting on a first response.
         </p>`
      : `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
           You've had <strong style="color:#0f172a;">${applicationsPhrase(ctx.applicationCount)}</strong> and you've
           moved every one of them along. That is genuinely unusual &mdash; most don't.
         </p>`

    return {
      subject,
      preheader: 'In hospitality the good ones are gone inside a week.',
      html: emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Two weeks in, ${ctx.companyName}</h1>
        ${waitingLine}
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          Getting applicants is the easy half. In hospitality the good ones are gone inside a week,
          and <strong style="color:#0f172a;">a quick no beats a considered reply that arrives too late</strong>.
          People talk about who bothered to come back to them.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          Everything you need is already in your dashboard: shortlist from the applicant list,
          message candidates without leaving the site, and book interviews straight into your calendar.
        </p>
        ${ctaButton('Review your applicants', `${BASE_URL}/employer/dashboard`)}
      `, 'In hospitality the good ones are gone inside a week.'),
    }
  }

  // B. posted, nothing yet — the one that changes an outcome.
  //
  // NO DIAGNOSIS, DELIBERATELY. The obvious version lists three faults — no
  // salary, an internal title, a postcode instead of a town. Measured across
  // all 247 live roles: internal titles 0, postcodes 0, missing salary 2. The
  // FORM PREVENTS them — salary columns are NOT NULL and the location comes
  // from a postcode lookup that resolves to a place name. Telling an employer
  // to fix something the form would not let them break is filler, and worse
  // than generic because it implies we looked and found it.
  //
  // So: name their role and town, say what it usually IS, and offer to look.
  if (ctx.hasPostedJob) {
    const where = ctx.roleTitle
      ? `<strong style="color:#0f172a;">${ctx.roleTitle}</strong>${ctx.roleTown ? ` in ${ctx.roleTown}` : ''}`
      : 'your role'
    const subject = ctx.roleTitle
      ? `Nothing yet on your ${ctx.roleTitle}`
      : 'Still quiet — let me look at it'

    return {
      subject,
      preheader: "Usually pay, area or timing — not the advert. Tell me and I'll be straight with you.",
      html: emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Two weeks, ${ctx.companyName}</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          It's Paul. Nothing yet on ${where}, and two weeks is long enough that I'd rather look at
          it than leave you wondering.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          When a hospitality role goes quiet it is usually pay, area or timing rather than the
          advert itself. Reply and tell me the role, and I'll tell you honestly whether we have the
          candidates for it yet &mdash;
          <strong style="color:#0f172a;">and if we don't, I'd rather say so than keep you waiting</strong>.
        </p>
        ${ctaButton('Reply and tell me the role', `mailto:support@thrivecareer.co.uk?subject=${encodeURIComponent('My role is quiet: ' + (ctx.roleTitle || ''))}`)}
      `, "Usually pay, area or timing — not the advert. Tell me and I'll be straight with you."),
    }
  }

  // C. never posted — SEND NOTHING.
  //
  // They have already had days 1, 3 and 7. A fourth unanswered email asking the
  // same thing is noise, and day 30 will pick them up if anything changes.
  return null
}
