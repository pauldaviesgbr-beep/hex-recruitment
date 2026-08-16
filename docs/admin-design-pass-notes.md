# Admin design pass — recorded, not fixed

Things seen on the admin estate that are DESIGN decisions rather than repairs.
They are written down because a fault nobody wrote down is a fault nobody
fixes — the /admin/settings clip sat in a chat thread for a day and was only
closed once someone looked at a screenshot.

**Nothing in this file has been actioned.** Each entry says what was seen, how
it was seen, and what the decision actually is. Do not "fix" one of these on
the way past something else; they need Paul's call on how the page should
behave, not a repair.

---

## 1. The stats row eats the whole first screen on a phone

**Seen** 16 Aug 2026, in Paul's own screenshots of production at phone width.

At 390 the `.statsGrid` collapses to `grid-template-columns: 1fr` — one card
per row. On `/admin/applications` that is four cards (Total, Pending,
Interview, Offered) stacked, each with a label and a large number, consuming
the entire first screen before a single row of the table it sits above.
`/admin/reviews` is the same shape with three.

The rule that produces it is deliberate and reasonable in isolation:

    @media (max-width: 640px) { .statsGrid { grid-template-columns: 1fr; } }

It appears in `jobs`, `applications`, `reviews`, `subscriptions` and `emails`.

**Why it is a design decision and not a bug.** Nothing is unreachable and
nothing is clipped — it scrolls, and the numbers are legible. The question is
whether a person opening `/admin/applications` on a phone wants four summary
figures first, or wants the applications. That is the same question Paul
answered when he dropped A4: *symmetry is a weak reason to add data, and the
page should lead with what you opened it for.*

**Options, none chosen:** two columns at 390 rather than one (`repeat(2, 1fr)`,
which fits — the cards are not wide); a single compact summary line instead of
cards; or the stats moving below the table on narrow screens.

---

## 2. `/admin/settings` reads "(1 sectors)"

**Seen** 16 Aug 2026, same set of screenshots.

The Sectors card's description renders `Current job sectors used across the
platform (1 sectors).` — no singular handling.

It says "1 sectors" **today and for as long as the board stays
hospitality-only**, which is the whole of its life so far: `select distinct
category from jobs` returns exactly one value, `hospitality`, across 296 rows
(read from the database 16 Aug 2026). So this is not an edge case that shows
up rarely — it is the *only* string that surface has ever displayed.

**Why it is recorded rather than fixed.** It is a one-line change and it is
tempting to do in passing, which is exactly the habit worth not having: it sits
in a page that is due a design pass, and the same card also has to decide what
it should say when the count is zero. Fix the sentence once, with that answer
in hand.

Related and already recorded in CLAUDE.md: the sectors *filter* offers 33
options of which 32 match nothing, for the same reason. Both are artefacts of
hospitality being the starting vertical rather than the product.
