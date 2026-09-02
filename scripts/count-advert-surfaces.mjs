// HOW MANY PLACES CAN A PERSON SEE AN ADVERT'S DETAIL?
//
//   node scripts/count-advert-surfaces.mjs
//
// Filesystem only. Prints a MATRIX, not a number I chose.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// The right-to-work line went 2 → 3 → 7 on 1 Sept 2026 as each search got
// wider, and the count was wrong every time until the last. Both rtw:prove and
// reportcontrol:prove now agree on seven — and that agreement is WORTH
// NOTHING, because they use the IDENTICAL regex:
//
//     /\.(requirements|benefits)(\?)?\.map\(/
//
// I copied it from one into the other. Comparing their two answers cannot
// disagree; it is one discriminator counted twice. That is the second-copy
// failure this codebase spent the day cataloguing, committed in the very check
// written to prevent it.
//
// ── SO THIS ASKS BY FIELD, NOT BY ONE PATTERN ────────────────────────────
//
// It looks for each detail-only field INDEPENDENTLY — a card renders none of
// them — and prints which files render which. Seven independent answers that
// happen to agree is evidence; one answer restated is not.
//
// It deliberately does NOT decide what counts. It prints the matrix and the
// disagreements, so the number is read off the table rather than asserted by
// me. `reportcontrol:prove` is the check; this is the survey behind it.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const files = []
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (f.endsWith('.tsx')) files.push(p)
  }
}
walk('app'); walk('components')

// Each of these appears on the FULL advert and on no card. They are detected
// separately so a file that renders five of them and a file that renders one
// are distinguishable — the inline panes turn out to be a reduced advert, not
// a full one, and that only shows up field by field.
const FIELDS = [
  ['requirements', /\.requirements(\?)?\.map\(/],
  ['benefits', /\.benefits(\?)?\.map\(/],
  ['workAuth', /\.workAuthorization(\?)?\.map\(/],
  ['description', /\.description\b(?![:=])/],
  ['Additional Information', /Additional Information/],
  ['a section heading', /sectionTitle\}?>/],
  ['an apply action', /Apply Now|handleApply|applyToJob/],
]

const MOUNTS_REPORT = /<ReportControl\b/
const MOUNTS_MODAL = /<JobDetailModal\b/

const rows = []
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  const hit = FIELDS.filter(([, re]) => re.test(s)).map(([n]) => n)
  if (hit.length === 0) continue
  rows.push({
    file: f.split(sep).join('/'),
    hit,
    n: hit.length,
    report: MOUNTS_REPORT.test(s),
    modal: MOUNTS_MODAL.test(s),
  })
}
rows.sort((a, b) => b.n - a.n || a.file.localeCompare(b.file))

console.log('EVERY FILE THAT RENDERS ANY DETAIL-ONLY FIELD OF AN ADVERT')
console.log('')
console.log('  fields  report  modal  file')
console.log('  ------  ------  -----  ----------------------------------------')
for (const r of rows) {
  console.log(
    '  ' + String(r.n).padStart(6) +
    '  ' + (r.report ? '  YES ' : '   -  ') +
    '  ' + (r.modal ? ' YES ' : '  -  ') +
    '  ' + r.file)
}

console.log('')
console.log('WHICH FIELDS EACH ONE RENDERS')
console.log('')
for (const r of rows) {
  console.log('  ' + r.file)
  console.log('      ' + r.hit.join(' · '))
}

// THE DISAGREEMENT IS THE OUTPUT. If every field agreed on the same set there
// would be one number; they do not, and the gaps are where a control can hide.
console.log('')
console.log('WHAT EACH FIELD ALONE WOULD HAVE COUNTED')
console.log('')
for (const [name, re] of FIELDS) {
  const set = files.filter(f => re.test(readFileSync(f, 'utf8')))
  console.log('  ' + String(set.length).padStart(3) + '  ' + name)
}

console.log('')
const noReport = rows.filter(r => r.n >= 3 && !r.report && !r.modal)
if (noReport.length) {
  console.log('RENDERS 3+ DETAIL FIELDS, MOUNTS NEITHER THE CONTROL NOR THE MODAL:')
  for (const r of noReport) console.log('  ' + r.file + '   (' + r.hit.join(', ') + ')')
} else {
  console.log('Every file rendering 3+ detail fields mounts the control or the modal.')
}
console.log('')
console.log('This prints. It does not pass or fail — reportcontrol:prove is the check.')
