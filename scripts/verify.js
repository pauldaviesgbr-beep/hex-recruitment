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
  // A BARE /* IN JSX CHILDREN IS TEXT AND PRINTS ON THE PAGE. One went out
  // to production and rendered four paragraphs of explanation across every
  // card on the job board. tsc passed, the build passed and three browser
  // drives passed, because all of them measured state and none read what the
  // page SAYS. Parses with the TypeScript compiler rather than a regex — the
  // regex version cried wolf 27 times out of 28.
  { name: 'jsxcomments:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-no-stray-jsx-comments.mjs')] },
  // WHEN THE WHITE GROUND COMES OFF A LOGO. That one decision got the answer
  // wrong twice on real employer logos — once by asking whether the mark was
  // dark ON AVERAGE (a thin gold circle on white reads as blank), once by
  // measuring the whole border instead of the corners. The dangerous
  // direction is a false yes: keying white out of a logo that is white type
  // on a coloured block erases the type on somebody's live advert.
  { name: 'logotreatment:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-logo-treatment.mjs')] },

  // WHAT THE NO-PHOTOGRAPH CARD SAYS. One sentence is lifted out of the advert
  // and published at 22px under the employer's name, so the failures here are
  // not layout: a half sentence ending in an ellipsis reads as scraped text, and
  // a sentence composed rather than lifted is a claim about a workplace nobody
  // at Thrive has seen. Also covers the composer the step-3 preview shares with
  // the publish path — two copies of that would let the preview promise a card
  // the board does not render.
  { name: 'jobquote:prove', cmd: npm, args: ['run', 'jobquote:prove'] },
  // THE APPLY-GATE RETURN PATH, AND THE ONE STRING NO OTHER CHECK CAN SEE.
  //
  // Half of this is a security control: safeReturnPath widened the accepted
  // input to include absolute URLs, which is the exact move that reintroduces
  // an open redirect. It is watched refusing a suffix lookalike host, a prefix
  // lookalike, a wrong scheme and a wrong port — and watched confirming that
  // safeInternalPath itself was not loosened to make the new function easier.
  //
  // The other half guards emails/supabase-auth-templates.ts, whose contents are
  // PASTED BY HAND into the Supabase dashboard. Nothing else in this repo can
  // see that string: not tsc, not the build, not migrations:check. It hardcoded
  // next=/dashboard for eleven weeks while the app computed the correct return
  // path and had it silently discarded, so every candidate who signed up by
  // email from a job page was dropped on the dashboard instead of the role.
  // Two questions with different answers before and after: the hardcoded
  // destination is GONE, and {{ .RedirectTo }} is PRESENT. Asking only the
  // second would pass on a template carrying both.
  //
  // Watched failing on purpose 22 Aug 2026 by swapping the origin equality for
  // a startsWith: exit 1, two named failures, the other seventeen still green.
  { name: 'returnpath:prove', cmd: npm, args: ['run', 'returnpath:prove'] },
  // THE LOCATION LINE, ASSERTED AS A SHAPE RATHER THAN AS TWO EXAMPLES.
  //
  // "London, London" was fixed on the cards and the JOB PAGE kept its own
  // inline ternary, whose address branch was a raw template literal with no
  // filter for the missing parts. It rendered "London,  " — the town, a comma
  // pointing at nothing, two trailing spaces — on 226 of 251 live adverts, on
  // the page every LinkedIn link and every Google result lands on. It was found
  // by Paul looking at his phone. No check saw it, including the one written
  // for the fault directly above it.
  //
  // So this does not ask "is the duplicate gone" — that was true and
  // insufficient, because the duplicate and the dangling comma are two faults
  // of one line. It asks whether the returned string is MALFORMED: ends in
  // punctuation, starts with a separator, doubles a comma, runs spaces
  // together. That catches the next variant nobody has thought of yet.
  //
  // Watched failing on purpose 22 Aug 2026 by restoring the shipped template
  // literal: exit 1, nine named failures, and one of them reproduced the live
  // string "London,  " exactly. Green again on restore.
  { name: 'locationline:prove', cmd: npm, args: ['run', 'locationline:prove'] },
  // NO PREFERENCE MAY SILENTLY EMPTY THE BOARD.
  //
  // Found by Paul on his own phone: signed in, and /jobs said "No jobs match
  // your search" under a Hybrid chip he never pressed. His profile carries a
  // Hybrid work-location preference and all 251 live adverts are on site, so
  // the one personalised feature on the product could only ever return nothing
  // — for the people who had already bothered to join.
  //
  // The sector pre-set beside it ALREADY had the right guard and the
  // work-style one did not; somebody had this idea, applied it to one of the
  // two, and moved on. Third instance-not-class fault in one day, so it is a
  // rule now and this watches the rule.
  //
  // The load-bearing case is `undecided`: an empty board and an impossible
  // preference produce the same zero, and only that flag separates them. Watched
  // failing on purpose 22 Aug 2026 by deleting the guard — exit 1, two named
  // failures, and the broken version announces "We've ignored your Hybrid
  // preference" on a board that had simply not loaded yet.
  { name: 'prefsrelax:prove', cmd: npm, args: ['run', 'prefsrelax:prove'] },
  // THE PENDING-CONFIRM NOTICE EXPIRES.
  //
  // Paul's phone showed "You signed up as ...+thrivetest100@gmail.com" with a
  // Resend button, for an account DELETED the day before. Written at sign-up,
  // cleared on exactly one event (a successful password login), so for anyone
  // who abandoned a signup it was PERMANENT — 34% of the fold, above the form.
  //
  // Seven days, and cleared on CONFIRMATION as well as login: confirmation
  // happens server-side on a route that never touches this browser key, which
  // is why clicking the link in the email left the notice standing.
  //
  // The load-bearing case is the LEGACY one. Every browser that has already
  // visited holds a bare email string with no timestamp; treating those as
  // fresh would make exactly the values that caused this bug immortal. Watched
  // failing on purpose 22 Aug 2026 with the expiry removed — exit 1, seven
  // named failures, the legacy case handing back the stale address.
  { name: 'pendingconfirm:prove', cmd: npm, args: ['run', 'pendingconfirm:prove'] },
  // NO FILTER MAY OFFER A VALUE THE PRODUCT CANNOT PRODUCE — the CLASS.
  //
  // Four faults in this codebase have been this shape and each was fixed
  // alone: six disagreeing copies of the work-TYPE vocabulary (one offering
  // "Apprenticeship", a word nothing can write); the job-alert tag picker
  // where all 34 options matched zero rows; the work-LOCATION split where the
  // employer form wrote "In person" and the candidate form "On-site" with no
  // map between them; and a "Work Arrangement" filter that was offered,
  // counted in the active-filter badge, and applied NOWHERE.
  //
  // It asks what the PRODUCT can produce, not what the board currently
  // matches. A check that went red whenever an option had no live matches
  // would be red for "Remote" until Thrive broadens — true about this week's
  // data, useless as a guard, and quickly ignored.
  //
  // Watched failing on purpose 23 Aug 2026 by putting the filter back on tags
  // and un-applying Work Arrangement: exit 1, three named failures.
  { name: 'filtervocab:prove', cmd: npm, args: ['run', 'filtervocab:prove'] },
  // EVERY ADVERT MUST BE FINDABLE UNDER ITS OWN SECTOR.
  //
  // Sixteen live adverts were not. All 251 carry category='hospitality', and
  // getJobSector matched the category column against a HAND-WRITTEN list of 19
  // ids that did not include 'hospitality' — so only a title keyword could
  // rescue them, and sixteen titles had none. They fell to the 'business'
  // default: filed under Business, and invisible to anyone filtering the board
  // to Hospitality, which is the only sector on the board.
  //
  // A SEVENTH COPY OF A VOCABULARY. lib/categories.ts holds 33 ids and the list
  // typed out 19, so FOURTEEN sectors could never be matched on the column.
  // Derived now, so the next omission is impossible rather than unlikely.
  //
  // Watched failing on purpose 23 Aug 2026 by restoring the hand-written 19:
  // exit 1, five named failures, including one that names every sector dropped.
  { name: 'jobsector:prove', cmd: npm, args: ['run', 'jobsector:prove'] },
  // THE HEADER'S TWO DOORS — the only join affordance on every page.
  //
  // A DEAD href IS A STRING AND tsc CANNOT SEE IT. That has shipped twice:
  // /register/employer 404ing after its page was deleted, and posting a job
  // landing on "City Not Found". The header now carries the ONLY way to join
  // from a job post, where "Find a Job" used to be the sole affordance at
  // 5,294 sq px of chip.
  //
  // It asserts the ROUTES EXIST ON DISK, not that the strings are present;
  // that Sign up is a filled button and Log in a text link, because every
  // review will want to balance them and the imbalance IS the design; and that
  // a RETURNING person is not stranded — Log in survives on the apply gate,
  // which has no password box, so the alternative is a sign-up form with no
  // way out.
  //
  // Watched failing on purpose 23 Aug 2026 by restoring the old door and its
  // dead destination: exit 1, two named failures.
  { name: 'headerdoors:prove', cmd: npm, args: ['run', 'headerdoors:prove'] },
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
