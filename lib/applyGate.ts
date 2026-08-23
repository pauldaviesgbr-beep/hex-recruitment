import { safeInternalPath } from './safeRedirect'

/**
 * Is this return path an APPLY, and if so which job?
 *
 * ONE SIGNAL, NOT TWO. The sign-up screen becomes the apply gate — role strip,
 * different heading, different button — purely because ?redirect names a job.
 * There is deliberately no second "isApplyGate" flag to fall out of step with
 * it: two pieces of state that must agree need one path that sets both, and the
 * cheapest way to have one path is to have one piece of state.
 *
 * IT GOES THROUGH safeInternalPath FIRST. This same value is threaded into the
 * OAuth `next` and into the confirmation email, so an off-origin string must
 * not be able to ride in on it. An absolute URL, a protocol-relative one and
 * the backslash variants all come back null here rather than being parsed for
 * a job id.
 *
 * Lives in lib rather than beside the component because it is a pure function
 * and the check that watches it must be able to import it without dragging a
 * React tree and a stylesheet along.
 */
export function applyGateJobId(returnTo: string | null | undefined): string | null {
  const safe = safeInternalPath(returnTo)
  if (!safe) return null
  const m = safe.match(/^\/job\/([0-9a-fA-F-]{36})(?:[?#]|$)/)
  return m ? m[1] : null
}
