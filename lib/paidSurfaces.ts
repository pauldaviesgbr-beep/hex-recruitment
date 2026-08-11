/**
 * THE ONE SWITCH for everything that shows or takes money.
 *
 * Thrive publishes no price, no monthly rate and no trial length. The product
 * was doing all three — £99/month and a 91-day trial on /dashboard/subscription,
 * six boost prices in the boost modals — while the stated position was that the
 * tier structure is undecided. This turns those surfaces off at one point.
 *
 * HIDE, NOT DELETE. lib/stripe.ts, the checkout routes, the boost modals and
 * every price constant are untouched and still compile. Flipping this to true
 * brings all of it back exactly as it was. A pricing decision should cost a
 * boolean, not a rebuild.
 *
 * ── WHY A CONSTANT AND NOT AN ENVIRONMENT VARIABLE ──
 *
 * The brief was: pick the one that cannot be flipped on accidentally. That is
 * this one, and the reasoning is the same as the flip cron's own comment about
 * vercel.json — "a line in vercel.json is not a typo; it is committed, reviewed
 * and dated".
 *
 * An env var can be set in a dashboard by anyone with project access, with no
 * diff, no review, and no record in the repo. Worse, Vercel env vars are scoped
 * per ENVIRONMENT: someone setting it once to try something in Preview can
 * leave Production carrying it, and nothing in the codebase would show that the
 * prices are live. The failure mode is silent and invisible from the source.
 *
 * Turning this on requires editing this file, which means a commit, a diff, a
 * reviewer and a date. That is exactly the friction this deserves — and if the
 * prices ever DO go live, we will want to know precisely when and by whose
 * hand, because the founding cohort were told something different.
 *
 * The cost is that flipping it needs a deploy. For a decision that is months
 * away and taken once, that is the right trade.
 */
export const PAID_SURFACES_ENABLED = false

/**
 * The single line every gated route and page shows instead. One string so the
 * wording cannot drift between the six places that say it, and so a future
 * change of position is a one-line edit rather than a hunt.
 */
export const BILLING_NOT_LIVE_MESSAGE =
  'Billing is not live yet. Your account has full access while we build — there is nothing to pay and nothing to set up.'
