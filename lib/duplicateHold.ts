// Detecting the same person signing up twice, and what to do about it.
//
// TWO DUPLICATE PAIRS EXIST ON THE BOARD TODAY and both were found by eye, in a
// screenshot, side by side in the grid — never by a check. A board of
// twenty-one that is really nineteen.
//
// THE OBVIOUS FIX DOES NOT WORK. Both pairs carry two different email
// addresses, and no two rows in the table share an address or even a
// local-part. A dedup keyed on email would have caught NEITHER. The auth user
// is created by Supabase before any of our code runs and all three
// profile-creating paths key on that user id, so we cannot prevent the account
// either — only the second DISCOVERABLE PROFILE.
//
// So the only signal available at signup is the name, and a name is not proof:
// two real people share one. That asymmetry decides the whole design — see
// HOLD_WINDOW_DAYS below.

/** How long a held profile stays hidden before releasing itself. */
export const HOLD_WINDOW_DAYS = 7

const DAY_MS = 86_400_000

/**
 * The match key: name words, lowercased, punctuation stripped, SORTED.
 *
 * SORTED IS THE POINT. "RODRIGUE TEGUE FOTUE" and "RODRIGUE FOTUE TEGUE" are
 * one man with his names in a different order, and a first-pass matcher that
 * normalises without sorting sees two different people — which is exactly what
 * my first pass did, reporting one duplicate when there are two.
 *
 * Single-word names return null rather than a key: "Adnan" matching every other
 * Adnan is a false positive generator, and a one-word name is usually an
 * unfinished profile rather than a person.
 */
export function nameMatchKey(fullName: string | null | undefined): string | null {
  const words = (fullName || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')          // "(Rodders)" is a nickname, not a name
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)          // initials match too easily
  if (words.length < 2) return null
  return Array.from(new Set(words)).sort().join(' ')
}

export interface DuplicateHold {
  /** ISO. Set when a NEW signup was held. Null on a flagged existing row. */
  heldAt: string | null
  /** ISO the hold released itself, unreviewed. The fail-open receipt. */
  releasedAt: string | null
  /** ISO a human decided. */
  reviewedAt: string | null
  /** 'different' keeps both visible forever; 'same' leaves this one hidden. */
  verdict: 'different' | 'same' | null
  /** The user_id this row looks like. */
  matchedUserId: string | null
}

export const EMPTY_HOLD: DuplicateHold = {
  heldAt: null, releasedAt: null, reviewedAt: null, verdict: null, matchedUserId: null,
}

export function parseHold(raw: unknown): DuplicateHold {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_HOLD }
  const r = raw as Record<string, unknown>
  const iso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null)
  return {
    heldAt: iso(r.heldAt),
    releasedAt: iso(r.releasedAt),
    reviewedAt: iso(r.reviewedAt),
    verdict: r.verdict === 'different' || r.verdict === 'same' ? r.verdict : null,
    matchedUserId: typeof r.matchedUserId === 'string' ? r.matchedUserId : null,
  }
}

/**
 * Two states, and the difference is whether we ever hid anybody.
 *
 *   held    a NEW signup, hidden, with an expiry
 *   flagged an EXISTING profile that was already visible — still visible, no
 *           expiry, waiting on a human
 *
 * NOTHING IS EVER HIDDEN RETROACTIVELY. Auto-hiding someone who has been on the
 * board for a week is a regression dressed as a fix, and it would land on real
 * people rather than on new signups. Detect and surface; never hide.
 */
export type HoldState = 'none' | 'held' | 'flagged' | 'resolved' | 'released'

export function holdState(hold: DuplicateHold, isFlagged = false): HoldState {
  if (hold.reviewedAt) return 'resolved'
  if (hold.releasedAt) return 'released'
  if (hold.heldAt) return 'held'
  return isFlagged ? 'flagged' : 'none'
}

/**
 * Has an unreviewed hold outlived its window?
 *
 * FAIL OPEN, and this is the whole design rather than a detail of it. The two
 * costs are not symmetrical: a duplicate slipping onto the board is cosmetic
 * and reversible, while a real person hidden indefinitely because nobody
 * looked is precisely the fault that cost nine candidates ten days of a
 * broken opt-out. A hold that can outlive attention is that, rebuilt on
 * purpose.
 */
export function shouldRelease(hold: DuplicateHold, now: Date = new Date()): boolean {
  if (!hold.heldAt || hold.reviewedAt || hold.releasedAt) return false
  return now.getTime() - Date.parse(hold.heldAt) >= HOLD_WINDOW_DAYS * DAY_MS
}

export function markHeld(matchedUserId: string, now: Date = new Date()): DuplicateHold {
  return { ...EMPTY_HOLD, heldAt: now.toISOString(), matchedUserId }
}

/** The fail-open transition. Records that nobody looked. */
export function markReleased(current: DuplicateHold, now: Date = new Date()): DuplicateHold {
  return { ...current, releasedAt: now.toISOString() }
}

export function markReviewed(
  current: DuplicateHold,
  verdict: 'different' | 'same',
  now: Date = new Date(),
): DuplicateHold {
  return { ...current, reviewedAt: now.toISOString(), verdict }
}

/**
 * Should this row be visible? Only 'same' keeps somebody hidden, and only
 * because a human said so.
 */
export function holdBlocksVisibility(hold: DuplicateHold): boolean {
  if (hold.reviewedAt) return hold.verdict === 'same'
  if (hold.releasedAt) return false
  return !!hold.heldAt
}

/** Group rows by match key. Only groups of two or more are duplicates. */
export function findDuplicateGroups<T extends { user_id: string; full_name: string | null }>(
  rows: T[],
): { key: string; rows: T[] }[] {
  const byKey = new Map<string, T[]>()
  for (const r of rows) {
    const k = nameMatchKey(r.full_name)
    if (!k) continue
    const list = byKey.get(k)
    if (list) list.push(r)
    else byKey.set(k, [r])
  }
  return Array.from(byKey.entries())
    .filter(([, rs]) => rs.length > 1)
    .map(([key, rs]) => ({ key, rows: rs }))
}
