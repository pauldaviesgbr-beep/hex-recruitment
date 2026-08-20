// The handover between "an advert was just published" and the dashboard that
// says so. One file so the writer and the reader cannot disagree about the key
// or the shape — the stay-hidden link failed for nine days because the send
// path and the verify path each built their own URL three lines apart.
//
// sessionStorage RATHER THAN A QUERY PARAM, and that is the decision worth
// recording. ?posted=<id> re-fires on every refresh and travels with a copied
// or bookmarked URL, so a person could be told "your advert is live" about an
// advert they did not post — confidently wrong, which is worse than silent. It
// would also mean adding useSearchParams to a dashboard with no Suspense
// boundary around it. This is read once, cleared immediately, and scoped to the
// tab that did the posting.

const KEY = 'thrive:justPosted'

/** A flag older than this is ignored — see readJustPosted. */
const MAX_AGE_MS = 5 * 60_000

export interface JustPosted {
  id: string
  title: string
}

/** Called by the post-job form the moment publishing completes. */
export function markJustPosted(id: string, title?: string | null): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id, title: title || '', at: Date.now() }))
  } catch {
    // Private mode or quota. The advert is still published; the employer just
    // gets the ordinary dashboard. Never let a confirmation break a post.
  }
}

/**
 * Read and consume the flag. Returns null unless an advert really was
 * published by this tab in the last few minutes.
 *
 * ONE-SHOT, AND CLEARED BEFORE IT IS TRUSTED: a malformed or stale value must
 * not sit in storage re-triggering on every dashboard visit for the rest of the
 * session. The age guard is the other half — an abandoned navigation should not
 * congratulate someone ten minutes later on a different visit, and an event
 * sentence occupying a slot built for current state has to be bounded by
 * something.
 */
export function readJustPosted(): JustPosted | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const v = JSON.parse(raw)
    if (typeof v?.id !== 'string' || !v.id) return null
    if (typeof v?.at !== 'number' || Date.now() - v.at > MAX_AGE_MS) return null
    return { id: v.id, title: typeof v.title === 'string' ? v.title : '' }
  } catch {
    return null
  }
}
