// Job titles on this board are `Role – Marketing Phrase`, produced that way by
// the Goldenkeys scrape: 244 of the 247 live listings carry an en dash, none
// carry an em dash, and none carry a spaced hyphen. The longest is 82
// characters.
//
// The part BEFORE the dash is the job. Word-boundary or character-count
// truncation cuts mid-phrase and loses the role, which is the one thing a
// reader needs.

/** U+2013. The separator the scrape actually produces. */
const EN_DASH = '–'
/** U+2014. Not present on any live row today; handled so a hand-typed title
 *  behaves the same way rather than differently for no visible reason. */
const EM_DASH = '—'

/**
 * DELIBERATELY NOT THE HYPHEN, even spaced as " - ".
 *
 * An en dash in these titles is always a separator. A hyphen is not: it is
 * inside the role itself in "Front-of-House Manager" and "Front-of-House
 * Supervisor", and splitting on it would leave "Front". Zero live titles use
 * a spaced hyphen as a separator, so supporting it would add a real risk to
 * buy nothing measurable. If employer-typed titles ever start using one, this
 * is the line to revisit — with the data in front of you, not on a hunch.
 */
export function roleFromTitle(title: string | null | undefined): string {
  if (!title) return ''
  const full = title.trim()

  let cut = -1
  for (const dash of [EN_DASH, EM_DASH]) {
    const i = full.indexOf(dash)
    if (i !== -1 && (cut === -1 || i < cut)) cut = i
  }
  if (cut === -1) return full

  const role = full.slice(0, cut).trim()
  // A title that OPENS with the dash has no role before it. Returning '' there
  // would render an empty cell, which is worse than a long one.
  return role.length > 0 ? role : full
}

/** True when roleFromTitle actually dropped something, so a caller knows
 *  whether it needs to offer the full title on hover or in a drawer. */
export function isTitleTruncated(title: string | null | undefined): boolean {
  if (!title) return false
  return roleFromTitle(title) !== title.trim()
}
