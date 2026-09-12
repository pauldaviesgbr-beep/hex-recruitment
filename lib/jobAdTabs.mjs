// WHICH TAB AN ADVERT BELONGS TO — one definition, two consumers.
//
// THIS IS A .mjs FILE ON PURPOSE, AND THAT IS THE WHOLE REASON IT EXISTS.
// app/my-jobs/page.tsx renders the tabs; scripts/drive-my-jobs-controls.mjs
// asserts that the rendered tabs partition the adverts. The drive has to know
// the rule to compute what it EXPECTS — and a Playwright script cannot import
// a .tsx module, so the obvious thing is to write the rule out again in the
// drive.
//
// THAT IS THE FAULT THIS REPO KEEPS RECORDING. "A measurement of a rule must
// import the rule": a SQL query once reimplemented nameMatchKey to count how
// many candidates it could not key, answered 6, and the true answer was 12 —
// written in the same hour as an instruction saying not to reimplement rules,
// because a read-only one-liner for a number in a report does not feel like a
// place where duplication happens. A drive's expected-value calculation is
// exactly that kind of place.
//
// AND IT HAD ALREADY DRIFTED. The first version of this branch put `closed`
// under Live in the page and under Live in the drive, then moved it to
// Archived in the page only. Two copies, one commit apart, and nothing in
// either file could have disagreed with the other — the drive would have gone
// red about a page that was right, or worse, stayed green while both were
// wrong together.
//
// Plain JS with no types so both sides can load it as-is; `allowJs` is on, so
// TypeScript reads it happily and infers the return.

/**
 * @param {'active'|'paused'|'closed'|'filled'|'archived'} status
 * @returns {'live'|'filled'|'archived'}
 *
 * TOTAL OVER STATUS, which is what makes the three tabs a partition: every
 * advert lands on exactly one, so the counts sum to the total and nothing can
 * appear twice or vanish.
 *
 * PAUSED IS LIVE; CLOSED IS NOT. The difference is who stopped it and whether
 * they mean to start it again. `closed` is where the mapper sends `expired`,
 * which the daily job-expiry cron writes at 60 days — a finished advert, and
 * filing it under a tab labelled "Live" would be a label contradicting its own
 * tab.
 */
export const tabOf = (status) =>
  status === 'archived' || status === 'closed' ? 'archived'
    : status === 'filled' ? 'filled'
    : 'live'

/** The tabs, in order, and the only three there are. */
export const JOB_AD_TABS = ['live', 'filled', 'archived']
