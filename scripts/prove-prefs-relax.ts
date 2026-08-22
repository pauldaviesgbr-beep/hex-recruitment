// NO PREFERENCE MAY SILENTLY EMPTY THE BOARD — watched, not intended.
//
//   npm run prefsrelax:prove
//
// The fault this exists for was found by Paul on his own phone: signed in, and
// the board said "No jobs match your search" under a Hybrid chip he never
// pressed. His profile carries a Hybrid preference and all 251 live adverts
// are on site, so the one personalised feature on the product could only ever
// return nothing — for the people who had already joined.
//
// THE CENTRAL CASE IS THE LAST ONE. `undecided` is what stops the very first
// paint — jobs still loading, array empty — from looking identical to "every
// preference matches nothing" and telling the candidate their choices were
// ignored on a page that had not finished loading. An empty board and an
// impossible preference produce the same zero, and only this flag separates
// them. If someone "simplifies" it away, that case goes red.
//
// Pure functions. No network, no database, milliseconds.

import {
  resolvePrefFilters,
  relaxedPrefsMessage,
  workStylePref,
  sectorPref,
  type PrefFilter,
} from '../lib/candidatePrefs'

type J = { id: string; tags?: string[] | null; category?: string | null }

// The live board, in miniature: everything on site, everything hospitality.
const BOARD: J[] = [
  { id: 'a', tags: ['On-site', 'Full-time'], category: 'hospitality' },
  { id: 'b', tags: ['On-site'], category: 'hospitality' },
  { id: 'c', tags: ['On-site'], category: 'retail' },
]

let failed = 0
let ran = 0
const check = (name: string, got: () => unknown, want: unknown) => {
  ran++
  let value: unknown
  try {
    value = got()
  } catch (err) {
    console.log(`FAIL  ${name}`)
    console.log(`        threw: ${(err as Error).message}`)
    failed++
    return
  }
  const a = JSON.stringify(value)
  const b = JSON.stringify(want)
  if (a !== b) {
    console.log(`FAIL  ${name}`)
    console.log(`        want ${b}`)
    console.log(`        got  ${a}`)
    failed++
  } else {
    console.log(`ok    ${name}`)
  }
}

// ── THE FAULT ITSELF ───────────────────────────────────────────────────────
check(
  'a Hybrid preference against an all-on-site board is RELAXED, not honoured',
  () => {
    const r = resolvePrefFilters(BOARD, [workStylePref<J>('Hybrid')])
    return { relaxed: r.relaxed.map(p => p.value), matchedCount: r.matched.length }
  },
  { relaxed: ['Hybrid'], matchedCount: 3 }
)

check(
  'THE BOARD IS NEVER EMPTIED by a preference',
  () => resolvePrefFilters(BOARD, [workStylePref<J>('Hybrid')]).matched.length > 0,
  true
)

check(
  'and the candidate is TOLD, with a reason rather than an announcement',
  () => {
    const r = resolvePrefFilters(BOARD, [workStylePref<J>('Hybrid')])
    const msg = relaxedPrefsMessage(r.relaxed) || ''
    return { mentionsTheChoice: msg.includes('Hybrid'), givesAReason: /on site/.test(msg) }
  },
  { mentionsTheChoice: true, givesAReason: true }
)

// ── A PREFERENCE THAT DOES MATCH IS LEFT ALONE ─────────────────────────────
check(
  'an On-site preference IS honoured, because it matches',
  () => {
    const r = resolvePrefFilters(BOARD, [workStylePref<J>('On-site')])
    return { applied: r.applied.map(p => p.value), relaxed: r.relaxed.length, matched: r.matched.length }
  },
  { applied: ['On-site'], relaxed: 0, matched: 3 }
)

check(
  'nothing is said when nothing was relaxed',
  () => relaxedPrefsMessage(resolvePrefFilters(BOARD, [workStylePref<J>('On-site')]).relaxed),
  null
)

// ── TWO PREFERENCES THAT ARE FINE ALONE AND EMPTY TOGETHER ─────────────────
// This is why the resolver is cumulative. Each is individually satisfiable;
// together they match nothing, and the SECOND one is the one that gives way.
check(
  'jointly-impossible preferences relax the second, not the first',
  () => {
    const r = resolvePrefFilters(BOARD, [
      sectorPref<J>('retail', 'Retail'),
      workStylePref<J>('Full-time'),
    ])
    return {
      applied: r.applied.map(p => p.key),
      relaxed: r.relaxed.map(p => p.key),
      matched: r.matched.map(j => j.id),
    }
  },
  { applied: ['sector'], relaxed: ['workStyle'], matched: ['c'] }
)

check(
  'both applied when they are jointly satisfiable',
  () => {
    const r = resolvePrefFilters(BOARD, [
      sectorPref<J>('hospitality', 'Hospitality'),
      workStylePref<J>('Full-time'),
    ])
    return { applied: r.applied.map(p => p.key), matched: r.matched.map(j => j.id) }
  },
  { applied: ['sector', 'workStyle'], matched: ['a'] }
)

// ── THE ONE THAT KEEPS THE FIRST PAINT HONEST ──────────────────────────────
check(
  'AN EMPTY BOARD IS UNDECIDED, NOT "every preference failed"',
  () => {
    const r = resolvePrefFilters([] as J[], [workStylePref<J>('Hybrid')])
    return { undecided: r.undecided, relaxed: r.relaxed.length, applied: r.applied.length }
  },
  { undecided: true, relaxed: 0, applied: 0 }
)

check(
  'a loaded board is DECIDED, so the two states are distinguishable',
  () => resolvePrefFilters(BOARD, [workStylePref<J>('Hybrid')]).undecided,
  false
)

check(
  'nothing is announced while undecided',
  () => relaxedPrefsMessage(resolvePrefFilters([] as J[], [workStylePref<J>('Hybrid')]).relaxed),
  null
)

// ── DEGENERATE INPUTS ──────────────────────────────────────────────────────
check(
  'no preferences at all is not a relaxation',
  () => {
    const r = resolvePrefFilters(BOARD, [] as PrefFilter<J>[])
    return { applied: 0, relaxed: 0, matched: r.matched.length, undecided: r.undecided }
  },
  { applied: 0, relaxed: 0, matched: 3, undecided: false }
)

check(
  'a job with null tags does not throw',
  () => resolvePrefFilters([{ id: 'x', tags: null, category: null }] as J[], [workStylePref<J>('Hybrid')]).relaxed.length,
  1
)

// COUNTED, NOT TYPED. A hardcoded total is a number that can disagree with
// what actually ran — twelve checks reported as eleven on the first run of
// this very file, which is a small version of what these checks exist for.
console.log(`
${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}
