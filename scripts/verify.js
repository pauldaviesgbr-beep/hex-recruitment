#!/usr/bin/env node
//
// EVERY CHECK, AND THE ANSWER COMES FROM EXIT CODES.
//
//   npm run verify
//
// WHY THIS EXISTS. A commit went out broken because the check that was supposed
// to catch it printed success over the top of the failure:
//
//   npx tsc --noEmit 2>&1 | head -5 && echo "tsc ok"
//
// `head` exits 0 whatever tsc did, so the `&&` fired and printed a label I had
// written directly underneath two real TypeScript errors. I read the label.
//
// That is the root of a whole family of the same mistake — the buffered pipe,
// the rel-keyed icon lookup, the closed accordion, the CSS-uppercased selector,
// the stdin parser, the guessed hostname. In each one the instrument reported,
// not the thing. Seven in a week.
//
// We already decided once that discipline is what fails: that is why
// migrations:check exists rather than a rule saying "remember to capture
// migrations". The same argument applies here, and it had now failed twice.
//
// THE RULES THIS FILE KEEPS:
//   • nothing is printed that is not derived from an exit status
//   • no pipes around the checks — output is captured whole, never truncated
//   • every check runs even if an earlier one fails, so one run gives the full
//     picture rather than the first problem
//   • the process exits non-zero if ANY check failed

const { spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

// --fast omits the production build. Used by the pre-push hook.
//
// THE SPLIT IS BY COST, NOT BY IMPORTANCE. The broken commit failed tsc FIRST;
// types are what catch that class of fault, and if they compile the build
// almost always follows. The build is the expensive check and the least likely
// to fail alone, so it earns being deliberate rather than automatic — ninety
// seconds on every push would only teach everyone to pass --no-verify, and a
// guard people are trained to skip is worse than no guard.
//
// Both modes are this one list, so the hook and the manual command can never
// drift into checking different things.
const FAST = process.argv.includes('--fast')

const ALL = [
  { name: 'tsc', cmd: process.execPath, args: [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'] },
  { name: 'build', cmd: npm, args: ['run', 'build'], slow: true },
  // Exit 2 from the migration check means "could not run" — no token, no
  // network — as opposed to "found drift". Treated as SKIPPED, not FAILED,
  // because a guard that blocks a push when the network is down teaches people
  // to reach for --no-verify by reflex, and a reflex is what this exists not to
  // rely on. That distinction was already in the pre-push hook; keeping it here
  // means the hook can defer to this script without losing it.
  { name: 'migrations', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'check-migrations.js')], couldNotRun: 2 },
  { name: 'guard:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-credibility-guard.js')] },
  // Same standard as guard:prove, and for the same reason: a fail-open nobody
  // has watched fail open is an intention, not a mechanism. This manufactures
  // an eight-day-old hold and watches it release itself.
  { name: 'hold:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-hold.js')] },
]
const CHECKS = FAST ? ALL.filter(c => !c.slow) : ALL

const results = []
const startedAt = Date.now()

for (const check of CHECKS) {
  process.stdout.write(`running ${check.name} ... `)
  // No shell, no pipe. The output is captured in full so a failure can be shown
  // whole rather than head-ed into silence.
  const r = spawnSync(check.cmd, check.args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32' && check.cmd === npm,
    maxBuffer: 64 * 1024 * 1024,
  })

  // A check that could not be STARTED is a failure, not a pass. spawnSync
  // reports that as a null status, which is falsy in all the wrong ways.
  const status = r.error ? null : r.status
  const skipped = check.couldNotRun !== undefined && status === check.couldNotRun

  // A SKIP IS TOLERATED ON A PUSH AND FATAL AT A MERGE, and the difference is
  // deliberate rather than inherited.
  //
  // A push is work in progress: blocking one because the network is down teaches
  // the --no-verify reflex this exists not to rely on. A merge is a DECISION,
  // and there a check that never ran is a hole — saying "all 4 passed" over the
  // top of it would be exactly the false label this whole script was built to
  // kill, just one level up.
  const passed = status === 0 || (skipped && FAST)
  results.push({ name: check.name, status, passed, skipped, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error })
  console.log(
    skipped ? `exit ${status} — could not run${FAST ? ', not blocking a push' : ' — NOT VERIFIED'}`
      : passed ? 'exit 0'
        : `exit ${status === null ? '(failed to start)' : status}`,
  )
}

const failed = results.filter(r => !r.passed)
const skippedNow = results.filter(r => r.skipped)

if (failed.length) {
  for (const f of failed) {
    const label = f.skipped ? 'COULD NOT RUN' : 'FAILED'
    console.log(`\n${'='.repeat(64)}\n${f.name} ${label} — exit ${f.status === null ? '(failed to start)' : f.status}\n${'='.repeat(64)}`)
    if (f.error) console.log(String(f.error.message))
    // The last 60 lines: enough to see the error, not the whole build log.
    const lines = f.out.split(/\r?\n/).filter(Boolean)
    console.log(lines.slice(-60).join('\n'))
  }
}

console.log(`\n${'-'.repeat(64)}`)
for (const r of results) console.log(`  ${r.skipped ? 'SKIP' : r.passed ? 'PASS' : 'FAIL'}  ${r.name}`)
console.log(`${'-'.repeat(64)}`)
const secs = ((Date.now() - startedAt) / 1000).toFixed(1)

// NEVER SAY "ALL PASSED" OVER A CHECK THAT DID NOT RUN. The whole point of this
// script is that its summary line is derived, not written — so the wording has
// to distinguish "everything was checked and was fine" from "some of it was
// never looked at".
if (failed.length) {
  const ranAndFailed = failed.filter(f => !f.skipped)
  const parts = []
  if (ranAndFailed.length) parts.push(`FAILED: ${ranAndFailed.map(f => f.name).join(', ')}`)
  if (skippedNow.length && !FAST) parts.push(`NOT VERIFIED: ${skippedNow.map(f => f.name).join(', ')} could not run`)
  console.log(`${parts.join('   |   ')}   (${secs}s)`)
  if (skippedNow.length && !FAST) {
    console.log('')
    console.log('NOT VERIFIED — a check could not run, so this is not a clean result.')
    console.log('A push tolerates that; a merge should not. Fix the cause, or run the')
    console.log('missing check yourself and say so out loud.')
  }
} else if (skippedNow.length) {
  console.log(`${results.length - skippedNow.length} passed, ${skippedNow.map(f => f.name).join(', ')} SKIPPED (fast — build not run)   (${secs}s)`)
} else {
  console.log(`all ${results.length} passed${FAST ? ' (fast — build not run; use npm run verify before merging)' : ''}   (${secs}s)`)
}

process.exit(failed.length ? 1 : 0)
