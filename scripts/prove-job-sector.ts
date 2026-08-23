// EVERY ADVERT MUST BE FINDABLE UNDER ITS OWN SECTOR.
//
//   npm run jobsector:prove
//
// SIXTEEN LIVE ADVERTS WERE NOT. All 251 carry category='hospitality', and
// getJobSector decided a job's sector from TITLE keywords first, then from a
// hand-written `sectorIds` list — which did not contain 'hospitality'. So a job
// whose category column literally said hospitality could only be rescued by its
// title, and sixteen titles ("Assistant Manager", and so on) had no hospitality
// word in them. Those sixteen fell through to the `return 'business'` default:
// filed under Business, Consulting & Management, and INVISIBLE to a candidate
// filtering the board to Hospitality — the only sector on the board.
//
// THE LIST WAS A SEVENTH COPY OF A VOCABULARY. lib/categories.ts holds 33
// canonical ids; sectorIds typed out 19 of them. Fourteen sectors, including
// hospitality, could never be matched on the category column at all. Same fault
// as the six work-TYPE lists and the two work-LOCATION ones, and the fix is the
// same: derive, do not retype.
//
// AND IT WAS FOUND BY CHASING A FAILING TEST. A throwaway advert titled
// "ZZ TEMPORARY TEST ADVERT" did not appear for a Remote candidate, which
// looked exactly like the work-location fix failing. It was this instead.
//
// Pure functions, no network, no database.

import { getJobSector } from '../lib/jobSector'
import { categories } from '../lib/categories'

let failed = 0
let ran = 0
const check = (name: string, got: () => unknown, want: unknown) => {
  ran++
  let v: unknown
  try { v = got() } catch (err) {
    console.log(`FAIL  ${name}`)
    console.log(`        threw: ${(err as Error).message}`)
    failed++
    return
  }
  const a = JSON.stringify(v), b = JSON.stringify(want)
  if (a !== b) {
    console.log(`FAIL  ${name}`)
    console.log(`        want ${b}`)
    console.log(`        got  ${a}`)
    failed++
  } else console.log(`ok    ${name}`)
}

// ── THE SIXTEEN ────────────────────────────────────────────────────────────
// Real shapes: category says hospitality, title says nothing in particular.

check(
  'a hospitality advert with a NEUTRAL title is hospitality, not business',
  () => getJobSector({ title: 'Assistant Manager', category: 'hospitality' }),
  'hospitality'
)
check(
  'and one with a title that reads like another sector entirely',
  () => getJobSector({ title: 'Operations Supervisor', category: 'hospitality' }),
  'hospitality'
)
check(
  'and one with a title of pure nonsense',
  () => getJobSector({ title: 'ZZ TEMPORARY TEST ADVERT', category: 'hospitality' }),
  'hospitality'
)

// ── AND THE ONES THAT ALREADY WORKED MUST STILL WORK ───────────────────────
check(
  'a chef is still hospitality',
  () => getJobSector({ title: 'Chef de Partie', category: 'hospitality' }),
  'hospitality'
)
check(
  'a chef with NO category at all is still hospitality — the title rescues it',
  () => getJobSector({ title: 'Head Chef', category: undefined }),
  'hospitality'
)
check(
  'a sommelier too',
  () => getJobSector({ title: 'Sommelier', category: 'hospitality' }),
  'hospitality'
)

// ── THE NEGATIVE. A FILTER THAT MATCHES EVERYTHING IS NOT A FILTER ─────────
// Without these, "return 'hospitality' always" would pass every case above.

check(
  'a retail advert is NOT hospitality',
  () => getJobSector({ title: 'Store Assistant', category: 'retail' }),
  'retail'
)
check(
  'a healthcare advert is NOT hospitality',
  () => getJobSector({ title: 'Registered Nurse', category: 'healthcare' }),
  'healthcare'
)
check(
  'a digital advert is NOT hospitality',
  () => getJobSector({ title: 'Software Developer', category: 'digital' }),
  'digital'
)
check(
  'the category column wins over an unrelated title',
  () => getJobSector({ title: 'Assistant Manager', category: 'veterinary' }),
  'veterinary'
)

// ── THE LIST IS DERIVED, NOT TYPED ─────────────────────────────────────────
// This is the class fix. If someone reverts to a hand-written subset, the
// sectors they forget go red here rather than in eight months.

check(
  'EVERY canonical category id is matchable on the column',
  () => {
    const missed = categories
      .map(c => c.id)
      .filter(id => getJobSector({ title: 'Nondescript Role', category: id }) !== id)
    return missed
  },
  []
)

check(
  'and there are enough categories for that to mean something',
  () => categories.length >= 30,
  true
)

// ── THE DEFAULT IS STILL THERE FOR GENUINELY UNKNOWN JOBS ──────────────────
check(
  'an advert with no category and an unrecognisable title still defaults',
  () => getJobSector({ title: 'Nondescript Role', category: undefined }),
  'business'
)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}
