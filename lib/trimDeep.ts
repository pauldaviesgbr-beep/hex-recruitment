/**
 * Trim every string in a payload, once, on the way to the database.
 *
 * WHY THIS IS A HELPER AND NOT SEVEN .trim() CALLS. The post-job payload had
 * exactly one trimmed field — `venue` — and about a dozen untrimmed ones beside
 * it. That is not an oversight anyone can see while reading: a trailing space
 * is invisible in the form, invisible in the payload, invisible in the row, and
 * only becomes visible three surfaces later. Thrive's own first advert stored
 * its title as "Head of Sales " and its location as "London ", and the board
 * rendered:
 *
 *     London , London
 *
 * — a space before the comma, because the card joins `${location}, ${area}`.
 * Nobody typed that space deliberately; it comes free with pasting or with a
 * fat thumb on a phone keyboard, and a recruiter entering fifteen roles
 * produces fifteen of them.
 *
 * TWO PIECES OF STATE THAT MUST AGREE NEED ONE PATH THAT SETS BOTH, and the
 * same argument applies to a rule that must hold for every field: field-by-field
 * trimming is correct until someone adds the fourteenth field, and then it is
 * silently wrong again. This runs over the whole object, so a field added
 * tomorrow is covered without anyone remembering.
 *
 * WHAT IT DOES NOT DO. It does not collapse internal whitespace — "Front  of
 * House" keeps its double space, because that is a typo to fix in the form and
 * not something this should silently rewrite. It does not touch numbers,
 * booleans, null or undefined. It does not convert an all-whitespace string to
 * null: "   " becomes "", and the callers already treat "" as absent.
 */
export function trimDeep<T>(value: T): T {
  if (typeof value === 'string') return value.trim() as unknown as T
  if (Array.isArray(value)) return value.map(v => trimDeep(v)) as unknown as T
  // Date, Set, Map and friends are passed through untouched — walking them
  // would rebuild them as plain objects, which is a far worse bug than an
  // untrimmed string.
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = trimDeep(v)
    return out as unknown as T
  }
  return value
}
