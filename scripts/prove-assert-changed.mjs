#!/usr/bin/env node
//
// PROVE assert-changed CAN FAIL — the positive control, run on every verify.
//
// Same standard as guard:prove and hold:prove: a helper nobody has watched
// refuse something is prose with an import statement. Every case below is a
// real failure this project has already had, rebuilt in a temp directory, and
// the assertion is about the HELPER's behaviour — including, above all, that
// it REFUSES when it must. A helper that cannot be made to fail on demand
// does not get to sit under anyone's edit script.
//
// No database, no network, no writes outside a mkdtemp directory.
//
//   npm run assertchanged:prove

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { snapshot, assertChanged, applyEdits, AssertError } from './lib/assert-changed.mjs'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-changed-proof-'))
let pass = 0
const failures = []

function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (detail) console.log(`        ${detail}`)
  if (ok) pass++
  else failures.push(label)
}

function scratch(name, text) {
  const p = path.join(dir, name)
  fs.writeFileSync(p, text)
  return p
}

/** Runs fn and reports what the helper did: 'passed' or the AssertError kind. */
function outcome(fn) {
  try { fn(); return 'passed' } catch (e) {
    if (e instanceof AssertError) return e.kind
    throw e
  }
}

// ── 1. THE POSITIVE CONTROL THAT MATTERS MOST: `present` already matched
//       before the edit, so the check cannot distinguish the two states.
//       The helper MUST refuse. If this case reports 'passed', the helper is
//       theatre and this whole file exits 1.
//
//       This is the "cron uses the constant" failure verbatim: the check went
//       looking for JOB_EXPIRY_DAYS to confirm an import was added, and found
//       it in the USAGE that had been there all along.
{
  const f = scratch('cron-route.ts', [
    "const days = JOB_EXPIRY_DAYS  // usage — present all along",
    "export async function GET() { return expire(days) }",
  ].join('\n'))
  const before = snapshot(f)
  // The "edit" that was supposed to add the import silently lands nothing —
  // but the file DOES change (an unrelated comment), as in the real incident
  // the file had other edits, so UNCHANGED alone cannot catch it.
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8') + '\n// touched\n')
  const got = outcome(() => assertChanged(before, { present: 'JOB_EXPIRY_DAYS' }))
  check('refuses a `present` needle that already matched before the edit',
    got === 'INDISTINGUISHABLE', `helper said: ${got}`)
}

// ── 2. Its mirror, same refusal: a `gone` needle that was never there.
{
  const f = scratch('gone-mirror.ts', 'nothing interesting\n')
  const before = snapshot(f)
  fs.writeFileSync(f, 'still nothing interesting\n')
  const got = outcome(() => assertChanged(before, { gone: 'the-old-line' }))
  check('refuses a `gone` needle that had zero matches before the edit',
    got === 'INDISTINGUISHABLE', `helper said: ${got}`)
}

// ── 3. A count that did not move: guarded ternary keeps the substring, so a
//       count equal to the before-count proves nothing and must be refused.
{
  const f = scratch('ternary.tsx', 'label + ` / ${formData.salaryPeriod}`\n')
  const before = snapshot(f)
  fs.writeFileSync(f, 'label + (period ? ` / ${formData.salaryPeriod}` : "")\n')
  const got = outcome(() => assertChanged(before, { count: ['${formData.salaryPeriod}', 1] }))
  check('refuses a count identical to the before-count',
    got === 'INDISTINGUISHABLE', `helper said: ${got}`)
}

// ── 4. A genuine change passes — the helper must not cry wolf.
{
  const f = scratch('genuine.ts', "import a from 'a'\nconst x = old()\n")
  const before = snapshot(f)
  fs.writeFileSync(f, "import a from 'a'\nimport b from 'b'\nconst x = neu()\n")
  const got = outcome(() => assertChanged(before, { gone: 'old()', present: "import b from 'b'" }))
  check('passes a genuine, distinguishable change', got === 'passed', `helper said: ${got}`)
}

// ── 5. "import added": the String.replace whose anchor never matched.
//       applyEdits must throw MISS and write NOTHING, not print a label.
{
  const f = scratch('sendmail.ts', 'await sendEmail(email, subject, html)\n')
  const bytes = fs.readFileSync(f, 'utf8')
  const got = outcome(() => applyEdits([[f, 'anchor that is not in the file', 'replacement']]))
  const untouched = fs.readFileSync(f, 'utf8') === bytes
  check('applyEdits throws MISS on a missing anchor and writes nothing',
    got === 'MISS' && untouched, `helper said: ${got}; file untouched: ${untouched}`)
}

// ── 6. applyEdits does the whole job when the anchor is real: edit lands,
//       counts prove it, and the file on DISK holds the new text.
{
  const f = scratch('wire.ts', [
    'await sendEmail(a, s, h)',
    'await sendEmail(b, s, h)',
  ].join('\n'))
  const got = outcome(() => applyEdits([
    [f, 'await sendEmail(a, s, h)', "await sendEmail(a, s, h, { emailType: 'x' })"],
  ]))
  const now = fs.readFileSync(f, 'utf8')
  const ok = got === 'passed'
    && now.includes("await sendEmail(a, s, h, { emailType: 'x' })")
    && now.includes('await sendEmail(b, s, h)')
  check('applyEdits lands a real edit and leaves the untouched call alone', ok, `helper said: ${got}`)
}

// ── 7. The edit landed but left the WRONG state — old line still present
//       elsewhere. gone must fail as GONE, not pass on "the new text exists".
{
  const f = scratch('half-done.ts', 'old()\nold()\n')
  const before = snapshot(f)
  fs.writeFileSync(f, 'neu()\nold()\n')
  const got = outcome(() => assertChanged(before, { gone: 'old()' }))
  check('fails GONE when the old text survives anywhere', got === 'GONE', `helper said: ${got}`)
}

// ── 8. No snapshot, no service: calling without a before-snapshot is refused,
//       because "I'll just check the file now" is the whole disease.
{
  const got = outcome(() => assertChanged(undefined, { present: 'x' }))
  check('refuses to run without a before-snapshot', got === 'NO_SNAPSHOT', `helper said: ${got}`)
}

fs.rmSync(dir, { recursive: true, force: true })

console.log(`\n  ${pass} passed, ${failures.length} failed`)
if (failures.length) {
  console.log('\n  A verification helper that fails its own positive control is')
  console.log('  worse than none — nothing above this may be trusted until fixed.')
  process.exitCode = 1
}
