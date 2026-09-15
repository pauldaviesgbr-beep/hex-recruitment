// LOCATION AND AREA ARE JOINED IN ONE PLACE, AND IT IS NOT A JSX EXPRESSION.
//
//   npm run locationdisplay:prove
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// `jobs.location` and `jobs.area` frequently hold the SAME WORD. 19 of 119 live
// adverts did on 15 Sept 2026, and the raw join `[job.location, job.area]
// .filter(Boolean).join(', ')` rendered them as "London, London" on a real
// candidate-facing page.
//
// `lib/jobCard.ts` has exported `formatJobLocation` for exactly this since the
// CARDS were fixed — its own comment says so. The cards were repaired and five
// OTHER display sites went on hand-rolling the join, in files that in two cases
// already imported the helper. That is this project's most expensive recurring
// shape: the right answer exists once, and the wrong one is re-derived beside
// it.
//
// THIS IS THE THIRD TIME THE FAULT HAS SURFACED AND THE SECOND TIME THE COUNT
// OF CALL SITES WAS WRONG. It was reported as two display sites on the morning
// of 15 Sept; it was five. The count came from the file that happened to be
// open rather than from a sweep — so the guard is the deliverable, not the
// five replacements.
//
// ── WHAT IS ALLOWED, AND WHY IT IS NAMED RATHER THAN IGNORED ───────────────
//
// A raw join is legitimate when the result is a GOOGLE MAPS SEARCH QUERY: the
// maps URL wants every scrap of place it can get and a repeated word costs
// nothing there, because nobody reads the query string. Those sites all assign
// to a local called `locationString` and hand it to maps.google.com.
//
// So the rule is not "never join these two fields". It is: JOIN THEM ONLY ON
// THE LINE THAT BUILDS A MAPS QUERY. Anything else — a JSX expression, a
// template literal, a returned string — has to call the helper, because it ends
// up in front of a person.
//
// Filesystem and pure text. Whether the rendered line LOOKS right is a browser
// question and belongs in a drive.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

let failed = 0
let ran = 0
const check = (name, got, want) => {
  ran++
  let v
  try { v = got() } catch (err) {
    console.log(`FAIL  ${name}`)
    console.log(`        threw: ${err.message}`)
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

// Every .ts/.tsx under app/ and components/. Walked rather than globbed so a
// new directory is covered the day somebody adds it — an exception list is a
// claim about which directories exist, and this repo has been bitten by one.
const files = []
const walk = (dir) => {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules' || entry === '.next') continue
    const rel = `${dir}/${entry}`
    const abs = join(ROOT, rel)
    if (statSync(abs).isDirectory()) walk(rel)
    else if (/\.tsx?$/.test(entry)) files.push(rel)
  }
}
walk('app')
walk('components')

// The join, in any of the shapes it has actually appeared in: the variable is
// `job`, `selectedJob`, `j` or similar, so match on the PAIR of properties
// rather than on a variable name I would otherwise have to keep up to date.
const JOIN = /\[\s*(\w+)\.location\s*,\s*\1\.area\s*\]\s*\.filter\(Boolean\)\.join\(/

const hits = []
for (const rel of files) {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  src.split(/\r?\n/).forEach((line, i) => {
    if (!JOIN.test(line)) return
    // The one permitted shape: assigning the string that becomes a maps query.
    const isMapsQuery = /locationString\s*=/.test(line)
    hits.push({ where: `${rel}:${i + 1}`, isMapsQuery, line: line.trim().slice(0, 70) })
  })
}

const display = hits.filter(h => !h.isMapsQuery)
const maps = hits.filter(h => h.isMapsQuery)

check(
  'no location+area join outside a maps query — every display site calls the helper',
  () => display.map(h => h.where),
  []
)

// ZERO-GUARD. If the pattern stops matching — someone reformats the join across
// two lines, or renames the fields — this file would report a clean product
// while seeing nothing at all. It must still find the maps-query sites it knows
// are there, and it must still be reading a real number of files.
check(
  'the scan can still see the joins it is meant to police',
  () => maps.length >= 4,
  true
)
check(
  'and it is actually reading the tree',
  () => files.length > 200,
  true
)

// The helper the display sites are supposed to call must exist and must still
// do the de-duplication. A guard pointing at a helper that has quietly stopped
// de-duplicating would pass on a product showing "London, London" everywhere.
const jobCard = readFileSync(join(ROOT, 'lib/jobCard.ts'), 'utf8')
check(
  'formatJobLocation still collapses a repeated place rather than joining it',
  () => /export function formatJobLocation/.test(jobCard)
     && /startsWith\(location\.toLowerCase\(\)\)/.test(jobCard),
  true
)

console.log('')
console.log(`  display sites joining raw : ${display.length}`)
console.log(`  maps-query sites (allowed): ${maps.length}`)
for (const m of maps) console.log(`      ${m.where}`)
console.log(`  files scanned             : ${files.length}`)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}
