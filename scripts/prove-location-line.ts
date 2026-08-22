// THE LOCATION LINE, AND THE CLASS OF FAULT IT BELONGS TO.
//
//   npm run locationline:prove
//
// WHY THIS EXISTS. "London, London" was fixed on the cards and the job page
// kept its own inline ternary, whose address branch was a raw template literal:
//
//     `${addressLine1}, ${city} ${postcode}`
//
// With no city and no postcode that renders "London,  " — the town, a comma
// pointing at nothing, and two trailing spaces. It was live on 226 of 251
// adverts and it was found by a person looking at his phone, not by any check.
//
// THE PREVIOUS FIX ASKED "IS THE DUPLICATE GONE" AND THAT PASSED. It was true
// and insufficient, because the duplicate and the dangling comma are two
// different faults of the same line. So this asks the PROPERTY instead: does
// the string this function returns ever contain punctuation with nothing after
// it? That question catches the next variant too — a trailing comma from a
// missing county, a doubled separator, a stray leading comma — none of which
// anybody has thought of yet.
//
// Pure functions. No network, no database, milliseconds.

import { formatJobAddress, formatJobLocation } from '../lib/jobCard'

// A rendered location must not end in punctuation, contain a comma with
// nothing before it, double up its separators, or carry stray whitespace.
// This is the whole point: assert the SHAPE, not the two examples I know about.
function malformed(s: string): string | null {
  if (s !== s.trim()) return 'has leading or trailing whitespace'
  if (/[,;·]\s*$/.test(s)) return 'ends in punctuation pointing at nothing'
  if (/^\s*[,;·]/.test(s)) return 'starts with a separator'
  if (/,\s*,/.test(s)) return 'has a doubled comma'
  if (/\s{2,}/.test(s)) return 'has a run of spaces'
  if (/,\S/.test(s)) return 'has a comma with no space after it'
  return null
}

const cases = [
  // ── THE 226 ROWS. full_location null, so lib/types.ts synthesises
  //    { addressLine1: location, city: '', postcode: '' } — which is a town
  //    wearing an address's shape, and is what produced "London,  ".
  {
    name: 'synthesised address, town equals area (the live Goldenkeys shape)',
    job: { location: 'London', area: 'London', fullLocation: { addressLine1: 'London', city: '', postcode: '' } },
    want: 'London',
  },
  {
    name: 'synthesised address, town and county differ — THE COUNTY SURVIVES',
    job: { location: 'Bath', area: 'Somerset', fullLocation: { addressLine1: 'Bath', city: '', postcode: '' } },
    want: 'Bath, Somerset',
  },
  {
    name: 'synthesised address, no area at all',
    job: { location: 'Leeds', area: null, fullLocation: { addressLine1: 'Leeds', city: '', postcode: '' } },
    want: 'Leeds',
  },

  // ── A REAL ADDRESS. 24 of the 25 live rows that have one.
  {
    name: 'real address with city and postcode',
    job: { location: 'Bath', area: 'Somerset', fullLocation: { addressLine1: '1 Example Street', city: 'Bath', postcode: 'BA1 1AA' } },
    want: '1 Example Street, Bath BA1 1AA',
  },
  {
    name: 'real address, city but no postcode',
    job: { location: 'Bath', area: 'Somerset', fullLocation: { addressLine1: '1 Example Street', city: 'Bath', postcode: '' } },
    want: '1 Example Street, Bath',
  },
  {
    name: 'real address, postcode but no city',
    job: { location: 'Bath', area: 'Somerset', fullLocation: { addressLine1: '1 Example Street', city: '', postcode: 'BA1 1AA' } },
    want: '1 Example Street, BA1 1AA',
  },

  // ── NULLS AND EMPTIES, which is where dangling punctuation is born.
  {
    name: 'no fullLocation at all',
    job: { location: 'York', area: 'North Yorkshire', fullLocation: null },
    want: 'York, North Yorkshire',
  },
  {
    name: 'everything empty returns an empty string, not a comma',
    job: { location: '', area: '', fullLocation: null },
    want: '',
  },
  {
    name: 'whitespace-only parts are treated as absent',
    job: { location: 'Hull', area: '   ', fullLocation: { addressLine1: '  ', city: '  ', postcode: '  ' } },
    want: 'Hull',
  },

  // ── THE REPEAT RULE THE CARDS ALREADY HAD, still honoured here.
  {
    name: 'area opening with the town shows the area alone (Ricci’s row)',
    job: { location: 'London', area: 'London E9 5EN', fullLocation: { addressLine1: 'London', city: '', postcode: '' } },
    want: 'London E9 5EN',
  },
]

let failed = 0
for (const c of cases) {
  let got
  try {
    got = formatJobAddress(c.job)
  } catch (err) {
    console.log(`FAIL  ${c.name}`)
    console.log(`        threw: ${(err as Error).message}`)
    failed++
    continue
  }
  const shape = malformed(got)
  if (got !== c.want) {
    console.log(`FAIL  ${c.name}`)
    console.log(`        want ${JSON.stringify(c.want)}  got ${JSON.stringify(got)}`)
    failed++
  } else if (shape) {
    console.log(`FAIL  ${c.name}`)
    console.log(`        expected value matched but the string is malformed: ${shape} — ${JSON.stringify(got)}`)
    failed++
  } else {
    console.log(`ok    ${c.name}`)
  }
}

// The shape rule, applied to formatJobLocation as well — the cards' formatter
// is a different function and the same class of fault can land in it.
const cardCases = [
  { location: 'London', area: 'London' },
  { location: 'Bath', area: 'Somerset' },
  { location: '', area: 'Kent' },
  { location: 'Hull', area: '' },
  { location: '', area: '' },
]
for (const job of cardCases) {
  const got = formatJobLocation(job)
  const shape = malformed(got)
  const label = `formatJobLocation(${JSON.stringify(job.location)}, ${JSON.stringify(job.area)})`
  if (shape) {
    console.log(`FAIL  ${label} — ${shape}: ${JSON.stringify(got)}`)
    failed++
  } else {
    console.log(`ok    ${label} -> ${JSON.stringify(got)}`)
  }
}

const total = cases.length + cardCases.length
console.log(`\n${total - failed}/${total} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}
