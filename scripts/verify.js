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
  // The positive control for the edit-assertion helper (scripts/lib/
  // assert-changed.mjs): proves it still REFUSES a check that cannot
  // distinguish before from after, and still catches a missed anchor. A
  // helper other checks lean on gets watched hardest of all. Milliseconds,
  // filesystem only, so it runs in the fast tier too.
  { name: 'assertchanged:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-assert-changed.mjs')] },
  // Everything captured at first touch — channel, referrer, country, zone.
  // Here because it is the one part of this codebase whose failure mode is
  // SILENCE: a channel that stops being captured reports 'unknown', which is
  // also what an organic signup reports, so the fault is invisible until
  // someone asks why a campaign shows nothing. That is exactly how the OAuth
  // routes went months writing neither country nor channel.
  //
  // Every case is a pair whose halves must differ — a tag against a referrer
  // inference, an external host against our own, a first touch against a
  // later one, the edge header against a stale cookie. Watched failing on
  // purpose 18 Aug 2026 with the referrer fallback reverted: four named
  // failures, exit 1, green again on restore.
  //
  // It covers the SERVER read too (geoColumnsFromRequest), which the browser
  // drive cannot: the OAuth callbacks have no browser, and that helper is the
  // only thing between a correctly-set cookie and a null column.
  // No database, no network — milliseconds, so it runs in the fast tier.
  { name: 'firsttouch:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-first-touch.mjs')] },
  // The hospitality vocabulary (lib/cvVocabulary.ts) is the reusable asset of
  // CV parsing, and its failure mode is SILENT: a lookalike character or a
  // shortest-first match returns the WRONG role rather than an error. Both
  // were caught while writing it — a Cyrillic 'о' inside a skill term, and
  // accented aliases that could never match because only the input side was
  // folded, so "maître d" became "ma tre d". Neither would have thrown.
  //
  // Every case is a pair that must come out different: senior sous against
  // sous, accented against plain. Milliseconds, no network, no database.
  { name: 'cvvocab:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-cv-vocabulary.mjs')] },
  // A REDIRECT TARGET IS A STRING, so tsc cannot see that it is dead and
  // neither can the build. That has now shipped twice: /register/employer
  // 404ing after its page was deleted, and the last click of posting a job
  // landing on a page titled "City Not Found" because /jobs/<uuid> matched the
  // /jobs/[city] segment.
  //
  // TWO CHECKS, because the obvious one PASSES on the second fault — the
  // plural path does resolve, just to the wrong route. So it also asserts that
  // an interpolated identifier lands in an id-shaped segment. It reads
  // next.config redirects as well, or it reports /subscribe as dead, and a
  // check that cries wolf about a URL that plainly works is one nobody trusts
  // by the end of the week. Filesystem only, milliseconds, fast tier.
  { name: 'redirects:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-redirect-targets.mjs')] },
  // The employer's own view of their advert. Its fault class is invisible to
  // a browser drive on our data: Thrive Test Employer's four adverts all have
  // a null banner, so the fallback they render is the correct output and the
  // bug only appears on a row we are not allowed to drive. Pure functions, no
  // network, no database.
  { name: 'employercard:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-employer-card.mjs')] },
  // WHATEVER SOMEONE UPLOADS HAS TO COME OUT USABLE. Four branches decide
  // how an image meets the 16:11 card slot, and a check that only fed it a
  // tidy landscape photo would pass while three of them were broken. Each
  // branch gets a fixture built with sharp, in memory, every run.
  { name: 'bannertreatment:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-banner-treatment.mjs')] },
  // WHO GETS EMAILED IS THE WHOLE RISK of the reminder feature, so the rules
  // that decide it are asserted rather than read. Most of these prove a
  // REFUSAL — a scraped listing, an advert posted yesterday, one asked about
  // last week — because the dangerous direction is a false positive, and a
  // false positive here is somebody's inbox.
  { name: 'reminders:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-job-reminders.mjs')] },
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
