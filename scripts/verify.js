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
  // THE APPLY GATE IS A SIGN-UP SCREEN, NOT A LOGIN SCREEN.
  //
  // The fault this whole week started with. The gate was /login/employee,
  // headed "Create a free account to apply" since 15 August — over an EMAIL
  // AND PASSWORD LOGIN FORM with a Login button. A stranger read the
  // invitation, typed an email, invented a password, pressed the only button
  // on the screen and got "Invalid login credentials". Paul did it three times
  // on his own phone before anyone knew.
  //
  // THE HEADING HAD BEEN FIXED AND THE FORM HAD NOT, which is why this does
  // NOT check the heading. A check asking "does it say Create a free account"
  // passed happily for the entire week the fault was live. It checks that the
  // gate renders a SIGN-UP form, offers no password sign-IN, and that BOTH
  // Apply call sites point at it — the job page and the board modal, because
  // fixing only the one somebody noticed is this codebase's oldest habit.
  //
  // Watched failing on purpose 23 Aug 2026 by pointing Apply back at the login
  // page: exit 1, two named failures.
  { name: 'applygate:prove', cmd: npm, args: ['run', 'applygate:prove'] },
  // A PERSON NEVER READS A SENTENCE WE DID NOT WRITE.
  //
  // Both messages Paul saw on his own phone came from somebody else's library
  // and were shown to him verbatim by setError(error.message): "Invalid login
  // credentials" is Supabase's wording, "Load failed" is SAFARI's wording for
  // a fetch that never completed. He was trying to CREATE an account, so the
  // first described a state he was not even in, and the second reads as though
  // the product is broken when the phone lost signal for a second.
  //
  // It checks the PROPERTY, not the four known cases: no branch may hand back
  // the raw string, INCLUDING the fallback — which is exactly where a "just
  // show the error" hides. A check listing the known messages would pass on a
  // fifth that leaked, and a database error reaching a login screen is worse
  // than unhelpful.
  //
  // Watched failing on purpose 23 Aug 2026 by restoring the raw fallback: exit
  // 1, four named failures including the database-error leak.
  { name: 'loginerrors:prove', cmd: npm, args: ['run', 'loginerrors:prove'] },
  // ONE LOGIN, AND NOWHERE TO BE WRONG.
  //
  // Two login screens and a chooser became one form. Signing in on the wrong
  // one used to produce a dead end — "This login is for job seekers only" —
  // for somebody who had typed the RIGHT password. The role is read after the
  // session exists now and decides only where they land.
  //
  // THE REDIRECTS ARE THE RISKY PART, not the form. 79 references across 51
  // files point at the two old paths, plus bookmarks, nine sent emails and
  // Google's index — and deleting a page turned /register/employer into a 404
  // once already. Both still resolve AND carry the query, because everything
  // that bounces somebody there sends ?redirect= and dropping it lands them on
  // a dashboard instead of the page they were opening.
  //
  // It also asserts the seven things the old screen carried — Remember me per
  // BROWSER, the pending-confirm notice and its resend, the OAuth wrong-role
  // notice, the webview hint, ?registered, and redirect threading. Each was
  // earned by a real fault; losing one in a rewrite reintroduces a bug
  // somebody already paid for.
  //
  // Watched failing on purpose 23 Aug 2026 by dropping the query from the
  // redirect — the silent way this breaks. Exit 1, one named failure.
  { name: 'unifiedlogin:prove', cmd: npm, args: ['run', 'unifiedlogin:prove'] },

  // THE CONSENT LANE IS RESERVED, NOT OVERLAID. The cookie banner has covered
  // the Apply button on a job post (13 Aug 2026 — it cost Javier Salido his
  // application) and the password field on the apply gate (22 Aug). Both were
  // "fixed" by moving the control, which leaves the next new screen to break
  // the same way, and it did. The banner publishes its height as --consent-h
  // and body reserves it once, from the shell.
  //
  // It asserts the AGREEMENT between the published height and the drawn box —
  // not either number — because this repo already has the scar where
  // `width: 112px` rendered at 145 and a --sticky-offset of 40 sat against a
  // cell rendering at 52.
  //
  // Watched failing on purpose 23 Aug 2026 by growing the drawn box past the
  // published height and swapping the reserve to a margin. Exit 1, three named
  // failures, the other nine still reporting.
  { name: 'consentlane:prove', cmd: npm, args: ['run', 'consentlane:prove'] },

  // NO COLOUR EMOJI ON ANY SURFACE A STRANGER SEES. components/icons.tsx has
  // said this since 14 Aug 2026 and had nothing behind it; seven got in anyway
  // — three clocks, two hourglasses, a party popper, and a video camera in an
  // email that reaches real inboxes.
  //
  // It splits COLOUR emoji from TEXT glyphs on Unicode's own Emoji_Presentation
  // property, because the monochrome ones (© ↔ ⬇ ⚠ ↗) are typography and are
  // deliberately kept — Paul's decision of 14 Aug, recorded in icons.tsx.
  //
  // Its controls are inline literals and run FIRST: if the detector cannot find
  // a glyph known to be there it exits reporting no count at all. This repo has
  // had an emoji grep return nothing while a pencil sat in the file it had just
  // read, and a control that began failing ON SUCCESS because it pointed inside
  // the population being swept.
  //
  // Watched failing on purpose 23 Aug 2026 by putting one emoji back in the UI
  // and one back in the email: exit 1, both named with file and line.
  { name: 'noemoji:prove', cmd: npm, args: ['run', 'noemoji:prove'] },

  // THE DUPLICATE CHECK MUST NOT FAIL SILENTLY.
  //
  // Three paths returned null without a trace — no match key, a lookup error,
  // and a thrown exception — so a dedup that had stopped working entirely
  // looked EXACTLY like a dedup finding no duplicates: profile visible,
  // unheld, nothing written anywhere. The only evidence was a console line in
  // a serverless log this project cannot read back a day later.
  //
  // The load-bearing assertion is the one named "SO THE TWO ARE
  // DISTINGUISHABLE FROM THE ROW ALONE" — checked-clean versus never-checked.
  // That question had the SAME ANSWER in both states before this change, so
  // asking it proved nothing; it now has two.
  //
  // A stub client rather than the database, so it runs here every time. It can
  // also force the lookup to error, which is the case that matters most and
  // the one a real database will not do on request.
  //
  // Watched failing on purpose 26 Aug 2026 by deleting the three recording
  // calls: exit 1, FOURTEEN named failures, the process still reporting every
  // one of them rather than dying on the first. Green again on restore.
  { name: 'dedupsilence:prove', cmd: npm, args: ['run', 'dedupsilence:prove'] },

  // SIGN IN WITH APPLE — the button, and the gate in front of it.
  //
  // It cannot work until a Services ID and a signing key exist in Supabase,
  // which are Paul's portal items. Until then signInWithOAuth returns
  // "Unsupported provider" and the person is left on a dead button. A sign-in
  // button that signs nobody in is worse than no button — it reads as our
  // product being broken, on the screen where that costs most.
  //
  // So the load-bearing property is the DIRECTION of failure: everything
  // except the exact string 'true' means off. Being wrongly off costs a
  // missing option; being wrongly on costs a dead one in front of real people.
  // It also asserts that exactly ONE file starts an Apple flow, so the gate
  // cannot be bypassed by a second call site.
  //
  // Watched failing on purpose 26 Aug 2026 by swapping the exact-string test
  // for a truthiness check — the realistic mistake: exit 1, seven named
  // failures, one per plausible wrong value.
  { name: 'applesignin:prove', cmd: npm, args: ['run', 'applesignin:prove'] },

  // THE APPLE CLIENT SECRET IS SIGNED CORRECTLY.
  //
  // Apple's OAuth client secret is a signed JWT, not the .p8 — Supabase
  // refuses the key with "Secret key should be a JWT" and is right to.
  //
  // A JWT WITH PERFECT CLAIMS AND A BAD SIGNATURE IS BYTE-FOR-BYTE PLAUSIBLE.
  // Nothing about it looks wrong; it fails only at Apple, by which point it is
  // pasted into Supabase, live, and every Apple sign-in is broken with nothing
  // on our side to look at. So the signature check matters more than all the
  // claim checks together, and it has a control: the same token must NOT
  // verify against a different key.
  //
  // It signs with a throwaway EC key generated in-process, so it runs here on
  // any machine with no key material anywhere near the repo — while still
  // exercising the functions scripts/apple-client-secret.ts calls.
  //
  // Also covers the two traps: ES256 needs raw r||s, not Node's default DER
  // (asserted as 64 bytes), and alg must be checked AGAINST ES256 rather than
  // read from the token — an alg:none header with an empty signature passes
  // every claim check there is.
  { name: 'applesecret:prove', cmd: npm, args: ['run', 'applesecret:prove'] },
  // THE TEAM-INVITE CODE — a stronger proof of the same claim, not a weaker
  // gate. accept_employer_invite compares the signed-in address to the invited
  // one as strings; a code sent to the invited mailbox proves the thing that
  // string was standing in for. A string can be typed by anybody.
  //
  // The load-bearing assertions are the binding ones: a code must open ONE
  // invite, for ONE address, for about half an hour. A code that opened any
  // invite would be weaker than what it replaced AND would pass every
  // happy-path test identically.
  //
  // Watched failing on purpose 26 Aug 2026 by dropping the member id out of
  // the HMAC payload: exit 1, three named failures, including the one that
  // exists to stop the other two passing for the wrong reason.
  { name: 'invitecode:prove', cmd: npm, args: ['run', 'invitecode:prove'] },

  // THE HOME HERO IS THE JOB SEARCH, and every number on it comes from the
  // rows. The design gave three figures that were true the day it was drawn:
  // 251 roles, a salary on every one, and NEWEST TODAY. Typed in, the first
  // goes stale silently, and the other two are FALSE TODAY — two imported
  // rows store a literal 0 in both salary columns, and nothing was posted
  // today. All three are computed.
  //
  // It also asserts every class the page uses has a rule behind it. Rebuilding
  // the hero orphaned three that the closing section still used, and a CSS
  // module hands back undefined for a class it lacks — no error, no type
  // failure, just an unstyled row nobody sees until a screenshot.
  //
  // Watched failing on purpose 23 Aug 2026 by typing the count in, swapping
  // the salary test to the not-null one that both bad rows pass, and orphaning
  // a class. Each named its own failure.
  { name: 'herosearch:prove', cmd: npm, args: ['run', 'herosearch:prove'] },

  // THE FEED'S EXPIRY DATE ROLLS FORWARD RATHER THAN SITTING IN THE PAST.
  //
  // The fault this watches was invisible from our side: the date goes only to
  // Adzuna, Jooble, Jora and Talent.com, and nothing reads it back. On
  // 24 Aug 2026, 23 of 247 live adverts were being distributed already marked
  // dead and 208 of 247 were within a month of it, while the board looked fine.
  //
  // THE LOAD-BEARING CHECK GENERATES TWICE WITH A FORCED GAP. One generation
  // cannot tell a rolling horizon from a frozen constant — both look correct
  // today. The gap is forced by passing feedExpiryHorizon its own `now`
  // argument, which is a real parameter of the shipped function rather than a
  // mocked clock.
  //
  // Watched failing on purpose 24 Aug 2026, twice: freezing the horizon at a
  // constant took it to 12/15 — and NOT the past-date check, which is the whole
  // argument for generating twice — and restoring posted_at + 60 took it to
  // 10/15. Green on restore both times.
  { name: 'feedexpiry:prove', cmd: npm, args: ['run', 'feedexpiry:prove'] },

  // THE ERASURE PLAN IS COMPLETE, CONSISTENT AND POSSIBLE.
  //
  // Erasure is a HAND-WRITTEN list, because there is not one foreign key from
  // public to auth.users and nothing cascades. A hand-written list goes stale
  // the day someone adds a table and does not think about deletion — and the
  // failure is SILENT, because a table missing from the plan looks exactly
  // like a table with no rows.
  //
  // The assertion that matters most is the storage matcher across all FIVE
  // layouts, including the bare <uuid>/ one where the owner is the first path
  // segment rather than the second. 23 of the 83 objects live there, and a
  // matcher that assumes a prefix is how 51 files were orphaned.
  //
  // It also asserts each of the five decisions individually, so quietly
  // reversing one is a failing check rather than a diff nobody reads.
  // THE CENSUS. Two accounts survive only because nobody has run the wrong
  // thing: the credential Apple signs in with to review the app, and the
  // tombstone owner that every row outliving a deleted person points at.
  //
  // NOTHING WOULD RECORD EITHER LOSS. `is_test` is a label nothing consults
  // before deleting; there is no instrument for a self-deletion; and a sweep by
  // email pattern is exactly how +demo and +e2e went on 14 Aug 2026. Losing the
  // review credential shows up months later as a rejected app update with no
  // visible cause. Losing the tombstone destroys every archived advert, signed
  // contract and anonymised message by the cascade it exists to defeat.
  //
  // It cannot PREVENT either — a `before delete on auth.users` trigger would,
  // and is held because it is a migration on auth.users during an open review.
  // This makes the loss impossible to miss instead.
  //
  // Reads only. Needs the database, so it SKIPS (exit 2) without a service key,
  // and the skip says in as many words that it is not a pass. Watched failing
  // on purpose against a wrong id: the account is named, what breaks is printed
  // in full inside a banner, exit 1.
  { name: 'protected:prove', cmd: npm, args: ['run', 'protected:prove'], couldNotRun: 2 },

  { name: 'erasure:prove', cmd: npm, args: ['run', 'erasure:prove'] },

  // TWO GATES THAT DECIDE THE SAME THING MUST DECIDE IT FROM THE SAME FACT.
  // The delete panel branched on user_metadata.role while /api/account/delete
  // checked for an employer_profiles row — and the three team-invite routes
  // stamp role:'employer' on members who own no row. So a team member was told
  // "your account is closed by hand, email us" about an account the API would
  // have deleted on request: we refused a right to the one class of user
  // entitled to it, and neither half errored.
  //
  // It asks about the JSX BRANCH form specifically, because `userType ===
  // 'employer'` is legitimately used three times in that file to pick which
  // table to read. And it strips comments before asking whether the route
  // gates on metadata — the route's own comment explains why it must not, and
  // the first run of this check reported that prose as the fault.
  // Filesystem only, milliseconds, fast tier. Watched failing on purpose by
  // restoring the old branch: two named failures, exit 1, green on restore.
  { name: 'deletiongatekey:prove', cmd: npm, args: ['run', 'deletiongatekey:prove'] },

  // THE PLAN AND THE EXECUTION ARE DIFFERENT CLAIMS, so they get different
  // checks. erasure:prove above reads the RULES — that 'employer_notes' is
  // listed in nullColumns. A plan can list a column the executor never
  // applies: a mistyped name, a filter that matches nothing, a path that
  // returns before it writes — and every rule assertion still passes.
  //
  // This one seeds a note that names a candidate, runs the erasure, and READS
  // THE ROW BACK. Its control is the half that makes it mean anything: the
  // note must be PRESENT before and ABSENT after, because "null afterwards" is
  // also true of a note nobody ever wrote.
  //
  // couldNotRun: 2 — it needs the database, and it SKIPS rather than fails
  // without a service key, exactly as the migration check does. A guard that
  // reddens on a missing credential teaches people to reach for --no-verify.
  { name: 'erasurelive:prove', cmd: npm, args: ['run', 'erasurelive:prove'], couldNotRun: 2 },

  // iosshell:prove IS IN THIS LIST, unlike the other two recent additions, and
  // the reason is the rule rather than the topic: it is filesystem and text
  // only — no Mac, no build, no deployment, no database — so it runs by
  // default on every machine and can never be a red nobody expects.
  //
  // What it actually watches is the AGREEMENT between three files nothing
  // links together: the bundle id Apple has registered (lib/appleSignIn.ts),
  // the one Capacitor writes (capacitor.config.ts), and the one that ships
  // (project.pbxproj). Watched failing on purpose with a mismatched appId:
  // one named failure, exit 1, green again on restore.
  { name: 'iosshell:prove', cmd: npm, args: ['run', 'iosshell:prove'] },

  // iosassets:prove EXISTS BECAUSE RUN #4 WAS REFUSED BY APPLE FOR AN ICON
  // THAT HAD BEEN SITTING ON THE MACHINE ALL ALONG. .gitignore line 14 is
  // '*.png' and had exceptions for public/ and app/ but never for ios/, so
  // AppIcon-512@2x.png and three splash images were never committed.
  //
  // THE REASON NOTHING WENT RED IS THE PART WORTH KEEPING: actool treats an
  // image that a Contents.json NAMES but cannot find as a WARNING. The
  // archive succeeded, all ten of its assertions passed, a signed .ipa came
  // out — and it contained no Assets.car at all. Two jobs and one dispatch
  // later Apple said so, in five errors.
  //
  // So it does not ask whether the file is on this disk. It was. It asks
  // whether it is IN GIT, because the runner gets the repository and
  // nothing else. Watched failing on purpose by un-staging the icon —
  // exactly run #4's state — one named failure, exit 1, green on restore.
  { name: 'iosassets:prove', cmd: npm, args: ['run', 'iosassets:prove'] },

  // signedimage:prove EXISTS BECAUSE THE GOOD ANSWER WAS ALREADY IN THE
  // CODEBASE AND NOBODY APPLIED IT OUTWARD. SignedImage resolves its URL in a
  // useEffect and renders `fallback` while it does — or NOTHING when no
  // fallback is passed. Four of seventeen call sites passed one; the other
  // thirteen showed an empty box while signing, and an empty box forever if
  // the image failed.
  //
  // IT COUNTS ELEMENTS RATHER THAN LINES, which is the whole reason it is a
  // script and not a habit: `grep -n "<SignedImage"` counts LINES and cannot
  // see a multi-line element, and it under-reported this population three
  // times running before anything was written down.
  //
  // Filesystem only, so it runs on every machine and can never be a red
  // nobody expects. Watched failing on purpose by deleting one fallback:
  // one named failure with its file and line, exit 1, green on restore.
  { name: 'signedimage:prove', cmd: npm, args: ['run', 'signedimage:prove'] },

  // weboauth:prove IS THE CHECK THAT MATTERS MOST ON THE NATIVE WORK, and it
  // is here rather than outside verify because it needs nothing but the
  // filesystem and one imported function — no device, no deployment.
  //
  // The site is live and 27 candidate signups are real. The native OAuth
  // branch sits in the middle of the Google sign-in path, so "it only runs on
  // native" has to be a measurement rather than a claim: the REAL guard is
  // imported and called under every shape a browser presents, no shipped file
  // may statically import @capacitor (which would put the runtime in the web
  // bundle whatever the guard returns), and the original web call must still
  // be there without skipBrowserRedirect.
  //
  // Watched failing on purpose by adding a static import to the button: two
  // named failures, exit 1, green on restore.
  { name: 'weboauth:prove', cmd: npm, args: ['run', 'weboauth:prove'] },

  // deletegate:prove IS DELIBERATELY NOT IN THIS LIST, the same way
  // rlsprobe:prove is not.
  //
  // It proves an employer cannot self-delete, and it does that by CREATING
  // AND DELETING REAL ACCOUNTS against a deployed route. Two things follow:
  // it needs a base URL nobody can guess for it, and it needs that
  // deployment to be one CARRYING the gate — pointed at a build without it,
  // the fixture employer is really erased.
  //
  // Wired in here it SKIPPED on every machine and every push, because there
  // is no URL to give it by default. That turns `verify` permanently
  // NOT VERIFIED, and a check that is expected to be red is a check nobody
  // reads — which is the argument this file exists to protect.
  //
  //   npm run deletegate:prove -- https://<the-deployment-carrying-the-gate>
  //
  // It was watched failing for real: run against production, which did not
  // yet have the gate, the employer fixture was deleted and three assertions
  // went red. Same script, two deployments, opposite answers.
  //
  // navheight:prove IS NOT HERE EITHER, for the same reason: it measures
  // RENDERED GEOMETRY in a real browser, so it needs a deployment and must
  // not guess which one. It exits 2 with SKIP given no URL.
  //
  //   npm run navheight:prove -- https://<deployment>
  //
  // Watched failing on production before the fix: 5 named failures —
  // --nav-height 3.19px short of the header it describes, /jobs hiding its
  // own h1 behind it, and /temp-work's heading at y413 of an 844px screen.
  // Green on the fixed build. It needs no account and no fixture: every
  // route it visits is public, deliberately, because an auth-gated route
  // measured signed out reports on the login page instead.
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
