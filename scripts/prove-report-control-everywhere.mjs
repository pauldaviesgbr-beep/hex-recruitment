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

// ── AND WHERE IT SITS, NOT ONLY THAT IT EXISTS ────────────────────────────
//
// "Is it mounted" was a TRUE answer to a different question, and it is how one
// file sat wrong among seven. On app/job/[id]/page.tsx the control was mounted
// between the Eligibility block and the Requirements heading: present, visible,
// and 56% down a 3752px page with four more sections below it — rendering
// directly under "Stated by the employer on this advert", so it read as a
// footnote to Eligibility rather than as a control. Paul scrolled to the
// bottom on a handset and reported it MISSING. This check said `ok`.
//
// SO ASSERT THE ORDER. The mount must come after the LAST of the detail
// sections it belongs beneath — the same three fields used to identify a
// renderer in the first place. On the old /job/[id] the mount preceded
// `.requirements.map(`, so this would have gone red on the exact state that
// shipped.
//
// WHAT IT CANNOT SEE, SAID PLAINLY RATHER THAN GLOSSED: this is SOURCE ORDER.
// It is render order only because these are siblings in one tree, which they
// are in all seven today. It cannot see CSS that repositions an element, it
// cannot see a wrapper that moves a subtree, and it cannot tell you the
// control is 1649px from the foot rather than 40px. A drive is the only thing
// that answers the last one — scripts/drive-report-control-on-job-page.mjs
// prints the position and every heading around it.
// ── THE FIRST VERSION OF THIS ASSERTION UNDER-COUNTED, AND IT IS WORTH
//    KEEPING THE REASON ─────────────────────────────────────────────────────
//
// It compared the mount against the last `.requirements|.benefits|
// .workAuthorization.map(`. That found three misplaced files and MISSED two
// more, because on /jobs/recommended and /saved-jobs the sections that follow
// the control are "Skills Required" and "Reviews" — real sections that are not
// one of those three fields. A discriminator built from the three fields that
// IDENTIFY a renderer is not a discriminator for where an advert ENDS.
//
// So it compares against SECTION HEADINGS, split into the ones that are part
// of the advert and the ones that come after it. And a heading in neither list
// is a FAILURE, not a shrug: a new section added below the control would
// otherwise pass quietly, which is the whole fault this assertion exists for.
const JOB_SECTIONS = [
  'Job Details', 'Description', 'Full Job Description', 'Responsibilities',
  'Requirements', 'Skills Required', 'Benefits', 'Eligibility', 'Location',
  'Additional Information',
]
// After the advert: about the COMPANY or about other adverts, not about this
// job. The control ends the advert, so these may legitimately follow it.
const AFTER_THE_ADVERT = ['About', 'Reviews for', 'Similar Jobs']

const HEADING = /(?:s|S)ectionTitle\}>([^<{]*)/g

console.log('')
console.log('AND IT ENDS THE ADVERT — the mount comes after every section about the job')
console.log('')
for (const a of adverts) {
  const s = readFileSync(a.file, 'utf8')
  const mountAt = s.search(MOUNTS_CONTROL)
  if (mountAt < 0) continue

  let lastJob = null
  const unknown = []
  for (const m of s.matchAll(HEADING)) {
    const text = m[1].trim()
    if (!text) continue
    if (JOB_SECTIONS.includes(text)) { lastJob = { text, at: m.index }; continue }
    if (AFTER_THE_ADVERT.some(t => text.startsWith(t))) continue
    unknown.push(text)
  }

  if (unknown.length) {
    console.log(`  FAIL ${a.file}`)
    console.log(`       unclassified section heading(s): ${[...new Set(unknown)].join(', ')}`)
    console.log('       Add each to JOB_SECTIONS or to AFTER_THE_ADVERT in this file.')
    console.log('       Until then this cannot say whether the control ends the advert.')
    bad++
    continue
  }
  if (!lastJob) {
    console.log(`  FAIL ${a.file}   no job section headings found at all — the search has broken`)
    bad++
    continue
  }
  const ok = mountAt > lastJob.at
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + a.file.padEnd(38) +
    `last job section: "${lastJob.text}"`)
  if (!ok) {
    console.log(`       the control is at char ${mountAt}; "${lastJob.text}" still renders at ${lastJob.at}.`)
    console.log('       It is mounted, and it is in the middle of the advert.')
    bad++
  }
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

// ── SHIFT COMMENTS — THE ONLY GENUINELY USER-GENERATED SURFACE ────────────
//
// A candidate can comment on a shift post: temp_post_comments' INSERT policy is
// `user_id = auth.uid()` with NO ROLE GATE, and the comment renders publicly
// under their own name with a link to their profile. Our age-rating
// declaration to Apple lists this content; the first 1.2 pass omitted it
// because it could not be FILMED, which was the wrong test.
//
// TWO RENDERERS TODAY — the public feed and the employer's own management
// view. Found by asking which files RENDER a comment body, not by naming them,
// so a third turns this red instead of passing quietly.
const commentRenderers = []
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  // Renders a comment: maps over comment rows AND prints the body.
  if (/comments\[|TempComment/.test(s) && /\.body\}/.test(s)) {
    commentRenderers.push({ file: f.split(sep).join('/'), ok: MOUNTS_CONTROL.test(s) })
  }
}
commentRenderers.sort((a, b) => a.file.localeCompare(b.file))

console.log('')
console.log(`${commentRenderers.length} shift-comment renderers found`)
for (const c of commentRenderers) {
  if (!c.ok) bad++
  console.log('  ' + (c.ok ? 'ok   ' : 'FAIL ') + c.file)
}

// Same zero-guard as the others: a discriminator that stops matching would
// otherwise report a clean pass on nothing at all.
const EXPECTED_COMMENT_RENDERERS = 2
if (commentRenderers.length < EXPECTED_COMMENT_RENDERERS) {
  console.log(`FAIL  only ${commentRenderers.length} comment renderers found, expected at least ${EXPECTED_COMMENT_RENDERERS}`)
  console.log('      The SEARCH has broken, not the product.')
  bad++
}

// ── AND "REPORTED" IS READ BACK, NOT REMEMBERED ───────────────────────────
//
// `done` alone is component memory. It NEVER survived a remount, on any
// surface, from the day the control was built — and fourteen database
// assertions, a browser drive and this very check all passed, because every
// one of them read the label on the mount that wrote it. A person re-opening
// an advert they had just reported saw "Report this job" (3 Sept 2026, on
// camera). A PROOF THAT ONLY READS ON THE MOUNT THAT WROTE IS TESTING
// MEMORY, NOT PERSISTENCE.
//
// This is the static half: the MECHANISM must exist in the component — a
// SELECT from content_reports keyed on the reporter and the target, feeding
// setDone. The behavioural half is scripts/drive-reported-survives-remount.mjs,
// which submits on one mount and asserts the label on ANOTHER; it needs a
// deployment and credentials, so it cannot live in verify — this line can.
//
// Distinguishing, not substring-lucky: the pre-fix component touched
// content_reports exactly ONCE (the insert). The fixed one touches it twice,
// and only the fixed one selects from it.
const control = readFileSync(join('components', 'ReportControl.tsx'), 'utf8')
const touches = (control.match(/from\('content_reports'\)/g) || []).length
const selectsBack = /from\('content_reports'\)\s*[\s\S]{0,40}\.select\(/.test(control)
  && /eq\('reporter_id'/.test(control) && /eq\('target_id'/.test(control)
const feedsDone = /\bsetDone\(true\)/.test(control)
const backdropGuard = /onClick=\{sending \? undefined : close\}/.test(control)

console.log('')
console.log('the control itself')
const mech = [
  ['ReportControl reads content_reports BACK, not only writes it', touches >= 2 && selectsBack, `${touches} touch(es)`],
  ['…keyed on the reporter and the target, feeding done', selectsBack && feedsDone, ''],
  ['…and the backdrop is deaf while sending, same as Cancel', backdropGuard, ''],
]
for (const [label, ok, detail] of mech) {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(62) + detail)
}

console.log('')
if (bad) {
  console.log(`${bad} FAILED`)
  process.exit(1)
}
console.log('every advert renderer, the thread view and both comment renderers carry the shared controls')
process.exit(0)
