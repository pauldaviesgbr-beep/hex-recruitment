/**
 * "3 weeks ago" for the one fact a blank profile still has.
 *
 * NOT lib/tempWork.timeAgo, which speaks in "18d ago" — right beside a live
 * shift, wrong in a sentence an employer reads as prose. This is the same
 * information in the register the card is written in.
 *
 * Coarse on purpose. A candidate who joined this morning and one who joined at
 * lunchtime are the same fact to an employer, and a card that says "7h ago"
 * invites a precision the rest of the row cannot match.
 */
export function joinedAgo(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 'recently'

  const days = Math.floor((now.getTime() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`

  const weeks = Math.floor(days / 7)
  if (weeks === 1) return 'last week'
  if (days < 60) return `${weeks} weeks ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} months ago`

  const years = Math.floor(days / 365)
  return years === 1 ? 'a year ago' : `${years} years ago`
}
