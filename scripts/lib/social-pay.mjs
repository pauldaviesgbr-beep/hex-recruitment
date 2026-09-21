// THE PAY STRING A CARD PRINTS, AND THE ONE PLACE IT IS DECIDED.
//
// It lived inside make-social-card.mjs until 21 Sept 2026, which was fine while
// the generator was the only thing that cared. The card library needs to record
// in its manifest WHAT EACH CARD SHOWS — and a manifest that recomputes the rule
// is a second copy of it, with all the drift and none of the visibility. This
// project has been caught by that exact shape before: a SQL query restating
// nameMatchKey returned 6 where the real answer was 12.
//
// So both import this. If a number is about what a function decides, get the
// number from the function.
//
// WHAT IT PRINTS IS THE STORED ROW — the full package figure — by decision of
// 21 Sept 2026. Goldenkeys and Host both advertise the maximum earning
// potential on their own adverts and the card matches how they publish. The
// BREAKDOWN is not the card's job; it goes in the caption beside it, in the
// advert's own words. See scripts/build-card-library.mjs.
//
// THE UNIT IS LOAD-BEARING AND IS NEVER DROPPED. "£14" beside a job title reads
// as an annual salary, or as nothing at all. An hourly row prints "/hour".
export function money(min, max, type) {
  const per = type === 'annual' ? '/year' : '/hour'
  const k = n => (type === 'annual' && n >= 1000 ? `£${Math.round(n / 1000)}k` : `£${n}`)
  if (!min && !max) return null
  if (!max || min === max) return `${k(min)}${per}`
  return `${k(min)}–${k(max)}${per}`
}
