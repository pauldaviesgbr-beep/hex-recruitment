/**
 * Move focus to the field a validation error is about.
 *
 * WHY THIS EXISTS. A form error rendered at the top of a long form is, from the
 * user's side, indistinguishable from a broken button: they press Next at the
 * bottom, nothing appears to happen, and the explanation is off-screen above
 * them. Measured on production before this was written — /post-job put "Please
 * add a job title" at top = -189px, 189 pixels above the window, and moved the
 * page DOWNWARD.
 *
 * Focus rather than a scroll call, because focusing does three jobs at once:
 * the browser brings the element into view for free, the field gets a visible
 * focus ring so the person can see WHICH one, and a screen reader announces it.
 * A scrollTo does only the first, and only for people who can see.
 *
 * The id must be a REAL focusable element. Every caller passes an id that the
 * validator already knew — the identity of the failing field is computed at
 * validation time and used to be thrown away when the message became a string.
 */
export function focusField(id: string | null | undefined): boolean {
  if (!id || typeof document === 'undefined') return false
  const el = document.getElementById(id)
  if (!el || typeof (el as HTMLElement).focus !== 'function') return false

  // CENTRE IT, DON'T JUST BRING IT INTO VIEW. Plain focus() scrolls the element
  // to the NEAREST edge — the minimum that counts as visible — which put the
  // profile editor's first name input at the bottom of the window and left the
  // message rendered directly beneath it at 835px, 35px below the fold.
  // Measured, not assumed: the field was in view and its own error was not.
  //
  // So: focus without scrolling, then centre. block:'center' leaves room below
  // the field for the message that belongs to it. 'auto' rather than 'smooth'
  // because a smooth scroll is still moving when the next thing reads the
  // position, and a check that races the animation is a check that lies.
  ;(el as HTMLElement).focus({ preventScroll: true })
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
  return true
}

/**
 * What a validator returns when it fails: the message to show, and the field to
 * send the person to. `field` is optional so a validator with no single
 * offending input (a whole-form or server error) can still use the same shape.
 */
export interface FieldProblem {
  field?: string
  message: string
}
