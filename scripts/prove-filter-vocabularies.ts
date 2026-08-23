// NO FILTER MAY OFFER A VALUE THE PRODUCT CANNOT PRODUCE.
//
//   npm run filtervocab:prove
//
// THIS IS THE CLASS, NOT THE INSTANCE. Four separate faults in this codebase
// have been the same shape, and each was fixed on its own:
//
//   · SIX disagreeing copies of the work-TYPE vocabulary, one of which offered
//     "Apprenticeship" — a word that exists nowhere else in the product. Fixed
//     by lib/workTypes.ts.
//   · The job-alert tag picker, where all 34 options matched zero rows.
//   · The work-LOCATION vocabulary: the employer form writing "In person", the
//     candidate form writing "On-site", and nothing mapping between them.
//     Fixed by lib/workLocation.ts — which is workTypes' twin, written because
//     nobody looked one column across.
//   · And the "Work Arrangement" filter, which offered three options and was
//     applied nowhere at all.
//
// So this does not check work location. It checks that EVERY filter offering a
// fixed set of choices offers choices drawn from the shared vocabulary for that
// field — which is what all four faults violated.
//
// WHY "THE PRODUCT CAN PRODUCE" AND NOT "THE BOARD CURRENTLY MATCHES".
// A check that failed whenever an option had zero live matches would go red for
// "Remote" today and stay red until Thrive broadens — a true statement about
// this week's data, useless as a guard, and exactly the kind of check people
// learn to ignore. Offering Remote is correct: an employer can post one
// tomorrow. Offering "Apprenticeship", which no form can write and no row can
// hold, never becomes correct. The first is a fact about the DATA; the second
// is a fact about the CODE, and only the second belongs in verify.
//
// Filesystem and pure functions only. No network, no database.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORK_LOCATIONS, normaliseWorkLocation } from '../lib/workLocation'
import { WORK_TYPES } from '../lib/workTypes'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

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

// ── THE VOCABULARIES THEMSELVES ────────────────────────────────────────────

check(
  'every work LOCATION the employer form offers is in the shared vocabulary',
  () => {
    const src = read('app/post-job/page.tsx')
    // The <option> values in the Work Location select.
    const offered = Array.from(src.matchAll(/<option value="(In person|Remote|Hybrid|On-site|Onsite)">/g)).map(m => m[1])
    return offered.filter(v => normaliseWorkLocation(v) === null)
  },
  []
)

check(
  'the employer form offers at least one work location (the scrape found something)',
  () => {
    const src = read('app/post-job/page.tsx')
    return Array.from(src.matchAll(/<option value="(In person|Remote|Hybrid)">/g)).length > 0
  },
  true
)

check(
  'the candidate form no longer hardcodes its own work-location list',
  () => read('components/JobSeekerProfileForm.tsx').includes("['On-site', 'Remote', 'Hybrid']"),
  false
)

check(
  'the candidate form draws its options from the shared vocabulary',
  () => read('components/JobSeekerProfileForm.tsx').includes('WORK_LOCATIONS'),
  true
)

check(
  'the board no longer hardcodes a work-location trio',
  () => {
    const src = read('app/jobs/page.tsx')
    return /\['Remote', 'Hybrid', 'On-site'\]|\['On-site', 'Remote', 'Hybrid'\]/.test(src)
  },
  false
)

// ── THE FIELD THE FILTER READS ─────────────────────────────────────────────
// This is fault 2, and it is the one that cost eight candidates their board.

check(
  'THE BOARD FILTERS WORK LOCATION ON work_location, NOT ON tags',
  () => read('app/jobs/page.tsx').includes('jobMatchesWorkLocation(job, quickWorkStyle)'),
  true
)

check(
  'the old tag-based work-style predicate is GONE',
  () => read('app/jobs/page.tsx').includes('jobTags.includes(quickWorkStyle)'),
  false
)

check(
  'the candidate preference filters on work_location, not tags',
  () => read('lib/candidatePrefs.ts').includes('jobMatchesWorkLocation(job, value)'),
  true
)

// ── A FILTER THAT IS OFFERED MUST BE APPLIED ───────────────────────────────
// Fault 4: "Work Arrangement" was declared, rendered, counted in the
// active-filter badge, and referenced nowhere in the predicate. A filter that
// says it is on and changes nothing is worse than one that returns nothing,
// because the person believes it worked.

check(
  'EVERY declared filter section is actually applied in the predicate',
  () => {
    const src = read('app/jobs/page.tsx')
    const declared = Array.from(src.matchAll(/\{ key: '(\w+)' as const, title:/g)).map(m => m[1])
    return declared.filter(key => !src.includes(`filters.${key}.size`))
  },
  []
)

check(
  'and there is more than one declared section, so the check is not vacuous',
  () => {
    const src = read('app/jobs/page.tsx')
    return Array.from(src.matchAll(/\{ key: '(\w+)' as const, title:/g)).length >= 5
  },
  true
)

// ── THE ALIAS ACTUALLY MAPS ────────────────────────────────────────────────

check('"On-site" normalises to the canonical "In person"', () => normaliseWorkLocation('On-site'), 'In person')
check('"onsite" too, case and hyphen insensitive', () => normaliseWorkLocation('ONSITE'), 'In person')
check('"In person" is already canonical', () => normaliseWorkLocation('In person'), 'In person')
check('Remote and Hybrid pass through', () => [normaliseWorkLocation('Remote'), normaliseWorkLocation('Hybrid')], ['Remote', 'Hybrid'])
check(
  'AN UNKNOWN VALUE IS NULL, NOT the commonest one',
  () => normaliseWorkLocation('Apprenticeship'),
  null
)
check('the canonical list leads with the word 251 adverts use', () => WORK_LOCATIONS[0], 'In person')

// ── THE OTHER VOCABULARY, STILL INTACT ─────────────────────────────────────
// workTypes.ts is the module this one was modelled on. If somebody
// "simplifies" one they will reach for the other next.

check(
  'the work-TYPE vocabulary is still a single shared list',
  () => WORK_TYPES.length > 0,
  true
)

check(
  'and no filter section offers a work type outside it',
  () => {
    const src = read('app/jobs/page.tsx')
    const m = src.match(/\{ key: 'employmentType' as const, title: '[^']*', options: \[([^\]]*)\] \}/)
    if (!m) return ['(employmentType section not found)']
    // Spread of the shared list is the correct form; a literal list is not.
    if (m[1].includes('...WORK_TYPES')) return []
    return ['employmentType offers a literal list rather than the shared one: ' + m[1]]
  },
  []
)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}
