// EVERY PLACE A CANDIDATE CAN REACH AN ADVERT OR A THREAD CARRIES A REPORT
// CONTROL — AND IT IS THE SAME ONE.
//
//   node scripts/prove-report-control-everywhere.mjs
//
// Filesystem only. No network, no database, milliseconds.
//
// ── WHY THIS IS WRITTEN THE WAY IT IS ─────────────────────────────────────
//
// The right-to-work line was added to two of seven advert renderers on
// 1 Sept 2026, driven, verified, merged, and an employer was told it was live.
// Nobody knew there were seven. `rtw:prove` was written that afternoon to stop
// it happening again, and this is the same check for the report control, built
// at the same time as the feature rather than after the next miss.
//
// IT ASKS WHICH FILES RENDER ADVERT DETAIL, not which files mention reporting.
// A grep for "ReportControl" passes on a file that imports it and never mounts
// it, and cannot see a renderer that does not exist yet — which is the actual
// risk, the next inline pane copied from an existing page.
//
// ── AND IT ASSERTS THE CONTROL IS THE SHARED ONE ──────────────────────────
//
// Seven copies of a reason list is seven chances to drift. The old dead button
// in JobDetailModal was one such copy: `<button className={styles.reportBtn}>`
// with no onClick, which nothing could distinguish from a working control by
// reading the page. So this requires the COMPONENT, not a button that says
// "report".

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
const RENDERS_ADVERT = /\.(requirements|benefits)(\?)?\.map\(/
// Mounts the shared control, rather than merely importing or naming it.
const MOUNTS_CONTROL = /<ReportControl\b/

let bad = 0

const adverts = []
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  if (!RENDERS_ADVERT.test(s)) continue
  adverts.push({ file: f.split(sep).join('/'), ok: MOUNTS_CONTROL.test(s) })
}
adverts.sort((a, b) => a.file.localeCompare(b.file))

console.log(`${adverts.length} advert renderers found`)
console.log('')
for (const a of adverts) {
  if (!a.ok) bad++
  console.log('  ' + (a.ok ? 'ok   ' : 'FAIL ') + a.file)
}

// SAME GUARD AS rtw:prove. If the discriminator ever stops matching, this would
// find no renderers and report a clean pass on nothing at all.
const EXPECTED_ADVERT_RENDERERS = 7
if (adverts.length < EXPECTED_ADVERT_RENDERERS) {
  console.log('')
  console.log(`FAIL  only ${adverts.length} renderers found, expected at least ${EXPECTED_ADVERT_RENDERERS}`)
  console.log('      The SEARCH has broken, not the product.')
  bad++
}

// ── THE THREAD, WHICH HAS EXACTLY ONE HOME ────────────────────────────────
//
// Surveyed 1 Sept 2026 before building: app/messages/page.tsx is the ONLY place
// a person-to-person thread is rendered. app/jobs/page.tsx CREATES a
// conversation when someone applies but never renders one, and ChatBot is the
// "Ask Thrive" support widget, which is not a conversations row at all.
// Asserted rather than remembered, so a second thread view cannot appear
// without this going red.
const THREAD_VIEW = 'app/messages/page.tsx'
const threadViews = []
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  // Renders a thread: maps over message rows AND shows who sent them.
  if (/messages\.map\(/.test(s) && /sender_id|senderId/.test(s)) {
    threadViews.push(f.split(sep).join('/'))
  }
}

console.log('')
console.log(`${threadViews.length} thread view(s): ${threadViews.join(', ') || 'none'}`)

if (threadViews.length !== 1 || threadViews[0] !== THREAD_VIEW) {
  console.log(`FAIL  expected exactly one thread view (${THREAD_VIEW})`)
  console.log('      A second one needs the report and block controls too.')
  bad++
} else {
  const s = readFileSync(THREAD_VIEW, 'utf8')
  const hasReport = MOUNTS_CONTROL.test(s)
  const hasBlock = /BlockControl\b/.test(s)
  console.log('  ' + (hasReport ? 'ok   ' : 'FAIL ') + 'the thread view mounts the report control')
  console.log('  ' + (hasBlock ? 'ok   ' : 'FAIL ') + 'the thread view mounts the block control')
  if (!hasReport) bad++
  if (!hasBlock) bad++
}

console.log('')
if (bad) {
  console.log(`${bad} FAILED`)
  process.exit(1)
}
console.log('every advert renderer and the thread view carry the shared controls')
process.exit(0)
