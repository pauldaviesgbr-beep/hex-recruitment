/**
 * What the activation sequence knows about an employer when it writes to them.
 *
 * WHY THIS EXISTS. The old five templates took a company name and nothing else,
 * which is why day 30 asked "how did we do?" of employers who never posted a
 * job. Every template now branches on real state, and the branch is decided
 * from these fields rather than from a guess.
 *
 * unactionedCount IS DERIVED FROM status, NOT viewed_at — and NOT because
 * viewed_at is dead. It is written: app/my-jobs/[jobId]/applications/page.tsx
 * auto-stamps it the moment the page loads, and the employer dashboard already
 * reads it as an "unopened" count. It is written on 2 of 38 rows today.
 *
 * The two columns answer DIFFERENT QUESTIONS and the difference is the whole
 * point of the day-14 email. viewed_at says the applications page was opened,
 * which the page does on the employer's behalf and which a glance satisfies.
 * status says whether the employer actually moved the candidate anywhere. An
 * application that has been "viewed" and left at 'pending' is exactly the
 * candidate day 14 exists to rescue, and counting by viewed_at would hide them.
 *
 * And note the wording that follows: "waiting", not "unopened". "Unopened"
 * would be a claim about viewed_at, which is not what we are counting.
 */
export interface ActivationContext {
  companyName: string
  /** Any job ever posted, at any status. */
  hasPostedJob: boolean
  /** Applications across all their jobs. */
  applicationCount: number
  /** Of those, still at status 'pending' — nobody has moved them anywhere. */
  unactionedCount: number
  /** At least one application at status 'hired' — NOT jobs.status = 'filled'. */
  hasHired: boolean
  /** Their most recently posted role's title, for naming it back to them. */
  roleTitle?: string | null
  /**
   * The place from that role — jobs.location, printed verbatim. Usually a town
   * ("Bath", "Reading") and sometimes a county ("West Sussex"); both read
   * correctly in "your Head Chef in ___", which is all it is used for.
   */
  roleTown?: string | null
}

/**
 * The address every "reply to this" line points at.
 *
 * support@ is what /terms and the chatbot tell the public to use. hello@ is the
 * default in lib/email.ts and appears nowhere else in the repo — WHETHER IT IS
 * MONITORED IS UNVERIFIED, which is why these emails do not use it: three of
 * them say "hit reply and I read them", and that promise has to land somewhere
 * real. If hello@ is the live mailbox, change this one constant.
 */
export const REPLY_TO = 'support@thrivecareer.co.uk'

/** "3 applications" / "1 application" — used in several templates. */
export function applicationsPhrase(n: number): string {
  return n === 1 ? '1 application' : `${n} applications`
}

/** A template returning null means SEND NOTHING for this state. */
export type ActivationEmail = { subject: string; html: string; preheader?: string } | null
