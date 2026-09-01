// EVERY ADVERT RENDERER CARRIES THE RIGHT-TO-WORK LINE.
//
//   node scripts/prove-right-to-work-everywhere.mjs
//
// Filesystem only. No network, no database, milliseconds.
//
// ── THE FAULT THIS EXISTS FOR ─────────────────────────────────────────────
//
// On 1 Sept 2026 the Eligibility block was added to the job advert, driven,
// verified, merged — and an employer was told in writing that it was live.
// It had reached TWO OF SEVEN renderers.
//
// Nobody knew there were seven. The count went 2 → 3 → 7 in a single morning
// as each search was widened: /job/[id] and the /jobs inline pane had it;
// components/JobDetailModal did not; and /jobs/recommended, /jobs/sector/
// [sector], /jobs/[city] and /saved-jobs each render their OWN inline detail
// pane as well as importing the modal. Four more copies nobody had counted.
//
// ── WHY A GREP FOR THE STRING IS NOT ENOUGH ───────────────────────────────
//
// "Does this file mention workAuthorization" passes on a file that mentions it
// in a type declaration and never renders it. And it cannot see a renderer that
// does not exist yet, which is the actual risk: the next inline pane somebody
// copies from an existing page.
//
// So the question is asked the other way round. FIND EVERY FILE THAT RENDERS
// ADVERT DETAIL — the discriminator is rendering `.requirements.map(` or
// `.benefits.map(`, which only a detail view does; a card does not — and assert
// that each one also renders workAuthorization. A new renderer is caught the
// day it is added, because it will render Requirements before anyone thinks
// about eligibility.

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

// Renders a LIST of advert detail — a card renders neither of these.
const RENDERS_DETAIL = /\.(requirements|benefits)(\?)?\.map\(/
// Renders the eligibility block itself, not merely the word.
const RENDERS_RTW = /\.workAuthorization(\?)?\.map\(/

const renderers = []
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  if (!RENDERS_DETAIL.test(s)) continue
  renderers.push({ file: f.split(sep).join('/'), hasRtw: RENDERS_RTW.test(s) })
}

renderers.sort((a, b) => a.file.localeCompare(b.file))

console.log(`${renderers.length} advert renderers found`)
console.log('')
for (const r of renderers) {
  console.log('  ' + (r.hasRtw ? 'ok   ' : 'FAIL ') + r.file)
}

const missing = renderers.filter(r => !r.hasRtw)

// A COUNT THAT CANNOT SILENTLY GO TO ZERO. If the discriminator ever stops
// matching — a refactor to a shared component, a rename — this finds NO
// renderers and would report a clean pass on a page that renders nothing of
// the sort. Seven is the number as of 1 Sept 2026; fewer means the search
// broke, not that the problem went away.
const EXPECTED_AT_LEAST = 7

console.log('')
if (renderers.length < EXPECTED_AT_LEAST) {
  console.log(`FAIL  only ${renderers.length} renderers found, expected at least ${EXPECTED_AT_LEAST}`)
  console.log('      The SEARCH has broken, not the product. Either the detail')
  console.log('      panes were consolidated — good, lower the number and say so —')
  console.log('      or this check is now looking at nothing.')
  process.exit(1)
}

if (missing.length) {
  console.log(`${missing.length} advert renderer(s) do NOT show the right-to-work line:`)
  for (const m of missing) console.log('  - ' + m.file)
  console.log('')
  console.log('  An employer was told this line is live. Every renderer must carry')
  console.log('  it, with the SAME wording and the SAME condition as /job/[id].')
  process.exit(1)
}

console.log(`all ${renderers.length} advert renderers show the right-to-work line`)
process.exit(0)
