// THE SENTENCE A PERSON SEES WHEN THE FIXTURE GUARD REFUSES AN APPLICATION.
//
// The RULE lives in the database — `fixture_application_refusal()`, called by a
// BEFORE INSERT trigger on `job_applications`. It has to live there because the
// application write is client-side: both call sites insert straight into
// Postgres from the browser, so there is no server route in the path.
//
// This file is NOT a second copy of the rule. It decides nothing. It exists so
// that the two call sites share one sentence rather than writing their own, and
// so that the raw server string never reaches a person — on 26 March 2026 an
// API's word, "Unauthorized", was alerted verbatim to whoever tapped AI Assist,
// and it stayed there for five months.

/** The marker the trigger raises. Matched on, never displayed. */
export const FIXTURE_GUARD_MARKER = 'THRIVE_FIXTURE_GUARD'

/**
 * What the person reads. It names BOTH halves — which account they are on and
 * what the advert is — because the operator who hit this twice knew the rule
 * perfectly well and still could not see, at the moment of tapping Apply, which
 * of the two facts was the problem.
 */
export const FIXTURE_GUARD_MESSAGE =
  'Not sent — this is a test account, and that advert belongs to a real employer. ' +
  'Test applications are only allowed against Thrive’s own demo adverts.'

/** Did this error come from the guard? Shape-tolerant: callers hold varied types. */
export function isFixtureGuardError(err: unknown): boolean {
  if (!err) return false
  const m = (err as { message?: unknown }).message
  return typeof m === 'string' && m.includes(FIXTURE_GUARD_MARKER)
}
