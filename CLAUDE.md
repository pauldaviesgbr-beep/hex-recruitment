# Thrive — working agreements

Standing rules for Claude Code on this project. These override default behaviour.

## Process

- **Read-only / diagnosis prompts must not write code, create branches, or modify the database or storage without explicit approval.** When a task is framed as a diagnosis / "map & plan" / read-only, produce a findings report + a proposed plan (with migration SQL for review) and STOP for the go before building or applying anything.

- **Branch only. Nothing merges until Paul says go.** Work on a branch off `main`, push it, report. Merging, deploying and closing a branch are his call, every time — including when the work is obviously finished.
- **Diagnose first, then STOP, for anything non-trivial.** Report findings and a proposed plan, and wait. Being blocked is cheaper than undoing.
- **Reports come back as a Gmail draft, subject `claude code report`.** Not as chat alone — the draft is what he reads and forwards.
- **READ THE CLOCK FOR EVERY REPORT HEADER. DO NOT WRITE THE TIME FROM A SENSE OF HOW LONG THINGS TOOK.** On 26 Aug 2026 four consecutive reports carried invented `~HH:MM` headers, the last one out by **more than two hours** — it said 11:00 UTC when the actual time was 08:45. It surfaced only because a log query came back empty and the reason was that the window had been asked for **in the future**.
  - **This is not cosmetic on a ROLLING draft.** The draft is refreshed in place, so the timestamp in it is the ONLY staleness check a fresh session — or Paul, hours later — has for whether it describes now or this morning.
  - Git shas and log timestamps were never affected; those come from tools. It is only the line a person types. `date -u` costs nothing.

## Saying what you actually did

- **Say plainly what you DROVE and what you only READ. Never dress up one as the other.** "Verified" means a browser was pointed at it and something was clicked. If a state could not be reached — no data existed, the account was wrong, it would have touched real rows — say so and say why, rather than reasoning about the code and calling that verification. Every UI bug found on this project so far was found by a person unable to click something, never by reading.
- Give rollback targets **read at the time**, not from memory.

## Live data and email

- **The 247 live listings, and all Host and Goldenkeys data, are READ ONLY.** Real employer and candidate rows are read-only too, without Paul's explicit per-task authorisation naming the rows.
- **The preview shares production's database AND a live Resend key.** So the dangerous surface is not the UI, it is the triggers. Before any action that could notify or email, check from the rows *who it would reach*. Never send to an address that isn't Paul's or a test account's.
- Guard destructive writes with a condition that makes the wrong target impossible (`and status = 'filled'`, an explicit id list), and count dependent rows **before and after** so "nothing cascaded" is a measurement, not a hope.
- **Before publishing a test job with `status = 'active'`, check `job_alerts` is empty — and if it isn't, STOP and ask.** Posting fires `/api/job-alerts/match`, so the moment that table has rows a test post can email real candidates. It is empty today, which is the only reason publishing a throwaway ad to verify step 3 is safe; the marketing push is what will put rows in it. The rule is "check first", not "test posts are fine". Keep the row live for seconds, count dependents before deleting, and prove the board is back to 247 afterwards.
- **Clean up what you create**, and state in every report what was made and whether it still exists.
- **A test account is not two rows — enumerate the dependents BEFORE deleting, not after.** Creating one auth user on 5 Aug 2026 also created a row in `employees`, a table neither of us would have named. It was found by checking all sixteen tables carrying a candidate id, not by deleting the two that were obvious. `information_schema.columns` will list them: `candidate_id`, `user_id`, `sender_id`, `viewer_id`.
- **THERE IS NOW A THIRD ACCOUNT AND IT MUST SURVIVE THE NEXT CENSUS: `pauldavies.gbr+applereview@gmail.com`, uid `4ba92141-677d-4422-91cf-9b6f4e0067ca`, created 30 Aug 2026.** It is not a fixture. **IT IS THE CREDENTIAL APPLE SIGNS IN WITH TO REVIEW THE APP**, pasted into App Store Connect under App Review Information, and it is expected to work months from now when an update is reviewed.
  - **A SWEEP BY EMAIL PATTERN WOULD DELETE IT.** That is exactly how `+demo` and `+e2e` went on 14 Aug. If these credentials stop working, Apple rejects an update and there is no visible cause — the app simply does not let the reviewer in.
  - It carries a real-looking name (Marcus Hale), a generated avatar, a built CV, four saved jobs and two applications. The applications are against **Thrive Test Employer's own filled adverts only** — an application against a live advert emails a real employer, and Goldenkeys and Host are real companies.
  - **DO NOT "TIDY" IT, do not rename it, and do not delete it without checking what is in App Store Connect first.**

- **THERE ARE EXACTLY TWO TEST ACCOUNTS. USE THEM. DO NOT MINT ANOTHER.** Decided 14 Aug 2026, when the census found four aliases and deleted two:
  - `pauldavies.gbr+employer@gmail.com` — the employer side. Owns **Thrive Test Employer** and its 4 `filled` ads (none on the live board; leave them, several drives assert against them).
  - `pauldavies.gbr+candidate@gmail.com` — the candidate side. Carries 3 applications, all against Thrive Test Employer's own ads, none against a real employer.
  - Passwords come from the environment (`TEST_ACCOUNT_PASSWORD` / `TEST_EMPLOYER_PASSWORD` in `.env.local`), never a literal in a script. A permission test that needs a **limited member** creates a throwaway member under Thrive Test Employer and deletes it in the same run — membership rows live in `employer_members` keyed by the employer PROFILE id, not the owner's user id.
  - `pauldavies.gbr@gmail.com` (no plus) and `paul@thrivecareer.co.uk` are **Paul's real accounts**, not fixtures. Never delete, never drive, never write to.

## Previews and secrets

- **Use `VERCEL_AUTOMATION_BYPASS_SECRET` as a header, never a share link.** Share links are bound to one URL, die on the next deployment, and have expired mid-session. Drive previews with the repo's own Playwright.
- **Read secrets from the environment inside a script.** No credential may reach a URL, a log, a commit message, a report or a Gmail draft. If one ever appears in a diff about to be committed, stop and say so.

- **A URL THAT HAS BEEN THROUGH GMAIL IS NOT THE URL THAT WAS WRITTEN — AND THAT APPLIES TO THE CORRECTION AS MUCH AS TO THE ORIGINAL.** On 30 Aug 2026 a Support URL was sent for App Store Connect, where it would have sat permanently on a public listing. Gmail had wrapped it in `https://www.google.com/url?q=…&source=gmail&ust=…`. It was spotted — and **the correction sent back was wrapped in exactly the same tracker**, because it had also been copied out of an email. Both halves of one exchange, while discussing the problem.
  - **ANYTHING GOING INTO A PERMANENT RECORD IS TYPED FROM THE BARE VALUE, NEVER COPIED OUT OF A MESSAGE.** The bare value here is `https://thrivecareer.co.uk/support`. Same family as the recovery links three transports destroyed in 2026: what you sent and what arrived are different objects, and only the far end tells you.

- **AN ERROR MESSAGE IS AN UNCONTROLLED CHANNEL, AND ON 30 Aug 2026 IT PUT A REAL REFRESH TOKEN INTO THE PRODUCTION LOGS.** `middleware.ts` ran a naked `await supabase.auth.getUser()` on every matched navigation. It threw `TypeError: Cannot create property 'user' on string '{"access_token"…'` — and **the message embedded the value the library was holding, which was the entire session**: the access token, the REFRESH TOKEN and the whole user object, in plain text, for a real account, three times in one second.
  - **THE RULE, BECAUSE THE INSTANCE IS THE SMALL PART: any call that handles a session must not be allowed to reject into a log.** Guard it at the boundary. This is not "audit every dependency for error messages that stringify their input" — that is not auditable and it is not ours to control. **What publishes it is ours**: an unguarded `await` where the value is a credential.
  - **AND THE CATCH BINDS NOTHING.** `} catch {` with no variable, so there is no path from the error to the console at all. A `catch (e)` that logs `e.message` is the same leak with a smaller audience — the message IS the thing that carried the session.
  - **CATCHING ALONE WOULD HAVE BEEN WORSE THAN THE THROW.** It stops the leak and leaves the browser holding a cookie the server cannot read, on every navigation, silently, forever. The loud version at least announced itself. **A guard that hides a broken state without repairing it converts a visible fault into an invisible one** — so the stale cookie is cleared too, all chunks, which puts the person back to signed-out and lets the next sign-in write something readable.
  - Why it threw at all: the browser client moved to `@supabase/ssr`'s `createBrowserClient`, which writes the auth cookie base64url-encoded. A session created BEFORE that change still holds the older shape. **It is about WHEN the cookie was written, not how the person signed in** — which is why one account was affected and a session minted the same morning through the OAuth callback was not.
  - Same family as the Firecrawl key in `.claude/settings.local.json`: a credential reaching a place nobody thought of as credential-bearing. There the place was a permission entry; here it is an exception message.

## Verify with `npm run verify`, not with ad-hoc lines

- **One command: `npm run verify`.** tsc, the production build, `migrations:check` and `guard:prove`. Every check runs even if an earlier one fails, so one run gives the whole picture, and the process exits non-zero if any failed.
- **The pre-push hook runs the fast three automatically** (`npm run verify:fast` — tsc, migrations, guard:prove; no build). ~16 seconds, every push. **Split by cost, not importance:** the broken commit failed tsc first, types catch that class of fault, and if they compile the build almost always follows. Putting the ~90s build in the hook would only teach everyone to reach for `--no-verify`, and a guard people are trained to skip is worse than no guard. So run `npm run verify` in full before a merge.
- Escape hatches, both deliberate and both loud: `git push --no-verify` for once; `git config --unset core.hooksPath` to remove the hook entirely. A missing `SUPABASE_ACCESS_TOKEN` makes the migration check report SKIP rather than FAIL, so a dead network never blocks a push.

- **A THROWAWAY EDIT SCRIPT STARTS FROM `scripts/lib/assert-changed.mjs`, NOT FROM A BARE `String.replace`.** `applyEdits([[file, from, to]])` does the edit and refuses to lie about it: a missed anchor throws instead of printing "import added", and `assertChanged(snapshot, {gone, present, count})` REFUSES any check whose answer was already true before the edit — the "cron uses the constant" false pass and the guarded-ternary false failure both become the error `INDISTINGUISHABLE` instead of luck. Its positive control runs inside every `npm run verify` (`assertchanged:prove`), so the helper is watched failing on purpose the way the guard is.
  - **BUT `applyEdits` WRITES THE FILE BEFORE IT ASSERTS, so "the script threw, therefore nothing happened" IS FALSE OF THIS HELPER.** It writes, then re-reads from disk, then checks — and every one of those checks throws. A run that fails on entry 3 has already written entries 1 and 2, and a run that fails on the *post-write* check of entry 1 has still written entry 1. Found 16 Aug 2026: a revert script passed an empty `to`, the helper correctly refused it, and one of five files had nonetheless been changed on disk by the run that reported failure.
  - So after ANY failed `applyEdits` run, **read the files before re-running.** Re-running blind either double-applies an edit or throws `MISS` on an anchor that is legitimately gone, and the second one reads like a broken script rather than a completed edit. The fix is not to distrust the helper — its refusals are correct and it is still the right starting point — it is to remember that its unit of atomicity is nothing at all.
- **AN RLS QUESTION STARTS FROM `scripts/lib/rls-probe.mjs`, NOT FROM A FRESH SCRATCH SCRIPT.** Four probes were hand-rolled in three days, each re-deriving env loading, session minting and the verdict. `probeWrite` refuses to run without the statement kind named (insert/upsert/update/delete — a passing insert proves nothing about an upsert), sends the write with `return=minimal` so the answer is about the WRITE, and asks the read-back in a separate request — the "violates row-level security" that comes from the read-back of an OPEN table can no longer masquerade as a refusal. `npm run rlsprobe:prove` demonstrates both states on a throwaway table it builds, drops and proves dropped; it is not in `verify` because it needs the database and `SUPABASE_ACCESS_TOKEN` (exit 2 SKIP without).
- **Nothing it prints is a label anyone wrote — every PASS/FAIL comes from an exit status.** A commit went out broken because `npx tsc --noEmit 2>&1 | head -5 && echo "tsc ok"` prints "tsc ok" directly underneath two real errors: `head` exits 0 whatever tsc did, so the `&&` fires. Reading your own echo instead of the exit code is the root of the whole harness family — the buffered pipe, the rel-keyed icons, the closed accordion, the CSS-uppercased selector, the stdin parser, the guessed hostname.
- **A WIDENED SELECT IS A CHANGE TO A QUERY, AND A QUERY IS NOT TYPE-CHECKED.** Adding `company_website` to `getJobForMeta`'s select on 6 Aug 2026 named a column that does not exist on `jobs`. PostgREST rejects the **whole request**, not the one field, so the function returned null and **every job page fell into its no-job branch** — `<title>Job | Thrive</title>`, the generic description, and the branded OG card instead of the per-job one. A change meant to ADD structured data had silently REMOVED the per-job title, description and preview image from 246 pages.
  - **tsc passed and the build passed.** Neither can see a column that isn't there — the same family as the Supabase client accepting any table name. **The compiler offers no protection on column names.**
  - The failure looks like "no job found" rather than like an error, so every fallback behaves correctly and nothing logs.
  - It was caught by curling the page and reading `Job | Thrive` where the role should be. **Check a widened select against `information_schema.columns` before shipping it, and read the served output afterwards** — the check that exists because structured data fails quietly caught something that had nothing to do with structured data.

- **THE ABSENCE OF A LOG ROW IS NOT THE ABSENCE OF THE THING IT LOGS — CHECK WHEN THE INSTRUMENT STARTED.** On 26 Aug 2026 a query found 9 of 62 candidates had been sent a welcome email, with none before 10 August and none after the 22nd, and that window was reported as evidence of something breaking. **`email_log`'s first row ever is 11 Aug 11:02** — commit `bc6d1ee`, "record every send". The table did not exist before it. Every zero in the first six weeks was a table that was not recording, and the honest figure is **9 of 20**.
  - **THE FABRICATED WINDOW WAS THEN HANDED BACK AS A QUESTION TO EXPLAIN** — "something worked for twelve days, explain that before proposing anything" — which is exactly the right challenge, and the answer was that the window did not exist. A wrong number does not stay a wrong number; it becomes a wrong thing to reason about.
  - **THE END OF THE WINDOW WAS SMALL NUMBERS, NOT A CLIFF.** Four signups after 22 Aug, of which three were email/Apple and never attempt at all by construction, leaving one. Nothing to explain there either.
  - This is the same family as the emoji grep that found nothing, `cat -A` not showing the `\r`, and `executablePath()` returning a path for a binary that does not exist — but **the first where the missing instrument was OURS rather than a tool's**, which is precisely why it did not feel like an instrument at all. A table we wrote, in our own database, reads as ground truth.
  - **Before treating a count of rows as a count of EVENTS, ask `select min(created_at)` on the table.** One query. It costs nothing and it is the difference between "this broke in August" and "we started measuring in August".

- **A GREP IS NOT A COUNT OF BEHAVIOUR, AND A CHEAP MEASUREMENT GETS TRUSTED BECAUSE IT IS CHEAP.** Twice in two days a number went into a report low and had to be corrected: "9 of 62 candidates were welcomed" (really **9 of 20** — see the log-row entry below) and "11 of 37 email call sites swallow their errors" (really **26 of 33**). The second came from grepping with a context window and counting matching lines, which counts TEXT NEAR A PATTERN rather than call sites that behave a certain way.
  - The honest version took one short script: walk each `fetch(` to the endpoint, read the thirty lines after it, and decide per site. Four minutes, and it changes the size of the problem by a factor of two.
  - **Both times the FILE was right and the REPORT was under**, which is the dangerous direction: it makes a real fault look like a manageable one and invites the wrong decision about whether to fix it.
  - The shared cause with the rule above is not SQL or grep specifically. It is that **a measurement that takes ten seconds does not feel like something that can be wrong**, so nothing gets checked. If a number is going in front of somebody who will decide with it, measure it the way the code behaves.

- **A MEASUREMENT OF A RULE MUST IMPORT THE RULE.** Not "be careful with SQL". The specific failure is that **the cheap, read-only, one-off query is exactly where the second copy gets made, because it does not feel like code.** On 26 Aug 2026 `nameMatchKey` was reimplemented in a SQL query — strip brackets, split on whitespace, fewer than two words — to count how many candidates the duplicate check cannot key. The answer came back **6**. The real answer is **12**.
  - The rule also filters `[^a-z\s]` and drops one-character tokens, so the query missed **5 names with a single-letter token** ("Adnan K" is one word, not two) and **1 multi-word name in a non-Latin script**. Half the population, silently.
  - **IT WAS WRITTEN IN THE SAME HOUR AS AN INSTRUCTION SAYING "read the rule, do not reimplement it" — while measuring whether to apply that very rule.** The instruction was read, understood, agreed with, and then not applied to a query, because a read-only one-liner for a number in a report does not present itself as a place where duplication happens.
  - **Nothing type-checks a SQL string against a TypeScript function**, so there is no compiler backstop the way there is for a second copy in code. The drift is invisible until somebody happens to run both.
  - The fix is mechanical and cheap: `scripts/count-unkeyable-names.ts` imports `nameMatchKey` and runs it over the rows. **If a number is about what a function decides, get the number from the function.**

- **A SECOND COPY DOES NOT STAY A COPY.** `companyNameFromEmail` existed THREE times — lib/authCallback.ts, app/auth/callback/employer/route.ts and components/SessionGuard.tsx — each with the same eight-string list of generic mail domains. **Two of them had already drifted:** one extracted the domain stem in two steps, the other in a single expression. Same intent, different code, and nobody had touched either on purpose.
  - **The duplication was not the fault; it was the delivery mechanism for one.** All three were about to be wrong in the SAME NEW WAY — none knew about `privaterelay.appleid.com`, so the first employer signing in with Apple would have had their company created as **"Privaterelay"**, a real name on a real row shown to candidates. Three places to fix, and forgetting one leaves the bug alive and invisible.
  - **The fix is not "update all three", it is to ask something that already knows.** They now call one helper that reads `FREE_MAIL_DOMAINS` — a set that is already the authority on "this domain tells us nothing about a business", already covers the relay and alias domains, and covers whatever is added to it next without anyone remembering to.
  - Same shape found the same day in `initialsOf` (two copies, one null-safe and one not) and in the provider-name map (one in `signupSource`, one hardcoded as "Google" on the security page). **When you find a second copy, the question is not whether to sync it — it is what single thing both should have been asking.**

- **THERE ARE 62 INVENTED NAMES, NOT SIX — AND REMOVING THEM IN BULK WOULD CREATE 59 CRASH SITES, BECAUSE THE FALLBACK IS WHAT STOPS THE CRASH.** This is the opposite of obvious and it is the thing to know before touching them. `a.candidateName.toLowerCase()` **cannot throw while `|| 'Applicant'` is there.** The fallback is simultaneously the fault (an invented name nothing can distinguish from a real one) and the guard (a non-null value for every consumer downstream). Take the fault out with a find-and-replace and you have shipped 59 new ways to break a page — on 27 Aug 2026 the two that were fixed properly needed **eight** consumers handled on one page alone.
  - **So each one is removed WITH its consumers, never in a sweep.** The compiler finds them if you widen the type first; nothing finds them if you only edit the literal.
  - **WHY THE FIRST SWEEP FOUND SIX AND MISSED THE REST — the shape, since that is how the next one gets found.** The six were found by making `Candidate.fullName` nullable in `lib/types.ts` and reading the errors. But `app/my-jobs/[jobId]/applications/page.tsx` **declares its own `Application` interface** with `candidateName: string`, reading the same database column under a different field name on a different type. **Widening a shared type finds every consumer OF THAT TYPE and nothing else.** A page-local interface over the same column is invisible to it.
  - The real population, counted behaviourally rather than by grepping context: **62 across 35 files** — 34 `'Candidate'`, 11 `'Unknown'`, 7 `'User'`, 4 `'Someone'`, 2 `'Anonymous'`, 2 `'Applicant'`, 1 `'Employer'`, 1 `'You'`. Two are probably deliberate (anonymous reviews) and one is fine (`'You'` for the sender labelling themselves), so roughly **59 are real**.
  - Deliberately not fixed as of 27 Aug 2026 — Paul's call, because the signup push matters more and nobody has yet complained about seeing "Candidate" on a card. They will still be there next week.

- **A FALLBACK DOES NOT MERELY PAPER OVER AN ABSENCE — IT HIDES THE ABSENCE FROM THE ONE TOOL THAT WOULD HAVE FOUND IT.** `fullName: candidate.fullName || 'Candidate'` **type-checked perfectly, BECAUSE the fallback is what made it valid.** Six invented names were removed from this codebase on 26 Aug 2026 — `email.split('@')[0]`, `'User'`, `'Unknown'`, `'Candidate'` and two more — and every one of them was invisible to `tsc` for exactly that reason. The compiler cannot flag a null that never reaches it.
  - **THE MOVE THAT FINDS THEM IS TO WIDEN THE TYPE FIRST AND LET THE COMPILER COMPLAIN.** Making `fullName` `string | null` named seven call sites in one run, including one that appeared TWICE where I had expected once, and the search's `.toLowerCase()` that would have thrown for an employer with no error anyone could see. Grepping the auth paths had already missed the mapper twice.
  - **The two it still could not see were the two that had their own fallback.** So the order matters: remove the default, then read the errors. Removing it second finds nothing, because there is nothing left to find.
  - The general shape, and it is the same one as `|| 'User'`: **a value that is never empty cannot be distinguished from a value that is real.** Absence is detectable and a plausible-looking string is not, which is why a fake name in a database is worse than no name at all.

- **THE COMPILER CANNOT TELL A FIELD THAT DISPLAYS FROM A FIELD THAT KEYS. Both are `string`.** Filling `jobs.area` from the area resolver looked obviously right — same place, same resolution, one line. But `area_county` holds an **id** (`somerset`, `south-west`, `greater-london`) and `area` is **printed verbatim** beside the town on every card, every job page and every board. Writing one across into the other would have put "Bath, somerset" on 246 pages, and `tsc` has nothing to say about it: the types are identical and the assignment is legal. Same family as the widened select — the type system knows the shape of a value and nothing about what it is FOR.
  - **Read what the field already holds on live rows before writing to it**, not what its name suggests and not your own description of it from ten minutes earlier. One query settled it: existing Bath rows carry `area` "Somerset" against `area_county` "somerset", so the pairing was visible in the data before any code ran. `lib/areas.ts` had `countyName()` and `regionName()` sitting there for exactly this.
  - The general shape: **a value that is rendered and a value that is matched on are different kinds of thing even when they are the same type, and nothing in the toolchain will separate them for you.**

- **A SUBSTRING SEARCH CANNOT CONFIRM A CHANGE WHEN THE SUBSTRING IS WHAT YOU JUST WROTE.** Twice in two days a helper reported success on a string that was already present: `"import added"` after a `String.replace` whose anchor never matched, and `"cron uses the constant"` by finding `JOB_EXPIRY_DAYS` in the *usage* rather than the *import* it was supposed to have added. Both times the string was there before the change was complete. **Assert what should now be DIFFERENT** — the old line gone, the file contents changed, the new branch reachable — not that the new text exists somewhere. `tsc` caught both, and `tsc` will not catch the next one if it is a runtime fault rather than a type one.
  - **IT FAILS IN BOTH DIRECTIONS, AND THE SHARED CAUSE IS THAT THE OLD AND NEW CODE BOTH CONTAIN THE SEARCH STRING.** Twice it passed on an unmade change; the third time it FAILED on a correct one — a check for `` ` / ${formData.salaryPeriod}` `` reported the unguarded form still present, because the guarded version legitimately still contains that substring inside its ternary. Once both versions match, the search can only be wrong one way or the other; which way is luck. The passing direction is the dangerous one and the failing direction wastes a session chasing working code.
  - So the test is not "is the new text there" **or** "is the old text gone" as strings, but **can this search distinguish the two states at all?** Here it could not, and the rewrite that worked asked two questions with different answers before and after: the *bare* form is gone, and the *guarded* form appears exactly twice.

- **A CHECK THAT RACES AN ANIMATION IS A CHECK THAT LIES, AND IT LIES INTERMITTENTLY — which reads as a flaky test rather than a real fault.** `scrollIntoView({behavior:'smooth'})` is still moving when the next line reads `getBoundingClientRect()`, so the position measured is somewhere on the way to the answer. It would have passed on a fast machine and failed on a slow one, and the failure would have been blamed on the test. The focus fix uses the default `'auto'` for exactly this reason: **the scroll is finished before anything can ask where the thing is.**
  - Same family as the buffered pipe and `head` exiting 0 — the check reports on a state that has not settled yet. **Whenever a measurement follows something that takes time, make the thing instantaneous or wait for it explicitly; never both animate and measure.**
  - And prefer this over adding a sleep: a sleep that is long enough today is a race that will be lost later, on a slower machine or a bigger page.

- **THREE TIMES IN ONE DAY A MEASUREMENT WAS TAKEN BEFORE THE STATE HAD SETTLED, AND EVERY ONE OF THEM WOULD HAVE GONE INTO A REPORT AS A FACT ABOUT THE PRODUCT.** 29 Aug 2026, all three on the same board, none of them caught by the check itself — each was caught by a number that looked wrong to a person:
  - **1.5 seconds in:** the drive read the board and reported **"0 jobs"**. It is 251. The filter strip renders before the fetch resolves, so waiting on the strip is not waiting on the board.
  - **6 seconds in, with the fetch deliberately aborted:** the page still read "Loading roles…", and that was very nearly reported as *main leaves the board spinning forever*. It does not. **supabase-js retries with exponential backoff — measured at 1.1s, 2.1s, 4.1s and 8.1s from load** — so the honest statement is eight seconds of "Loading roles…" and then a final state.
  - **0.7 seconds in:** the settle-wait written to fix the first two returned TRUE on a page that had not rendered anything yet, so it stopped immediately and reported every string as "not found".
  - **THE SHARED CAUSE IS NOT IMPATIENCE, IT IS THAT AN UNSETTLED STATE IS A VALID-LOOKING STATE.** "0 jobs", "Loading roles…" and "not found" are all things the page can legitimately say. Nothing about them announces that the answer has not arrived, which is exactly why they get written down.
  - **SO WAIT ON A PREDICATE THAT IS FALSE WHILE THE ANSWER IS MISSING — NEVER ON A CLOCK.** The rule above says a sleep long enough today is a race lost later; these are what that looks like when the thing being waited on is a network rather than an animation, and there you cannot make it instantaneous. `waitForFunction(() => the count is non-zero)`, `waitForFunction(() => a heading exists AND does not say Loading)`.
  - **AND THE PREDICATE ITSELF HAS THE SAME FAILURE MODE, WHICH IS THE THIRD ONE ABOVE AND THE ONE WORTH REMEMBERING.** `h ? !h.textContent.includes('Loading') : true` reads naturally and is wrong: with no `h` it returns TRUE, so **a wait meant to catch an unfinished page is satisfied by an empty one.** It must be `!!h && !h.textContent.includes('Loading')`. Same family as every check pointed at nothing — ask what your wait does before the page exists, because that is the state it starts in.
  - **The cheap habit that catches all three: PRINT THE VALUE YOU WAITED FOR.** The drives now print `board says: 251 jobs` and `settled after: 8.0s of retries` on every run. The 0-jobs read was found by a number on the screen looking wrong, not by an assertion — so put the number on the screen.

- **COPY THAT QUOTES ANOTHER SCREEN'S LABEL BREAKS WHEN THAT LABEL BECOMES CONDITIONAL — AND NOTHING WILL CATCH IT, BECAUSE BOTH SIDES ARE RIGHT.** `/welcome` told new candidates: *"You can turn this off at any time with the visibility switch at the top of your dashboard — it reads 'Employers can find you' while it is on."* On 26 Aug 2026 the held-candidate work made that switch **conditional**: while a profile is held as a possible duplicate the switch is disabled and reads **"Being checked"**. So the instruction now points at a control the reader cannot find and cannot use.
  - **NOBODY WROTE THIS BUG.** The sentence was accurate when written, the switch change was correct, and neither author could have seen it. There is no test that fails, no type that breaks, and no grep that finds it unless you already know the quoted string.
  - It is the same spine as "two pieces of state that must agree need one path that sets both", one level up: **a quotation is a copy of another screen's state, and a copy does not stay a copy.** The difference is that here the two things are in different files, different languages of the product — one is UI, one is prose about UI.
  - **The cheap fix is not to synchronise them, it is to STOP QUOTING.** The replacement says "the visibility switch at the top of your dashboard" and names no label, so it cannot rot again. Point at a control by WHERE IT IS and WHAT IT DOES, never by what it currently says.
  - Found by reading the whole paragraph when asked to change one sentence in it — which is the only way it could have been found.

- **TWO PIECES OF STATE THAT MUST AGREE NEED ONE PATH THAT SETS BOTH.** The form errors are the worked example: a message and the field it is about. `FieldError` is the easy half — it renders when the active field matches. The half that makes it *safe* is that every error goes through one `showError(message, field)`, so the field cannot be stale. Set them separately and the first error that forgets its field leaves the previous one behind, and **a message beside the WRONG input is worse than one at the top of the page** — it is confidently, specifically wrong rather than merely hard to find.
  - The next person adopting this on the remaining 29 forms will reach for the component, because that is the visible part. The single path is the part to copy.
  - `/settings/company` is the exception and shows the cost of not having one: its banner is shared with success messages, so there is no single error string to hang a field off. The field is tracked separately there and **cleared by all nine other `setMessage` calls** — a red line beside an input surviving a successful save would be worse than not having it. It is bolted on rather than fitting. **If that page is ever reworked, split the banner into two states** (a success message and an error) so it can use the same single path as the rest.

- **A CHECK WHOSE ENTIRE PURPOSE IS TO SHOW YOU A THING CAN FAIL TO SHOW YOU THAT THING.** `cat -A` exists to make invisible characters visible, and it was used to confirm a file's line endings before writing a multi-line anchor. It printed `$` at each line end and no `^M`, so the file was taken to be LF. It is CRLF. Three anchors "not found" in a row were blamed on indentation, then on quoting, before the truth came from dumping the bytes: `JSON.stringify(slice)` showed `\r\n` immediately. Sharper than a check with a bug — this is a check doing the one job it has, wrongly, on a question it was chosen specifically to answer.
  - **Prefer a representation that cannot lie over a tool that formats.** `JSON.stringify` of the actual string, a byte count, `od -c`. Anything that renders is a chance for the rendering to be the thing that is wrong.
  - Corollary for edits: when a multi-line anchor is "not found", **stop guessing at the cause** (indentation, quoting, encoding) and print the bytes of both sides. Three wrong guesses cost more than one measurement.

- **ABSENCE FROM A CODEBASE IS NOT ABSENCE FROM HISTORY.** `"UK work authorization required"` appears nowhere in this repo except the one post-job line, and in the whole git history of it — both true, and it was used to argue the string was **provably** written by the form. It was not. Four Goldenkeys rows carried it, and the form could not have made them: `area` is null on all four and the form has written `area: formData.area || 'London'` since 1 March, so nothing it inserted could have a null there. **The thing that wrote the data need not live in the thing you searched** — a seeding script, a migration, a one-off, an MCP session, a person at a SQL prompt in June. The repo is what runs now; the database is what has ever happened.
  - Same shape as the substring rule above: a search that cannot distinguish the states you care about, reported as if it could. Grepping the repo answers "does our code do this **today**", never "what put this row here".
  - **Ask what would have to be true of the ROW, and find a discriminator in the data.** The reference `JOB-MQJN7RX3` decodes as base36 to `2026-06-18T15:16:42.135Z` against a `created_at` of `…42.357Z` — 222ms, so the form generated it and inserted. And every one of the 243 imported rows carries a `source_url`, including the 30 that predate the column, while none of the five did. Both are facts about what wrote each row rather than inferences from what didn't.

- **FOUR GOLDENKEYS ROWS ARE ORPHANS AND NOTHING WILL EVER RECONCILE THEM.** `99b24b3b`, `9760fa84`, `d94b3779`, `a839b943` were hand-seeded in June before the importer existed, so they have **no `source_url`** — which is the key the weekly scrape matches on. It cannot see them. They are `filled`, so no candidate meets them, and they are harmless today. But any count of "how many Goldenkeys listings do we hold", or any reconciliation against Goldenkeys' own site, will find four rows it cannot account for in either direction. Recorded so that hour is not spent twice.

- **A one-off helper gets the same standard as a check: ASSERT THE CHANGE LANDED, don't announce it.** A throwaway script printed `import added` after a `String.replace` whose anchor never matched — replace returns the string unchanged rather than failing, so the import silently did not land and `tsc` caught it two minutes later. The whole reason verify has five checks is that a printed label proves nothing, and **a helper written in thirty seconds is exactly where that rule stops being applied.** If a script edits a file, it must re-read and confirm, or exit non-zero.

- **DO NOT PIPE A CHECK. IF YOU MUST, `set -o pipefail` FIRST.** A pipe returns the LAST command's status, so `EXIT=0` sits happily on top of a crash — `node drive.mjs | tail -30` reported success over a stack trace that killed the process.
  - This replaces an entry that merely DESCRIBED that happening. The description had been in this file for weeks, was read the same night, and did not prevent it. **A rule you have to remember at the moment of typing is not a rule, it is a hope** — so this one is phrased as the instruction rather than the anecdote.
  - The habit exists to shorten output. If a check's output is too long to read, **the summary is the thing to fix** — every drive here already ends with one line and an exit code.
- Watched failing on purpose (a deliberate type error): exit 1, three of four named, the real compiler error shown. Then green again on restore.

## Migrations

- **Apply, capture, commit.** `apply_migration` writes the database and the ledger but never a `.sql` file, which is how six migrations once went four days unfiled — including the one creating a bucket the app fails closed without.
  - `npm run migrations:check` — fails if the ledger holds anything the repo doesn't
  - `npm run migrations:capture` — writes the missing files from the ledger
- **BEFORE A SEQUENCE OF MERGES, READ EACH BRANCH'S MERGE BASE. A BRANCH CUT FROM ANOTHER BRANCH CARRIES IT, AND THE CONSEQUENCE LANDS ONE MERGE EARLIER THAN THE PLAN SAYS.** On 27 Aug 2026 three merges were planned in order — a welcome-email fix, the Apple sign-in button, then the team-invite code. `fix/welcome-email-actually-sends` had been cut from `feat/apple-signin-button` rather than from main, so **merge 1 carried Apple with it and Apple sign-in went live there.** By merge 2 the Apple branch was 0 commits ahead: a no-op.
  - Nothing unauthorised was merged and the order held. What went wrong is that **the sentence "this merge is the go-live" had been written for merge 2 and the go-live had already happened** — so the loudest thing about the change was said after the fact rather than before it.
  - `git merge-base --is-ancestor <a> <b>` answers it in a second, and `git rev-list --count main..<branch>` shows a branch that is about to be a no-op. Do both before starting, not between merges.
  - **The tell was in the merge output and was read too late:** merge 1 printed `create mode` lines for `scripts/drive-apple-button.mjs` and `prove-apple-client-secret.ts`, which have nothing to do with a welcome email. **A merge that creates files you did not expect has brought something you did not plan for** — stop and check what, before pushing.

- **A MIGRATION FILE IS THE ONE ARTEFACT THAT CANNOT BE BRANCHED. CAPTURE STRAIGHT ONTO `main`, EVERY TIME.** It does not describe a proposed change — it records a **fact about a database every branch shares**. The branch keeps the code; **main keeps the schema.**
  - **TWO CONSEQUENCES, ONE CAUSE, AND THE SECOND IS THE ONE THAT SURPRISES.** The instant `apply_migration` runs: (1) the DATABASE is live for everyone, preview included — no merge required; and (2) **`main` BREAKS.** The ledger moves for everyone while the `.sql` file sits on your branch, so `migrations:check` on main sees 103 files against 104 ledger rows and fails. It stays broken until the file lands, however long the branch waits.
  - Found 25 Aug 2026 the hard way: a docs-only cherry-pick onto main could not be pushed, because the pre-push hook ran `migrations:check` and main had been failing since the previous night's `apply_migration` — before anything had merged, and with nothing on main to blame. **Check whether main is already failing before assuming your change caused it**; `git cat-file -e origin/main:supabase/migrations/<file>` settles it in seconds.
  - **LEAVING MAIN RED IS WORSE THAN IT LOOKS, WHICH IS WHY THE RULE IS ABSOLUTE.** A check that is expected to fail is a check nobody reads, and then it is no longer catching drift. This one exists because six migrations once went four days unfiled, including the bucket the app fails closed without. Do not let it become noise.
  - So: `apply_migration` → `npm run migrations:capture` → **commit onto main**, immediately, in that order. Taking one `.sql` onto main is NOT merging the feature — the table already exists in production, and the file is only the record catching up.
- Never run `supabase db push`.
- Verify a captured migration by **convergence** — does the last definition of each object match what is live? — not by comparing it to the ledger it came from, which is circular.
- **A COLD `.next` MAKES `verify` RUN LONG ENOUGH TO LOOK HUNG — AND `rm -rf .next` IS WHAT MAKES IT COLD.** This entry replaces one written the same night which said the opposite: it blamed a "corrupted cache" and told the next person to clear `.next`. **That advice causes the problem it claims to fix.** Measured immediately afterwards, on the same tree:
  - `.next` warm: **118s**, all 30 passed.
  - `.next` cleared: 248s once, and **over ten minutes twice** — killed both times, no output, no red to read.
  - `npm run build` on its own, cold: completes fine. `tsc` alone: exit 0. `migrations:check` alone: exit 0.
  - So no single check is broken. The cold production build inside `verify` is simply expensive, and it runs while ~28 other checks compete for the machine.
  - **If verify looks hung, the fix is to run `npm run build` FIRST and then verify** — or just leave `.next` alone. Clearing it is the one move guaranteed to make the next run the slow one.
  - Clearing `.next/types` specifically is still correct for the stale-type-stub fault (a route on another branch), and that is a different problem with a different symptom: a fast, loud tsc FAILURE naming a module that does not exist. **A hang and a red are not the same fault and do not share a remedy.**
  - **THE REASON THIS IS WORTH THE SPACE IS NOT THE BUILD TIME.** A rule was written from one observation, in a file whose whole purpose is to stop the next person rediscovering things — and it was wrong in the direction that costs them ten minutes per attempt. **One run is an anecdote.** The correction only exists because the same command was run four more times and the numbers disagreed with the story.

- **`migrations:check` CAN REPORT `NOT VERIFIED` TRANSIENTLY AND PASS ON A STANDALONE RE-RUN.** It happened on a merge: verify printed `NOT VERIFIED: migrations could not run` and exited 1, and `npm run migrations:check` on its own immediately after said `OK — 105 ledger rows, 105 files, nothing uncaptured`. It needs the network and the Supabase API, so a blip during a parallel run is enough.
  - **`NOT VERIFIED` IS NOT `FAIL`, AND THE HARNESS IS RIGHT TO REFUSE IT ANYWAY** — its own words are "a push tolerates that; a merge should not". The correct response is to run the missing check by hand and say out loud that you did, which is what the message asks for. **Not** to shrug at an exit code, and **not** to re-run the whole thing hoping for green without knowing why it went red.

- **A RED THAT CLEARS ON RE-RUN IS THE INSTRUMENT, NOT THE CODE.** `npm run verify` once reported `FAILED: tsc` alongside a real migrations failure; `tsc` passed alone with exit 0 and passed on every subsequent run, and that whole run took 244s against the usual ~120s. Only the migrations failure was ever real. **Believing the transient would have sent someone hunting a type error that does not exist** — so when verify goes red, re-run the failing check on its own before acting on it. Same family as every other instrument fault here: check what the tool is telling you before you change the product.

## State beats screen

- **When a driven check says "nothing happened", confirm from the database before reporting it.** Twice in one session a UI check read as a clean pass when the click had never landed — once because the button label carried an icon the selector didn't expect, once because a chat widget's send button was also a `type="submit"` and won `.last()`. Both would have been written up as product faults. What settled it was counting the rows.
- **A result too absolute to be true is the instrument, not the product.** "All six words missing", "no icon advertised at all", "the section doesn't exist" — check the tool first. Five such false alarms in one day, every one the harness.
  - **AN INPUT HIDDEN AND STYLED THROUGH ITS LABEL DEFEATS `.check()` — click the LABEL, which is what a person clicks.** The terms box on `/register/employer-free` is `display:none` with the visible control in its `<label>`, so `.check()` ticked nothing, the form correctly refused to submit, and the run reported "no signup request attempted" — which reads as a broken form rather than a harness that cannot reach the control. Same family as the icon in the button label and the chat widget winning `.last()`.
  - **`[role="dialog"]` NEVER MEANS "a modal is open" on this app — two of them are on every page.** The Ask Thrive chat window (`aria-label="Ask Thrive — help chat"`) and the cookie banner both carry one permanently, so `!document.querySelector('[role="dialog"]')` is false whatever any modal is doing, and a "did it close?" check written that way cannot pass. Scope to the dialog's own `aria-labelledby`. Third member of the chat-widget family, after it won `.last()` on a submit button.
  - **And on `/my-jobs` specifically, the tabs mean two different things.** All Jobs / Active / Archived filter by job STATUS; Interviewing / Offers / **Hired** are pipeline stages about CANDIDATES — "Hired 3" renders "No hires yet" and has no job cards at all. A gate check that went looking for a filled advert under Hired found nothing and read as a fault.
    - **THIS ENTRY USED TO END "filled adverts are under All Jobs". THAT WAS FALSE, AND IT WAS FALSE WHEN IT WAS WRITTEN.** There was no `activeTab === 'all'` branch in the filter at all — it fell through to `cat === 'default'`, so All Jobs showed the same set as Active, and a filled advert (which `getJobCategory` maps to category `hired`) appeared on **none of the six tabs**. Fixed 18 Aug 2026 by making All mean all. Recorded because the rule was believed for weeks and sent at least one session looking in the right place for a thing that was nowhere.
    - **The badge and the list were computed from different populations on the same tab** — the badge from `postedJobs.length`, the rows from the filter — so the page rendered "All Jobs 4" above an empty area. **Where a count and a list claim to be about the same thing, assert them against each other**, in one measurement, on the same run. Neither number is wrong alone; only the comparison shows it. `scripts/drive-my-jobs-controls.mjs` now walks every tab asserting badge === cards.
    - **An empty list with no message reads as a page that failed, not a list that is empty.** That was half of why this went unreported for so long: the blank area looked like loading. Every tab now says why it is empty, and a no-match search is worded differently from an empty tab — one is the employer's own filter and is fixed by clearing it.
- **State beats screen for whether it's CORRECT; screen beats state for whether it's FINISHED.** Complementary, not competing. The published description was empty while the page looked perfect — only the row showed it. Four bare fields floated in step 3 with every assertion green — only the screenshot showed it. Run both, and expect each to catch the kind of fault the other cannot.
- **A check that passes isn't the same as the right check.** "description is non-zero" was true, and insufficient: the entity leak (`What you&rsquo;ll be doing`) and the run-on (`doingCovering`) were both inside a non-zero string. Ask what the check would still pass on.
- **NOT-NULL AND ABOVE-ZERO ARE DIFFERENT QUESTIONS, and the column will answer the wrong one without complaining.** The home hero says "N roles live now, with the salary on every one" — a claim, so it is only rendered when it is true of every live role. The first count asked `salary_max is not null` and returned 251 of 251. **Two rows PASS that test and carry a literal 0 in BOTH salary columns**, so the true figure is 249 and the sentence was false. `> 0` is the discriminator, and it is exact here because no row has a min without a max.
  - Same family as "description is non-zero" above, and as the widened select: the check was true, and it was not the question. **Ask what the check would still pass on** — here, a zero, which is precisely the state that exists.
  - The two rows are imported Goldenkeys listings (`fb5ed3e6`, `bfb0e751`), so they are read-only and cannot be fixed from our side. That is *why* the claim has to be computed rather than corrected once and typed in.
  - **A count that never answers must drop the claim, not default it in.** `rolesWithSalary` starts null and the clause requires an equality with a number, so a failed request renders the shorter sentence rather than an unsupported one.

- **A LOCAL COMMIT THAT WAS NEVER PUSHED IS INVISIBLE TO EVERY QUESTION ASKED OF THE REMOTE.** `feat/insights-page` carried one commit main had never had — a CLAUDE.md rule written after the feature merged. Asked the way anyone asks it, against `origin/feat/insights-page`, the answer was **fully merged**, because the commit had never been pushed there. It existed in exactly two places: a local branch, and `origin/diagnose/token-boundary`, whose own message reads *"delete with this branch, never merge"*. One `git branch -D` from surviving only somewhere marked for deletion.
  - The remote's answer was correct about the remote and useless about whether the work existed — the same spine as measuring the container instead of the cards.
  - So **check local refs too, and check what a branch CARRIES rather than whether it looks merged.** `git rev-list --count main..<branch>` answers it in four seconds; `npm run unmerged` now does it for every ref.
  - And the order that made the rescue safe: cherry-pick → diff the added lines against the original → push → **confirm on origin** → only then delete. Never delete against a local copy.

- **A COMMIT CAN CARRY KNOWLEDGE THAT IS NOT IN ITS DIFF, AND RESCUING THE COMMIT DOES NOT RESCUE THE KNOWLEDGE.** The underscore-routing lesson below lived in a commit *message*: `840659c`, "underscore folders are private in the App Router — the probe 404'd". Its diff was a folder rename and one `.gitignore` line. Cherry-picking it would have moved the rename and left the reason behind — and the branch would then have looked safe to delete while the lesson quietly was not saved at all. It had to be written out fresh.
  - So when rescuing work off a branch, **read the messages, not only the diffs**, and ask what someone learned rather than what changed. The two are different sets and only one of them is in the patch.
  - This is the argument for CLAUDE.md existing at all: **a git history is a record of what changed, not of what was learned.** Anything worth knowing that is not in a file is one deletion from gone, and a message on a branch marked for deletion is the worst place it can live.

- **UNDERSCORE FOLDERS ARE PRIVATE IN THE NEXT APP ROUTER — a route inside one does not exist.** `app/api/_diag/token-boundary/route.ts` returned 404 no matter what it contained; renaming the folder to `diag-token-boundary` made it respond. Real framework behaviour rather than anything of ours: the App Router treats a leading underscore as "private, do not route". It cost a deploy cycle to find, and it read as a broken route rather than a folder that was never published.

- **When measuring whether two pages look the same, measure what's ON them, not what they sit IN.** Asked which surfaces diverge from the rebuilt dashboards, a body/main background check returned `rgb(248,249,250)` on all eight — identical, light, no divergence. `/candidates` is navy: the page background genuinely is light and the divergence is entirely in the header band and the CARDS. The measurement was correct about the container and useless about the question. The screenshots settled it.

- **A gate that never fires looks exactly like a gate that works, if you only drive the state where it was never needed.** The percentage-withholding fix gated on `relevancePoints > 0` and changed nothing, because the scorer pays 10 points for having no job title and 5 for having no sector — an "empty" profile arrives with 20 relevance points it never earned. Every assertion passed on the profile that had a title, which is the state the gate was never for. **Drive the state the gate exists to catch, and check the gate's own condition can be false.**

- **ASSERT THE STATE, NOT THAT THE HELPER WAS CALLED.** `seed-storage.mjs` exists so a drive can put the browser in a known state; its `consentAccepted` entry, described as *"the state every returning visitor is in"*, wrote `localStorage.hex_cookie_consent = 'all'`. `lib/cookies.ts` reads a **COOKIE** of that name holding **JSON** `{essential, functional, analytics}`. Wrong store, wrong shape — so asking for a returning visitor produced a first-ever visit with 150px of cookie banner across the bottom of the phone, **directly over the notice the drive existed to photograph.**
  - **A helper whose entire purpose is to establish a known state, failing to establish it — AND RETURNING THE KEY IT HAD SET, so it looked like it had worked.** The drive printed `storage state: consentAccepted` and **seventeen assertions passed underneath it.** Only the screenshot showed the banner.
  - It is the same family as `cat -A` not showing the `\r`, and as `executablePath()` returning a path for a binary that does not exist: **the tool chosen specifically to answer a question, answering it wrongly.** Nothing else in `scripts/` had used the state yet, which is luck rather than design.
  - So the drive now asserts **"the cookie banner really is gone"** against the rendered text, and the helper reaches cookies as well as localStorage. **A seeded state is a claim until something on the page confirms it.**

- **A DRIVE WITH EMPTY STORAGE IS A DRIVE OF THE FIRST-EVER VISIT AND NOTHING ELSE.** Playwright starts with no localStorage, no cookies and no session, so every drive is of a page nobody who has been here before will ever see. On 22 Aug 2026 that hid three faults on `/login/employee` at once — an email running 101px off the screen, a notice eating 34% of the fold, and a stale prompt naming an account deleted the day before — because the box holding all three renders only when `thrive_pending_confirm` is set. Every measurement in that morning's report, including "Create an account sits at y=942", was of a page that does not exist for a returning visitor; with the stored value it is at y=1169. **Paul found all three on his own phone, in one look.**
  - **Any page whose layout depends on localStorage, a cookie or a session gets driven in BOTH states, and the report says which state each measurement came from.** A figure without its state named cannot be re-checked by the next person — the same failure as a finding measured under a temporary allowlist.
  - The mechanical half, so this is not another thing to remember: `scripts/lib/seed-storage.mjs` carries the states a returning visitor actually has, and `withSeededStorage(page, 'pendingConfirm')` applies one before the first navigation. Adding a state there is how the next stored-state fault gets driven by default rather than by somebody thinking of it.
  - Same spine as the gate that never fires, one line up: there the fixture was the wrong state, here the fixture is *no* state at all — and no state is the easiest one to mistake for the normal one, because it is what the tool hands you.

- **Before manufacturing a state, read what the code READS, not what you can name.** Three times in one week: `posted_at` when the mapped type exposes `postedDate`; blanking `location` while `supabaseProfileToCandidate` falls back to `[city, county]`, so a profile called empty still said "Located in Bristol"; and blanking three fields when sixteen columns feed the score. The list of inputs comes from the mapper and the function, never from memory.

- **Check for a CLASS of fault, not for the instances you already know about.** Asked whether any horizontal scrolling was left on the phone dashboard, the honest check is to walk *every* element asking `scrollWidth > clientWidth` with a scrollable `overflow-x` — not to look at the two scrollers named in the finding. There were three. A check that only looks for the known two passes on the third and reports "zero, done".
  - **And drive the state the fault needs, not the state the fixtures are in.** The third one — the Active Jobs tile row — is invisible on the test employer, because all four of its ads are filled so the panel renders its empty state and the element never mounts. It is reachable only when an employer *has active jobs*: every real employer, and none of our test data. It surfaced only because a second pass temporarily made two jobs active. Same family as the answer line's zero-active row, which was also sitting in a state the fixtures hid.

- **When a check comes back clean on the first try, ask whether it was looking where the answer lives.** `/api/chatbot` returned `{"fallback":true}` with no price, four questions out of four — which reads as "the bot doesn't quote prices". It does; the API tells the *client* to answer, and the price is assembled in the browser. Same family as the rel-keyed icons, the closed accordion, the buffered pipe, and the chat widget swallowing a submit click. A clean pass is a claim about the instrument until you know it can see the thing.

## Defaults must not make claims

- **A form field may not assert something only the employer can state.** `employmentType` defaulted to Full-time, `contractType` to Permanent and `salaryPeriod` to hour — so an advert claimed a permanent full-time job nobody had chosen, and the AI generator then repeated it as a sentence in the employer's own voice.
- Distinguish a **convenience** (right nearly always, harmless when wrong — e.g. work location in a hospitality-only board) from a **claim** (only the employer knows). Fix the second kind at the data, not in the copy or the prompt: the wrong value still reaches the row, the card, the filters and the matching.
- **"Absurd, so someone would spot it" is only true on the page.** Six code paths annualise hourly pay before comparing, so a mis-set period misfires silently in matching long before a human reads the ad.

## Correct today because of the board, not because of the product

- Things that are right only because every live row is hospitality, and become wrong the day Thrive broadens: the **work-location default** ("In person"), the **sectors filter** (32 of 33 options match nothing), and the **site meta description** ("for restaurants, hotels and hospitality groups"). Hospitality is the starting vertical because that is where the contacts are, not what the product is. Recorded so nobody has to rediscover why they were left alone.
- **VIEW COUNTS CHANGE MEANING ON 4 AUGUST 2026. Do not read the step change as growth.** Before that date `jobs.views` counted **signed-in users only** — a signed-out visitor was never counted on any path, so every click from a shared link, a LinkedIn post or a Google result counted zero. From that date anonymous views count too, via `/api/jobs/[id]/view`. Every historical figure is therefore not comparable with anything after it, and there will be a jump that is instrumentation, not marketing. Two other things moved at the same time: a single board click used to increment twice (two call sites, one of them inside the hook the other also called), so pre-August numbers are also inflated for the people they did count; and "unique viewers" collapsed every anonymous row into one, because they all share a null `viewer_id`.
- **`job_views.source` IS AN INTERNAL SURFACE LABEL, NOT A TRAFFIC SOURCE.** All 578 rows read `direct` (414), `search` (160) or `recommendation` (4) — it records which part of OUR site the click came from. An arrival from Jooble or Google lands in `direct`. So there is no external attribution at the view layer and **no denominator**: we can say four candidates signed up from Jooble and never out of how many clicks. Signups are attributed (`signup_source` + `signup_source_basis`, filled from UTM tags); views are not, and the column named `source` is exactly the thing that makes it look as though they are.
  - Same family as `area` vs `area_county` and the dead `expires_at` column: **a field whose name answers a different question from the one being asked.** Read what it holds on live rows before building on it. If external attribution is ever wanted, it belongs in a SECOND column — overloading this one is how the next person misreads it.

- **A view is an OPEN, not a PERSON.** There is deliberately no cookie, identifier or fingerprint, so a reload counts again and the same person on two days counts twice. Signed-in and anonymous stay separable — `job_views.viewer_id` is the user or null — but `jobs.views` is the total of both.
- **Ads expire at 60 days from `posted_at`, via `/api/cron/job-expiry` daily at 10:00 UTC, and the employer gets an email when they do.** This corrects an entry that read *"employer-posted ads never expire"* — false, and believed for six weeks. **The dead column was a red herring: the route is called job-expiry and does not read `expires_at`.** Everyone who went looking for expiry behaviour found a null column, concluded there was none, and stopped. `jobs.expires_at` genuinely is null on every row and nothing writes it; that was true and it proved nothing. **Check what the cron does, not the column named after it.**
  - **Recruiter postings are excluded** — an `is_recruiter_posting = false` filter added 4 Aug 2026. The Goldenkeys scrape reconciles its own listings weekly and is the authority on whether a vacancy is still live, so expiring them on our clock would overrule it — and wouldn't stick: the scrape rewrites `status = 'active'` while `posted_at` is only ever written on insert, so it would re-expire and re-email every week, forever. Left alone, 23 rows would have expired on 18 Aug 2026 and 179 more on 10 Sep, with ~241 emails to one recruiter about ads they never posted through the form.
  - **The flag is a proxy and it is imperfect: Host's 23 listings also carry `is_recruiter_posting = true`, but nothing scrapes them — they are retired by hand.** So they are now exempt from ageing out with no reconciliation behind them. Deliberate for now, recorded so it isn't rediscovered.
  - The post-a-job footer used to claim the expiry was "set automatically if you leave it". That half is removed — the *field* it pointed at still does nothing, even though expiry itself is real.
- **Three urgency tags carry one meaning.** `Immediate start`, `Urgent hire` and `Interviews this week` all set the same `urgent` flag on the row, so a candidate filtering for interviews-this-week gets everything marked urgent, and an employer picking between the three is choosing a label with no distinct effect. Defensible while nobody has set a tag at all — every live row was imported — and it needs revisiting before tag filtering means anything.

## No prices, anywhere

- **Publish no price, no monthly rate, and no trial length.** The tier structure is undecided and will stay undecided until the platform has many more users — possibly a year. Any figure published now is one that has to be walked back, and walking a price back is worse than never naming one, especially to the founding employers being signed up now, who will remember what they were told.
- A **trial length is a price claim in disguise** — "3 months free" only means something against what happens in month four. So is anything of the shape "free for X, then Y".
- **The one allowed money claim is the founding-cohort offer**, because it is an offer actually being run and can be honoured: *the first 100 employers get 12 months free, no card needed*. Free-while-we-build is fine.
- This covers page copy, meta and Open Graph descriptions, JSON-LD, email templates, the chatbot, and Stripe product descriptions — anywhere a number can reach a stranger.
- **Check the deployed HTML, not the source.** The £99 that reached Google sat in the ROOT description, so it was served on the homepage, on `/waitlist`, and on every 404 — including `/pricing`, `/for-employers` and `/employers`, which are not routes at all.

## Truncating at the en dash is right in admin and WRONG on the board

- **`Role – Marketing Phrase` IS THE TITLE FORMAT — 244 of the 247 live rows, no em dashes, no spaced hyphens, longest 82 characters.** Cutting at the first en dash keeps the role and drops the sales copy, and it is the correct treatment in `/admin/jobs` and `/admin/applications`, where a company column, a date, an id and a drawer with the full title all still identify the row. `lib/jobTitle.ts` does it; the full title stays reachable as the `title` attribute and in the drawer.
  - **NOT the hyphen, even spaced.** "Front-of-House Manager" splits to "Front". Zero live titles use a spaced hyphen as a separator, so supporting it is pure risk.

- **BUT ON THE PUBLIC BOARD THE SAME CHANGE DESTROYS THE ONLY THING THAT TELLS LISTINGS APART, and the numbers are brutal:** truncating collapses **40 listings to "Chef De Partie", all from one company**; 31 to "Head Chef"; 30 to "Sous Chef"; 11 to "Restaurant Manager". Those 40 share a single employer name — Goldenkeys Recruitment — so after truncation a candidate sees forty cards reading *Chef De Partie · Goldenkeys Recruitment*, distinguished only by location, and there are just 19 distinct locations across the 40. **The marketing phrase after the dash is doing real work on the board**: "Iconic 5 Star Hotel" versus "Michelin Bib Italian Restaurant" is the only difference a candidate can see.
  - The design handoff specifies this change "product-wide, not admin-only". It is right about admin and wrong about the board, and the reason is a property of OUR data — one recruiter holding 243 of 296 listings — not of the idea.
  - **The general shape: truncation is safe exactly when something else on the row still identifies it.** In a table with six other columns, yes. On a card whose only other field is a company name shared by forty siblings, no. Ask what remains, not whether the removed text was redundant-looking.

- **AND 112px CANNOT HOLD "TWO LINES MAXIMUM" FOR EVERY ROLE.** After truncation the longest role is still 44 characters ("Assistant Food & Beverage Operations Manager"); measured at 390 it renders 5 lines, and 46 of 247 roles need three or more. Clamping to two would cut "Manager" off the end — the precise identity loss the feature exists to prevent. **The wrap wins over the line limit**, which is what design's own "identity text wraps rather than truncating" says when the two rules collide. 81% fit in two lines and the rest are allowed to be taller.

## Two charts that look the same can want opposite answers

- **`at time zone 'Europe/London'` WAS IN BOTH ACTIVITY RPCs AND WAS WRONG IN OPPOSITE DIRECTIONS.** Admin's "when are candidates active" is a question about BEHAVIOUR, so it has to be bucketed in **each candidate's own** zone — otherwise a Sydney candidate browsing after their dinner service lands in the 03:00 bucket and the real pattern is smeared into noise. The employer panel showing the same data answers "when should I post", which is a question about **their diary**, so it has to be in the **viewer's** zone; converting it to candidate-local would give them a chart they cannot act on. Same numbers, same bars, opposite correct answers. Fixed 18 Aug 2026, and each payload now names the clock it used.
  - **The zone comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`, NEVER from the country.** The US spans six zones and Australia five — precisely the markets in the plan — so a country→zone map would be hours out for exactly the rows it was added for. It rides a cookie (`thrive_tz`, alongside `thrive_country`) because two of the five signup paths are server routes with no browser to ask.
  - **`at time zone <unknown>` RAISES, so one bad row would blank a dashboard.** The name is resolved by `left join pg_timezone_names`: unknown and null both arrive as null and both fall back. A regex client-side is not enough — a shape-valid name Postgres has never heard of still passes it.
  - **AND THE FALLBACK IS COUNTED AND SHOWN.** Every one of the 68 sign-ins falls back today, because capture fills forward. A chart labelled "candidate local time" that is entirely one hard-coded default would be a claim we cannot support, so the payload carries `tzKnown`/`tzFallback` and the label follows the data rather than the intent — it only says "local" once some rows really are.

- **`?ref` HAS LANDED ON ZERO OF 62 CANDIDATES, AND MORE TAGGING WOULD NEVER HAVE FIXED IT.** The reason is in Paul's own description of the flow and nowhere in the code: he posts the link, lets the job card render, then **edits the post and deletes the link**, because the link sends people to a LinkedIn interstitial while the card image keeps working. So the thing people click is an image, there is no URL for a `?ref` to be on, and Mohammed — a known LinkedIn signup — recorded `unknown`.
  - The referrer is the only signal that survives that path. Captured host-only, external-only (our own host is not a referral), and **never in place of a tag**.
  - **`signup_source_basis` IS THE LOAD-BEARING HALF: tag | self-reported | referrer | unknown.** Without it an inference and a declaration are the same string in the same column and the difference is **unrecoverable afterwards** — which matters because the entire purpose of this data is deciding where to spend money. "LinkedIn, they told us" and "LinkedIn, because a header said so and native apps often send none" support different decisions.
  - **A NULL REFERRER MEANS "NOT TOLD", NEVER "DIRECT".** Native apps frequently send none and some platforms strip it. Nothing in the product may render it as direct traffic.
  - Backfilled only what was already evidenced — a row with a real tag was demonstrably a tag — and left the rest **null rather than 'unknown'**, because "never asked" and "asked and could not tell" are different facts.

- **A HARNESS THAT DIES ON THE BREAK READS AS A BROKEN HARNESS, NOT AS THE FAULT IT FOUND.** `prove-first-touch.mjs` was watched failing on purpose with the referrer fallback reverted — and the first referrer case *threw*, the process died, and the remaining twelve checks never reported. The output was a stack trace, which is what a broken script looks like. Passing each assertion's value as a **thunk** and catching turns it into four named failures with the other thirteen still green. **The failure mode of a check is part of the check**, and it is only ever seen when you deliberately break the thing it watches.

## A number in the CSS is not the number on the screen

- **`width: 112px` RENDERED AT 145px, AND THE STYLESHEET STILL SAID 112 THE WHOLE TIME.** Both faults in the sticky admin column were this: the identity cell is content-box by default, so 112 plus 16px of padding a side came out at 145; and the checkbox cell declared `width: 40px` while rendering 52px, against a hard-coded `--sticky-offset: 40px`, so the identity column stuck 12px too far left and the two slid over each other. **Nothing in the file was wrong to read.** The declared number and the rendered number were simply different numbers, and only a measurement could say so.
  - **Where a constant in one file has to agree with a width in another, assert the AGREEMENT, not either number.** The probe now reads the checkbox cell's actual `getBoundingClientRect().width` and compares it to the computed `--sticky-offset`; `40 === 40` is a fact about the page, where `width: 40px` was only ever a request. Same shape as reading the exit status rather than your own echo.

- **`background: inherit` ON A STICKY CELL RESOLVES AGAINST ITS ROW, AND A `<tr>` IN `<thead>` HAS NO BACKGROUND.** Every body row was given an explicit white so the sticky cell would inherit something opaque. The header was forgotten, so the sticky header cell was transparent and the scrolling column labels read straight *through* "JOB TITLE" as a pile of overlapping words. **Twelve assertions passed**, including one that sampled a sticky cell's background — it sampled a *body* cell. The screenshot found it in one look.
  - The rule it breaks is already in this file — check for a CLASS of fault, not the instance in mind — and this is what the failure looks like in practice: `querySelectorAll('[class*="sticky"]').filter(transparent)` is four more words than the check that missed it, and it names both cells.
  - **And it is the exact division this file already draws:** state beats screen for whether it is CORRECT, screen beats state for whether it is FINISHED. The numbers said correct. The picture said not finished. `scripts/prove-sticky-column.mjs` now carries the widened check, watched failing on purpose with the rule removed and green on restore.

## Controls wrap; content scrolls

- **Never `overflow-x` on a control row anywhere in the product.** A sideways-scrolling row of filters or tabs hides whole controls behind an edge, with no affordance, inside a page that scrolls vertically — so the control that is off-screen may as well not exist. Wrap them. **Content is the opposite:** a wide table or a heatmap has nowhere else to go, and `overflow-x` on `.tableWrap` or a heatmap is correct and stays. The test is what the element holds, not how wide it is.
  - Fixed 5 Aug 2026 in three places: `/candidates` `.filterStripLeft`, `/admin/analytics` `.tabBar`, and `/dashboard/analytics` `.tabBar` — the last inside a `max-width:768px` block, i.e. added *for* the width where it does the most harm. `/talent-pool` already wrapped.
  - **"Controls wrap" is necessary and NOT SUFFICIENT — a row can wrap and still have a child too wide to fit.** `/talent-pool` went `flex-direction: column` at ≤768 while keeping `align-items: center` from the base rule, so every child held its intrinsic width and sat centred in a narrower box: 589px of controls in 342px, overflowing both sides, right-hand side cut off by the page. **The second tab was not scrolled out of reach, it was gone** — an employer on a phone could not tap "All Applicants" at all. Going column means `align-items: stretch` and children sized to the row, not to their content.
  - **The walk check needs BOTH halves, and the first one is blind to this.** `scrollWidth > clientWidth` where `overflow-x` is auto/scroll finds scrollers — nine faults so far — and reported *zero* on the clipped page, correctly, because a clipped element is not a scroller. Add: (a) `scrollWidth > clientWidth` where overflow-x is **visible/hidden/clip** — unreachable rather than swipeable, and worse; (b) any leaf element whose `getBoundingClientRect().right` exceeds the viewport. Half one asks "can you scroll to it"; **half two asks whether it is there at all.**

  - **`display:none` on a control row is the same fault, louder.** `/candidates` hid the result count and Clear filters entirely below 600px rather than wrapping them. A control that disappears at a width is not responsive, it is missing. (**This entry said 640px until 29 Aug 2026.** `/candidates` has no 640 breakpoint at all — the only 640 in that file is a `max-width` on a paragraph. Corrected from the stylesheet, not from memory.)
  - **AND THE COUNT IS THE SMALL HALF OF IT. THE HALF THAT MATTERS IS THE UNDO.** That row also holds `Clear filters`, and the OTHER clear lives inside the empty state — which by definition only renders once somebody has filtered down to **zero**. So the person who is actually stuck is the one who filters and gets *some* results they did not want: no empty state, no clear control, and no way back except reloading the page. Driven 29 Aug 2026 on `/jobs` at 390 — a search for "chef" gives 160 of 251, and at that moment there was nothing on the screen that would undo it.
    - **The first drive of this picked the wrong filter and would have proved nothing.** Clicking `Remote` takes the board to zero, because every live listing is in person — and at zero the empty state and its own clear button appear, so the candidate recovers. Every experience level gives zero too. **A check for this fault has to leave results on the screen**, or it is testing the state the fault is not in.
  - **`/jobs` WAS MISSED BY THE 5 AUG 2026 SWEEP TWICE, IN THE SAME TWO RULES, AND IT STOOD FOR TWENTY-FOUR DAYS.** Both were fixed on `/candidates` that day and both were left on `/jobs`: the strip that scrolled sideways (`overflow-x: auto` with `scrollbar-width: none` and a `display:none` webkit scrollbar) and this `display: none` on the right-hand row. Fixed 29 Aug 2026.
    - The two pages carry the SAME CLASS NAMES — `.filterStrip`, `.filterStripInner`, `.filterStripLeft`, `.filterStripRight` — so both fixes were the `/candidates` declaration copied byte for byte, and **neither needed a design decision at all.** The answer already existed; only nobody had asked whether it applied twice.
    - **SO THE QUESTION A SWEEP HAS TO ASK IS NOT "HAVE I FIXED THIS PAGE", IT IS "DOES THIS PAGE HAVE A TWIN?"** A grep for the class name being changed answers it in seconds and would have caught both of these on the day. Fixing one of two identical components is worse than fixing neither, because the survivor then looks deliberate.

- **WHERE A REDIRECT SENT SOMEBODY AND WHERE THEY CAME TO REST ARE DIFFERENT QUESTIONS, AND ONLY ONE OF THEM IS USUALLY UNDER TEST.** The recovery-landing control asserted the resting path and read **FAIL** on production behaving exactly as designed: `/auth/confirm` sent them to `/dashboard` — the thing being measured — and the app then forwarded an employer on to `/employer/dashboard`, which is correct and has nothing to do with the route's decision. A red on the CONTROL is the worst place for this, because the control is what licenses everything below it. Assert the route's own `Location` header, which cannot be confused by a downstream forward.

- **A BROWSER SIGN-IN IS THE WRONG INSTRUMENT FOR "WHAT IS THE PASSWORD", AND A DRIVE THAT CHANGES PASSWORDS IS EXACTLY WHERE IT WILL LIE.** The restore check signed in through `/login` and failed — after the same run had already fired several sign-ins and two password updates inside two minutes, which is what Supabase rate limits on. **A throttled login page is indistinguishable on screen from a wrong password.** The run printed `THE TEST EMPLOYER PASSWORD IS NOT RESTORED`, which was false, and false in the expensive direction: it sends the next person to repair a fixture that is fine. `signInWithPassword` against the auth API answers the actual question and does not care about the page. State beats screen for whether it is CORRECT — and "is this the password" is a correctness question.
  - And assert the other half: **the temporary password must now be REJECTED.** "The standing password works" passes just as happily if the update never landed at all.

- **`npm run deploy-ready` is the ONLY way to ask whether a deployment is live. Never probe a URL.** Three probes lied in one day, each chosen to fix the last and each with the identical flaw — the root returning 200 (Vercel's SSO page), a curl for body text (client-rendered, so the text is never in the response), and `/robots.txt` returning 200 (served happily *while still building*, so an entire sweep ran against the "Deployment is building" placeholder and produced fifteen false findings). **Every one asked whether something ANSWERED rather than whether it was OURS, and something always answers.** The deployment record has never lied. The script reads it, exits 0 only on READY, and prints the URL to drive — which also settles the hostname rule, since the URL comes from the record instead of being guessed. A missing token exits 2 with SKIP and says explicitly not to fall back to curling.

- **`curl` cannot see a client-rendered page at all — not "can be wrong", cannot see it.** A readiness check that greps the served HTML for body text will never match on a `'use client'` page: the response is the shell plus a Suspense fallback, and every word the component renders arrives after hydration. On 5 Aug 2026 a poll for a new subtitle on `/candidates` ran for a quarter of an hour against a deployment that had been READY the whole time, and the loop could not have matched at any point.
  - **The dangerous part was the rule, not its absence.** The check was written *because* of the earlier auth-page 200 — its comment reads "proved by the new subtitle being in the HTML, not by a 200" — so the right lesson was applied confidently to the one kind of page it does not fit. A correct rule in the wrong place is harder to see than no rule.
  - Readiness for a client-rendered page: **run a browser, or read the deployment record.** For a server-rendered route or an API, grepping the response is still fine — the API route check (`grep -q '"cohort"'`) that same day was correct.

- **The ceiling on a client-filtered page is rows sent, not filters run.** `/candidates` does `select('*')` once and every filter is a client-side memo, so re-running the whole predicate per active filter — which is what the answer line's "drop this one" needs — costs nothing. Fine at 44 candidates. Not fine at 4,400, and shipping every row to the browser is what breaks first, long before the recompute does. When that page needs work, the number to look at is how many rows leave the database.

- **A PATH IS NOT A FILE, AND `executablePath()` RETURNS ONE WHETHER THE BINARY EXISTS OR NOT.** Playwright's `webkit.executablePath()` computes where the browser *would* live and hands it back regardless, so it was used as an existence check and reported WebKit available when nothing was installed. The launch then failed three steps later, which reads as a broken script rather than a missing download. Same shape as half the instrument faults this week and as the substring rule above: **a question whose answer is identical in both states cannot tell you which state you are in.** Ask the filesystem, or just launch it and catch.

- **A GLYPH IN A FILE DOES NOT HAVE TO BE WRITTEN AS A GLYPH, so a text search for one finds a fraction of them.** An emoji inventory reported SEVEN on stranger-facing surfaces. The real number was thirty-seven, and the seven were simply the ones typed literally. The rest were `&#128188;` HTML entities, `\u{1F4BC}` code-point escapes and `\uD83D\uDCAC` surrogate pairs — every one of which renders as an emoji and none of which is an emoji in the bytes. **Decode before you detect**, and give the encodings their own controls: a detector that has never been shown an entity has not been tested on the thing that beats it.
  - It was caught by DRIVING, not by reading. The check called the employer dashboard clean; the browser showed 💼 and 💬 on it. **A source-text search answers "what does this file say", never "what does the page render".**
  - The same blindness put a correction into a report: "nothing in the codebase renders a bolt at all" was true of every literal ⚡ — all three were in comments — and false of the product, because `&#9889;` puts one on Boost Profile twice.

## A habit that has earned its place

- **For any control, ask which states the object can actually be in, and whether the control should exist in each.** The gate always gets written for the state in mind while building — the fresh, happy one: no comments yet, no jobs yet, shift still open. The states that come *later* are the ones nobody looked at. Three bugs so far were this exact shape: a reply button that only existed once someone had replied; a section that only rendered once a job was posted; Close only existing while a post was open.

- **WHEN YOU REMOVE A FAULT, ASK WHAT IT WAS HOLDING UP.** A bug is not only a defect; it is a thing that is *there*, and other behaviour can be resting on it. Removing it removes that too, silently, and the removal looks like exactly the tidy fix that was asked for.
  - **The worked example, 31 Aug 2026, and it was one deploy from a rejection.** The sidebar's hamburger painted on top of the full-screen account menu, over the avatar. Fixing that was the whole task. But the close-on-click-outside handler asks `profileMenuRef.contains(target)` — a **DOM** question — and the sheet is a **child** of the ref, so no tap on it has ever counted as outside. At full screen there is nothing else on the page to tap. **Five taps, all still open.** The only controls in it navigate, and one of them is Log out.
    - **THE HAMBURGER *WAS* THE WAY OUT.** It is outside that ref, so tapping it fired the handler and closed the sheet. Measured on production before the merge: `the hamburger toggle position — CLOSED, stayed on the page`. Ship the fix alone and an App Store reviewer gets an account menu they cannot leave, on a screen they have to use.
  - **THE ASK WAS PRECISE AND CORRECT, AND ANSWERING ONLY IT WAS THE FAILURE MODE.** Nobody could have written the ticket differently — the dependency is invisible until the fault is gone. Which is why the question has to be asked *after* the fix and *before* the merge, not at the point the work is scoped.
  - **Second instance in three days** — Paul's own, on the A2 negative control, which killed half a spec for the same class of reason. Recorded here as his observation; the details are not re-derived in this file, but the shape is identical: something was leaning on the thing that was removed.
  - The cheap habit: **after removing anything — a fault, a fallback, an overlap, a control — name what could have been depending on it, then go and drive that.** It is one extra question and here it was the difference between a fix and a worse bug.

## The duplicate hold

- **A duplicate VERDICT CAN OUTLIVE THE PAIR IT WAS ABOUT, and then nothing shows it.** `/admin/duplicates` lists groups of two or more, so if one row of a resolved pair is later deleted, the survivor keeps `duplicate_hold.verdict` but has no group — it disappears from "already decided" and **its verdict can never be undone from the page**. The row is then permanently exempt from ever being flagged again, invisibly. Found 5 Aug 2026 on Joseph Mallia, whose partner was a test signup that had been deleted; cleared by hand.
  - Rare, because it needs a profile deletion, which is not something the product does on its own. **When it is next touched, the fix is one of two:** clear a verdict when its partner disappears, or list orphaned verdicts somewhere reachable.
  - The general shape is worth more than the instance: **a decision recorded against a relationship needs to know what happens when one side of the relationship goes away.**

- **"Flagged · still visible" IS A CLAIM THE PAGE NEVER CHECKS, AND IT IS WRONG ON A LIVE ROW TODAY.** The badge is chosen from `r.state`, which comes from the *hold record* — `{r.state === 'flagged' && "Flagged · still visible"}` — and `is_discoverable` is never read. A profile with no hold is therefore labelled "still visible" whatever its actual visibility. `mikri8ea@gmail.com` is labelled that way and is hidden. The page's own explainer repeats it: *"Flagged means an existing profile that is still visible and always has been"*.
  - Same family as measuring the container instead of the cards: the label is correct about the HOLD and silent about the question it appears to answer. **A badge that states a fact must read that fact.**

- **ONE CANDIDATE IS HIDDEN BY OUR ACCIDENT AND NOTHING WILL EVER UN-HIDE THEM.** `mikri8ea@gmail.com`, created 28 Jul 2026 04:05 — **two days after** the signup default flipped to visible, with `true` rows on either side of it. Job title AND CV present, `duplicate_hold` NULL, no discoverability notice, so the flip can never touch them. A real candidate with a complete profile is invisible to every employer.
  - **The discriminator was the sign-in, not the profile.** The tempting second explanation is that they hid themselves with the dashboard switch — which writes exactly this column and leaves no trace, because `candidate_profiles.updated_at` never moves. But `auth.users.last_sign_in_at` equals their `created_at`: they have never been back, and you cannot use a dashboard you do not sign in to. Control: `bimalkarki2052@` signed in again on 14 Aug, so the field does move and the check can tell the two apart.
  - **THE FIX IS NOT TO SET THE COLUMN.** They were never notified, and flipping an un-notified person is precisely what notify-then-flip exists to prevent. They belong in a notice run with a real 14-day window — which is a decision to email a real candidate, and so Paul's, not a session's.

- **THE DEDUP CANNOT SEE A CANDIDATE WHOSE NAME IS NOT IN LATIN SCRIPT, AND THAT IS A CLASS OF PERSON, NOT AN ODD ROW.** `nameMatchKey` filters `[^a-z\s]`, so a complete, several-word name in Cyrillic, Arabic, Greek, Chinese or any non-Latin script is stripped to **nothing** and produces no key. One live candidate is in exactly that state today. **They are permanently unkeyable** — no state their profile can reach will ever be matched on, unlike a one-word name which the person can complete.
  - **On a London hospitality board this is not a curiosity.** It is a predictable and growing share of real candidates, and every one of them is invisible to duplicate detection in both directions: they can duplicate freely, and a genuine duplicate of them will never be held.
  - **WHAT ELSE INHERITS IT: only the duplicate-hold system.** Checked 26 Aug 2026 — `nameMatchKey` is read by `lib/applyDuplicateHold.ts`, `/api/admin/duplicates` (grouping, the decide handler, and the unkeyable count) and the scripts. **Search, matching, alerts and notifications do not use it**, so the blind spot does not reach candidate discovery or employer results. Worth re-checking before anything new keys on it.
  - **Not being fixed yet — Paul's call, logged deliberately rather than left in a commit message.** The panel already tells the truth about it: `unkeyableReason()` returns `'non-latin'` distinctly from `'one-word'`, and the copy puts the limit where it belongs — *"Our matcher only reads Latin letters, so it cannot key this name. Nothing they can change."* **Labelling it "a single-word name" would have been confidently, specifically wrong about a real person.**
  - When it is fixed, the shape is probably Unicode-aware normalisation (`\p{L}` with NFKD folding) rather than transliteration, which invents a spelling nobody chose — the same objection as an invented name.

- **Email cannot find our duplicates.** Both real pairs carry two different addresses and no two rows share even a local-part, so a dedup keyed on email would have caught neither. The key is the name's words, lowercased, bracketed nicknames dropped, and **sorted** — "RODRIGUE TEGUE FOTUE" and "RODRIGUE FOTUE TEGUE (Rodders)" are one man with his names in a different order, and an unsorted key sees two people. Single-word and initials-only names produce no key at all and can duplicate freely — the deliberate trade, because "Adnan" matching every other Adnan hides real people.
  - **THE NUMBER IS TWELVE. THIS ENTRY SAID SEVEN, AND MY OWN CORRECTION TO IT SAID SIX — BOTH TOO LOW, AND THE SECOND ONE WAS WRONG FOR THE INTERESTING REASON.** Measured 26 Aug 2026: 56 keyable, **12** not. The six came from a SQL query that reimplemented the rule as "strip brackets, split on whitespace, fewer than two words". `nameMatchKey` does two more things, and both matter:
    - it filters `[^a-z\s]` — so a name in a **non-Latin script is stripped to nothing**, however many words it has;
    - it drops tokens of one character — so **"Adnan K" is not two words**, it is one.
    The breakdown: **6 genuinely one word · 5 multi-word with a single-letter token · 1 multi-word non-Latin.** The restatement found only the first group and missed half the population.
  - **THE SQL WAS WRITTEN THE SAME HOUR AS A RULE SAYING "READ THE RULE, DO NOT REIMPLEMENT IT", AND BROKE IT WHILE MEASURING WHETHER TO APPLY IT.** The measurement felt too cheap to need the discipline — it was one query, read-only, for a count in a report. That is exactly where a second copy gets made. **A count is a query, and a query restating a rule is a second copy of that rule**, with all the drift and none of the visibility, because nothing type-checks a SQL string against a TypeScript function. The fix was to import `nameMatchKey` in a throwaway script instead: `scripts/count-unkeyable-names.ts`.
  - **THE NON-LATIN ROW IS A REAL FAULT AND NOT A COUNTING CURIOSITY.** That candidate gave a complete, several-word name; our matcher discards every character of it. They are **permanently** unkeyable — there is no state their profile can reach that we will match on — and calling that "a single-word name" on the admin page would be confidently, specifically wrong about a real person. `unkeyableReason()` lives beside `nameMatchKey` and returns `'non-latin'` distinctly for this, and the panel's copy says the limit is ours: *"Our matcher only reads Latin letters… Nothing they can change."*
  - **One of the twelve joined on 25 Aug 2026**, so this is a live ongoing state and not a historical tail — and the number will be wrong again by the time you read it, which is the argument for the panel computing it rather than anybody typing it anywhere, including here.
  - **WHICH IS WHY /admin/duplicates COMPUTES IT RATHER THAN STORING IT.** The panel derives the list live from the names, so it is right on the first day, costs no write to a real candidate's row, and **drops on its own when somebody completes their name.** The alternative that was built first — stamping a record at signup — would have dated a row today about a state true since July, left day one showing zero because the existing rows had never been stamped, and gone on asserting it after the person fixed it.
  - **THE GENERAL SHAPE, and it is the one worth carrying: ASK WHETHER THE THING IS AN EVENT OR A PROPERTY BEFORE DECIDING TO RECORD IT.** A lookup that errored HAPPENED, at a moment, and is unreconstructable afterwards — it must be written down as it occurs or it is gone. A name with fewer than two words is still true and still readable, so deriving beats storing every time. Both look like "the check could not run"; only one of them is a fact about a moment. Same family as `area` vs `area_county` — two things of the same type that are different kinds of thing.

## The iOS app — things that will not be obvious in a year

- **THE APP PRIVACY LABELS ARE A PUBLISHED DECLARATION, AND NOTHING ELSE IN THIS REPO RECORDS WHAT WAS TICKED.** Published 27 Aug 2026 against Apple ID **6805802815**. **Eleven data types, ALL linked to the user, NONE used for tracking:**

      Name · Email Address · Phone Number · Physical Address
      Emails or Text Messages · Photos or Videos · Other User Content
      User ID · Device ID
      Product Interaction · Search History

  **Purposes:** App Functionality on all eleven. **Analytics** additionally on Product Interaction and Search History (our own first-party analytics — `job_views`, `job_click_events`, `job_impressions`, surfaced on the two analytics pages; first-party analytics is NOT tracking). **Developer's Advertising or Marketing** additionally on Email Address, because the roundup and digest are marketing sent directly to users.
  **Answered NO:** Tracking, Financial Info, Location, Sensitive Info, Health, Contacts, Browsing History, Purchases, Diagnostics, Surroundings, Body.
  - **SEARCH HISTORY WAS VERY NEARLY DECLARED FALSELY.** A first pass reported "no third-party analytics, so nothing to declare" without ever asking whether WE store searches. We do: `job_impressions.search_query`, 5,102 rows, 4,558 linked to a user, written by `hooks/useAnalyticsTracking.ts:110` from `app/jobs/page.tsx:523`. It was the single label that would have been false, and it came from being told to go and look rather than re-assert.
  - **DIAGNOSTICS IS NO, AND IT WAS MEASURED THREE WAYS** rather than inferred from an absent package: no `@sentry/*` or equivalent in dependencies; the Web Analytics API returns `404 {"code":"not_found"}` for the project; and Speed Insights shows its Get Started page with "No events collected". An absent package is suggestive; those three together are an answer.

- **THE LABELS DESCRIBE THE BINARY AND THE PRODUCT AS SUBMITTED, NOT THE ROADMAP — AND OVER-DECLARING IS NOT THE CAUTIOUS SIDE.** They render publicly on the store page where candidates read them, and they are editable at any time WITHOUT resubmitting a build. So declare what is true now and revise when it changes; there is never a reason to tick something "just in case". **A future version submitted with different behaviour and the same labels is a false declaration**, and nobody will remember what was ticked in August. These are the moments to recognise:
  - **DIAGNOSTICS becomes YES (Performance Data)** the day `@vercel/speed-insights` is installed **OR** Speed Insights is enabled on the Vercel project. **Two separate switches and either one flips it** — the package without the setting, or the setting without the package, both collect.
  - **TRACKING becomes YES, and an ATT prompt becomes mandatory**, the day any third-party analytics, advertising or attribution SDK ships. Given the LinkedIn and Google outreach, **the LinkedIn Insight Tag and the Meta pixel are the likely ones** — and a marketing tag is exactly the thing that gets added by someone who is not thinking about a privacy declaration.
  - **PRODUCT PERSONALIZATION attaches to Physical Address** the day recommendations rank on location, **and to Other User Content** the day `cv_derived` actually feeds matching. It scores nothing today, which is the only reason it is not declared now.
  - **FINANCIAL INFO becomes YES** the day anything is purchasable. Profile Boost is a real IAP when it comes; employer tiers stay on the web and must not become reachable in-app.

- **APPLE'S PRIVATE RELAY REWRITES THE SENDER, NOT JUST THE RECIPIENT — WHICH IS WHY THE EMAIL-SOURCE REGISTRATION IS A DELIVERY DEPENDENCY AND NOT A CHECKBOX.** A welcome email that reached a Hide My Email candidate on 27 Aug 2026 arrived from:

      noreply_at_thrivecareer_co_uk_gy89tg2wpz_63025b5d@privaterelay.appleid.com

  Apple mints a per-sender, per-recipient address on OUR domain's behalf. **An unregistered sending domain has nothing to rewrite from, so the message is DROPPED — not delivered badly, not bounced to a human, just gone.** Register outbound domains at Certificates, Identifiers & Profiles → Services → Sign in with Apple for Email Communication → Email Sources.
  - **THE STATUS COLUMN THERE IS THE ANSWER, AND IT SETTLED A QUESTION OUR OWN DNS COULD NOT.** `thrivecareer.co.uk`'s SPF authorises Namecheap (`include:spf.privateemail.com`) and NOT Resend; Resend's SES include lives on the unused `send.` subdomain. But Resend's DKIM IS on the root, with DMARC `p=none` and relaxed alignment. **Reasoning from the first fact alone says "edit DNS"; from the second alone says "it is fine".** Apple accepted the domain and showed a green SPF tick, and no DNS edit was needed. When two of your own facts do not settle a question and a third party will simply tell you, **go and read their answer** — it took four minutes.
  - And the tick is not delivery. It says the DOMAIN is accepted. Only a message landing in the forwarding inbox proves the path, which is a human opening a different Google account — the send-only Resend key cannot report it back.

- **EVERYTHING IS FREE FOR AT LEAST TWELVE MONTHS (decided 27 Aug 2026), SO THE APP TAKES NO MONEY AND `Financial Info` ON THE PRIVACY LABELS IS `No`.** Stripe is in the codebase but is not reachable and collects nothing. If that changes it is a new version and a new label, which is normal and fine.
  - **THE TRAP IS TWELVE MONTHS OUT AND IT IS CHEAP NOW AND EXPENSIVE LATER.** The day employer billing becomes reachable INSIDE the iOS app, Apple wants its commission — and by then the app is live, employers are using it, and taking the route away is a worse conversation than never adding it. **Design the wrap so employer billing is never reachable in-app.**
  - **CANDIDATE PROFILE BOOST, when it comes, IS an in-app purchase and should be built as one.** A digital feature, consumed in the app, bought by a consumer: Apple will require IAP and is right to. Sending a candidate to a website to pay for something small costs more in abandonment than the commission does.
  - **EMPLOYER TIER SUBSCRIPTIONS STAY ON THE WEB.** A B2B service consumed outside the app has a decent exemption argument, and reviewers apply it inconsistently — we do not want a submission to hinge on winning an argument. Employers are on desktop anyway and it is a considered purchase.

- **THE iOS PIPELINE IS GITHUB ACTIONS ON HOSTED macOS RUNNERS. NO MAC IS REQUIRED AT ANY STAGE.** Decided 28 Aug 2026, and it is the second time the same decision has been taken — worth writing down precisely because it drifted once without anyone noticing.
  - **XCODE CLOUD WAS CONSIDERED AND REJECTED.** Apple's own first-workflow documentation puts two steps in **Xcode**: "Select a Product" (Report navigator → Cloud → Get Started) and "Grant Source Code Access" to GitHub. Only *after* a first workflow exists can further ones be managed in App Store Connect. So it needs a Mac once — which reintroduces the exact dependency the choice exists to remove. And **first pipelines fail several times, so the failures would arrive after the borrowed Mac had gone home.**
  - **A DISTRIBUTION CERTIFICATE CAN BE CREATED WITHOUT A MAC, AND THIS WAS DEMONSTRATED RATHER THAN ASSUMED.** A CSR is a plain PKCS#10 file: `openssl req -new -newkey rsa:2048 -nodes -keyout ios_dist.key -out CertificateSigningRequest.certSigningRequest -subj "/emailAddress=…/CN=…/C=GB"`. Run on this Windows machine it produces exactly what Apple asks for — 2048-bit RSA, sha256WithRSAEncryption — and the `.p12` export the runner imports works from the same key. **On Git Bash, `MSYS_NO_PATHCONV=1` is required or the `-subj` is silently rewritten into a Windows path.** The only step needing Paul is uploading the CSR and downloading the `.cer`.
  - **COST: ZERO. macOS RUNNERS ARE FREE ON THIS PUBLIC REPOSITORY, AND THE NUMBER SAYS SO.** GitHub's billing page for 28 Aug 2026, after the first build: *Actions macOS 3-core · 2 min · $0.062/unit · gross $0.12 · **billed $0***.
    - **THE LINE THAT WAS HERE BEFORE WAS WRONG** — "~200 macOS minutes a month at the 10x multiplier". That is PRIVATE-repo economics applied to a public repo, and it was written from an assumption neither side had checked. It is corrected from the invoice rather than from a better argument, which is the only way this file should ever change a number.
    - **THE 3-CORE STANDARD RUNNER IS *WHY* IT IS FREE.** `macos-15` is a standard image; a `-large` or `-xlarge` runner would be charged even here. Pin standard, deliberately.
    - **CONSEQUENCE: ITERATION IS FREE, SO STOP TREATING MINUTES AS SCARCE.** `workflow_dispatch`-only stays, but it is now a convenience rather than a cost control — and if the repository ever goes private the same build costs about **$0.12** a time, which is the real price of that decision.
  - **`ci_post_clone.sh` IS XCODE CLOUD'S CONVENTION AND ACTIONS WILL NEVER RUN IT BY ITSELF** — the workflow CALLS it rather than copying its assertions, so there is one source of truth. It was changed to resolve paths from its own location (`dirname "$0"`) instead of assuming the caller's working directory, which is what makes one script serve both.

- **THE FIRST SIGNED BUILD, 28 Aug 2026 — THE NUMBERS, SO THE NEXT ONE HAS SOMETHING TO DIFFER FROM.** Run #3: compile 95s, archive 71s, 2m 46s of job time, billed $0.

      identity imported        1 Apple Distribution
      profile name             Thrive App Store
      profile UUID             51b59794-0d04-42ca-bfd0-c0a7f2bcbceb
      application-identifier   7RTA2FH8C7.uk.co.thrivecareer.app
      profile expires          28 Aug 2027 11:42:43 UTC
      export method            app-store-connect — ACCEPTED by Xcode 16.4
      artefact                 App.ipa, 677,471 bytes
      signature                Apple Distribution: Thrive Career Platform LTD
                               → Apple WWDR CA → Apple Root CA, DR satisfied

  - **`method: app-store-connect` IS ACCEPTED — observed, not predicted.** It was the failure I expected and it did not happen. `app-store` remains the fallback if a future Xcode rejects it.
  - **THE .p12 CHANGED SIZE, 3267 → 3109 BYTES, and that is corroboration rather than trivia:** the `-legacy` re-export really did produce a different file, so what fixed it was the FORMAT and not a retyped password.
  - **ALL TEN ARCHIVE STEPS RAN — none skipped, and no assertion passed vacuously.** `App.app` was confirmed to exist before the two `test -f` checks inside it, so "the signed bundle carries its config and its web assets" is a statement about two files that were found rather than a step that did not fail.

- **THREE THINGS NOW EXPIRE SILENTLY, NOT ONE. ONLY ONE OF THEM HAS AN ALARM.**

      APPLE_CLIENT_SECRET_EXPIRES   22 Feb 2027   ← watched by applesecret:prove
      distribution certificate      28 Aug 2027   ← NOTHING WATCHES THIS
      provisioning profile          28 Aug 2027   ← NOTHING WATCHES THIS

  - **WHAT BREAKS IS DIFFERENT IN EACH CASE, WHICH IS WHY THEY ARE NOT INTERCHANGEABLE.** The Apple client secret lapsing stops every Apple SIGN-IN, for real users, silently. The certificate or profile lapsing stops the BUILD — nobody signs in worse, but no new version can ship, and the error arrives the next time someone runs the pipeline rather than at the moment it lapses.
  - **THE BUILD ONES ARE THE MILDER PAIR AND THAT IS THE ARGUMENT FOR LEAVING THEM.** A build failure is loud, immediate and in front of the person who caused it. A sign-in failure is silent, on somebody else's phone. Deliberately not alarmed as of 28 Aug 2026 — recorded so the omission is a decision rather than an oversight.
  - **THE PROFILE'S OWN EXPIRY IS PRINTED BY EVERY SIGNED BUILD.** The archive job reads `ExpirationDate` out of the profile and echoes it, so the date is in the log of the last build anyone ran rather than only here.

- **RUN 33242786326 (BUILD 8) COST A WHOLE ARCHIVE TO LEARN TWO THINGS ABOUT THE BUILT PRODUCT. THEY ARE HERE SO NOBODY SPENDS ANOTHER ONE.** The build was CORRECT and our own assertion failed it, taking a valid 771,295-byte `.ipa` with it.
  - **LOCAL SPM PLUGIN PACKAGES LINK STATICALLY INTO THE APP BINARY ON THIS PIPELINE. ABSENCE FROM `Frameworks/` IS EVIDENCE OF NOTHING.** The built bundle held `Capacitor.framework` and `Cordova.framework` and nothing else — both come from `capacitor-swift-pm`, which is dynamic. `CapacitorBrowser.framework` does not exist and is not supposed to. **Do not read a short Frameworks listing as a missing plugin.**
  - **THE SPM MODULE NAME DOES NOT SURVIVE A RELEASE ARCHIVE; THE RUNTIME IDENTIFIER DOES.** The binary carried `CAPBrowserPlugin` and did NOT carry `CapacitorBrowser`. The module name lives in mangled Swift symbols and is stripped. The identifier is a **string literal** — `public let identifier = "CAPBrowserPlugin"` — that Capacitor resolves through the Objective-C runtime, so it has to be present for the plugin to work at all. **Assert the identifier, never the module name.**
  - **AND THE TWO PLUGINS SHARE NO NAMING PATTERN**, which is why the identifiers are READ from each plugin's own source rather than derived: Browser is `@objc(CAPBrowserPlugin)`, App is `@objc(AppPlugin)` with no prefix. `prove-capacitor-plugins.mjs --print-identifiers` is the single source, and it exits non-zero rather than guessing when it cannot read one — **a check that invents its own search term can pass on nothing.**
  - **THE FAILURE MESSAGE WAS THE WORSE HALF OF THE FAULT.** It read "the native plugin did not reach the binary" one line beneath evidence that another one had. **A check that contradicts the evidence printed directly above it would have been believed**, and only a prediction made before the run stopped it being. A check may state what it searched for and what it found, and nothing else.
  - **STEPS RUN IN ORDER AND A FAILED STEP SKIPS THE REST** — observed here, not read from documentation: step 10 failed, step 11 `Keep the .ipa` was SKIPPED because it carries no `if:`, and step 12 `Remove the keychain` succeeded because it carries `if: always()`. **`Keep the .ipa` now runs BEFORE the assertion.** Keeping is not shipping: the upload is a separate job with `needs: archive`, so a red still blocks Apple. The point is that every run now leaves a binary behind, so the next claim about the built product can be checked against the built product instead of against a grep of one's own shell logic.

- **TWO THINGS BUILD 8 PROVED THAT WERE PREVIOUSLY ONLY ARGUED.**
  - **`npx cap sync ios` RUNS CORRECTLY ON macOS, so the decision to stop committing `Package.swift` is proven rather than reasoned.** The compile job's own log shows `npx cap sync ios`, `Writing Package.swift`, `Found 2 Capacitor plugins for ios`, and `prove-capacitor-plugins.mjs` passing against the generated file with both plugins declared and wired. All three predicted failure modes — sync erroring, sync writing nothing, sync missing a plugin — are ruled out by observation. **On WINDOWS the same command writes backslash separators that are invalid Swift escapes**, which is exactly why the file is generated on the runner and not committed.
  - **THE `GITHUB_RUN_NUMBER` BUILD-NUMBER OVERRIDE WORKS ON A REAL ARCHIVE.** `version in the BUILT Info.plist: 1.0 (8)` on run #8, read from the binary rather than from the command line. `project.pbxproj` still hardcodes `CURRENT_PROJECT_VERSION = 1`, and that is fine only because the workflow overrides it — **do not "tidy" that hardcoded 1 away without checking what sets it.**

- **AN UNKNOWN, RECORDED AS AN UNKNOWN: WHY DID `actool` NOT WRITE `CFBundleIconName`?** On run #5 (29 Aug 2026) the asset catalogue **compiled** — `Assets.car` in the bundle at 295,656 bytes, no warnings at all — and the built `Info.plist` still had no `CFBundleIconName`. Three explanations were checked and **none of them held**: the partial plist WAS passed to `infoPlistUtility` as `-additionalcontentfile assetcatalog_generated_info.plist`; our own `Info.plist` declared no icon key that could have shadowed it; and the compile emitted no warning. **Nothing in the log says why, and I do not know.**
  - **IT CANNOT BE PINNED ON XCODE 26 EITHER, BECAUSE THE TWO VARIABLES MOVED TOGETHER.** Run #4 had no icon FILE at all under Xcode 16.4, so the icon path has never once run under the old toolchain. There is no evidence this behaviour is new in 26 and none that it is old.
  - **WHAT IS KNOWN:** the single 1024 `universal` entry Capacitor ships expanded to exactly TWO sizes — `AppIcon60x60@2x` (120) and `AppIcon76x76@2x~ipad` (152) — and produced no 167. `TARGETED_DEVICE_FAMILY` is `"1,2"`, so Apple requires the iPad sizes.
  - **THE FIX DELIBERATELY DOES NOT DEPEND ON THE ANSWER.** Every size is enumerated, so each is a real file rather than something a tool infers, and `CFBundleIconName` is declared in our own `Info.plist` — which is literally what Apple's error asks for. **That is a WORKAROUND, not an explanation**, and it is written here as one: an unexplained mechanism that was routed around can come back, and the next person to meet it should find this note rather than re-derive it. If icons ever go missing again, start here.

- **THE ASSERTION PAID FOR ITSELF WITHIN A DAY OF BEING WRITTEN, AND THAT IS THE ARGUMENT FOR ASSERTING THE ARTEFACT RATHER THAN THE EXIT CODE.** The `Assets.car` / `CFBundleIconName` checks were added on 28 Aug because Apple had caught what our suite did not. **On 29 Aug they caught the same class of fault one job earlier and on our side** — a signed `.ipa` about to be kept and uploaded with no icon in the binary. Run #4 spent a whole dispatch and Apple's validator to learn that; run #5 learned it in the archive job.
  - The generalisation is not "add more checks". It is that the check had to read the BUILT PRODUCT. Every earlier assertion in that step was also about the built product, and they are why the diagnosis took minutes: the version, the encryption key and the URL scheme were all confirmed present in the same breath as the icon was found absent.
  - Sharpest form: **a check that reads the thing you are about to ship costs one job; a check that reads your inputs costs a dispatch; no check costs Apple's opinion, days later, in an error message written for somebody else's problem.**

- **A WARNING IS THE FAILURE MODE THAT SURVIVES EVERY CHECK YOU WROTE — AND ON 28 Aug 2026 IT SHIPPED AN APP WITH NO ICON PAST TEN GREEN ASSERTIONS.** Apple refused run #4's upload with five errors. Four were one missing file: `AppIcon-512@2x.png`. **`actool` treats an image a `Contents.json` NAMES but cannot find as a WARNING.** It printed two of them, the archive succeeded, every assertion in the archive job passed, the export succeeded, a signed 677KB `.ipa` came out — **and it contained no `Assets.car` at all.** Nothing went red until Apple looked, two jobs and one dispatch later.
  - **THE FILE WAS ON THE MACHINE THE WHOLE TIME, WHICH IS EXACTLY WHY NOBODY SAW IT.** `.gitignore` line 14 is `*.png`, with `!public/**` and `!app/**` exceptions written months before iOS existed and never extended to `ios/`. So the icon and three splash images were generated, sat on disk, rendered fine locally, and **were never committed**. **Presence on your machine is not presence in the repository**, and the runner gets the repository and nothing else. Same spine as "absence from a codebase is not absence from history", inverted.
  - **THE IGNORE RULE WAS CORRECT WHEN IT WAS WRITTEN AND BECAME WRONG WHEN THE PROJECT GREW A NEW KIND OF DIRECTORY, AND NOTHING ANNOUNCED THAT EITHER.** `*.png` with exceptions for `public/` and `app/` was a good rule for a Next.js repository in March. `ios/` arrived in August and inherited a prohibition nobody had written for it. **An exception list is a claim about which directories exist**, and it silently stops being true the day somebody adds one — the same way `/my-jobs`'s All Jobs tab fell through to a category that no longer meant "all". Whenever a rule enumerates places, ask what happens to the place that does not exist yet.
  - **THE CHECK THEREFORE ASKS THE ONLY QUESTION WITH TWO DIFFERENT ANSWERS: is it IN GIT.** `scripts/prove-ios-assets.mjs` walks every `Contents.json`, and for each named image asserts it exists AND is tracked. Asking "is it on disk" would have passed on the broken state. Watched failing on purpose by un-staging the icon — run #4's exact state — one named failure, exit 1, green on restore. `iosassets:prove` is in `verify` (38 checks now); it is filesystem-and-git only, so it runs everywhere and can never be a red nobody expects.
  - **A GREEN SUITE PROVES THE CHECKS YOU WROTE, NOT THE PRODUCT.** Ten of ten passed on a binary with no icon in it. There is no version of "the assertions were wrong" here — every one of them was correct about the thing it named. The suite was simply the shape of what I had thought of, and the product is a different and larger object. **The question after a green run is not "did anything fail" but "what did nothing ask about".**
  - **AND TWO ASSERTIONS MOVED ONTO THE BUILT PRODUCT**, because a catalogue can be present and still fail to compile: `Assets.car` must be in the bundle, and `CFBundleIconName` must be in the built `Info.plist`. **I asserted the things I had thought of — config, web assets, the encryption key, the OAuth scheme, the signature — and Apple checked the one I had not.** That is the general lesson and it is not about icons.

- **A DISPATCH INPUT EXISTED IN ONE OF THE TWO JOBS IT APPEARED TO CONTROL.** The fifth of Apple's errors was the SDK: built with Xcode 16.4 and the iOS 18.5 SDK, where Apple now requires iOS 26. There WAS an `xcode` input — and its "Select a specific Xcode" step lived **only in `compile`**. The `archive` job, which builds the shipped binary, never selected an Xcode at all. **Setting that dropdown could not have changed the uploaded artefact however it was set**, and it would have looked like it should have.
  - Same family as the `/candidates` media-query fix that sat above the shorthand and silently did nothing: **a control that does not reach the thing it names, where both the control and the thing are individually correct.**
  - Both jobs now run one step, and **it asserts the SDK VERSION rather than the Xcode name** — the name is a proxy, the number is what Apple reads. Default `newest26` picks the highest Xcode 26+ on the runner; **tested against the exact list run #4's runner printed, it chooses 26.3.0**, and a runner with no 26 exits 1 saying so rather than building something Apple will refuse.
  - **Xcode 26 has NOT been observed building this project.** It is on the image and the gate is correct. That is the next dispatch, not a claim.

- **A 409 VALIDATION VERDICT PROVES AUTHENTICATION SUCCEEDED — WHICH IS HOW RUN #4 CLEARED THE THREE ASC SECRETS WITHOUT TESTING THEM SEPARATELY.** The obvious reading of "upload failed at 31 seconds" is credentials, because the three App Store Connect secrets were the only unproven ones left. **It was not.** `altool` reached Apple, authenticated, submitted the binary, and Apple replied with content errors. **A bad key never gets a validation verdict at all** — it fails earlier and differently. So `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_API_KEY` are now proven, by a run that failed.
  - The .p8 PEM-header guard and the three emptiness guards **correctly did not fire**, and that silence was evidence rather than absence — the step they live in passed.
  - Recorded because the cheap wrong move was to have Paul re-enter three secrets that were fine.

- **THE MAC-FREE PATH IS PROVEN END TO END — APPLE ACCEPTED AN OPENSSL CSR.** Generated on Windows with `openssl req -new -newkey rsa:2048`, uploaded to the portal, and a distribution certificate was issued to Thrive Career Platform LTD. Then the `.p12` built from the same key, and a profile generated against it. **No Mac was involved at any point**, which was the whole basis of choosing GitHub Actions over Xcode Cloud, and it is now observed rather than reasoned.
  - The profile carries App ID `7RTA2FH8C7.uk.co.thrivecareer.app` — **a FOURTH party agreeing with the three the bundle-id check already watches**, and the only one of the four that comes from Apple's own record rather than our repository.

- **THE APPLE MARK READS SMALLER THAN THE OTHER TWO PROVIDER ICONS, AND IT IS ARTWORK, NOT CSS. NOT FIXED — here is the actual job, so the next person is not left with only "don't guess".**
  - **Measured 31 Aug 2026, and the boxes are already identical:** all three icons are `viewBox="0 0 24 24"` rendered at **20x20**, at **+16px** from the button top. Nothing in the CSS differs. **So no amount of sizing, padding or flex work will change this** — that avenue is closed and does not need re-checking.
  - **What differs is ink.** LinkedIn's path runs 0→24 on both axes — its last subpath is the full rounded square — so it fills its box edge to edge as a solid blue tile. Google's four paths span roughly 1→23. Apple's single silhouette spans about **69% of the width**, is one flat colour, and carries the mark's own built-in clear space. Three glyphs of the same box size and very different optical weight.
  - **THE JOB IS APPLE'S OWN BUTTON ARTWORK AND PROPORTIONS, NOT A HAND SCALE-UP AND NOT A TILE.** Sign in with Apple has published Human Interface Guidelines covering the mark's size relative to button height, its clear space and the permitted colourways, and Apple do police the button's appearance at review — so the fix is to take the proportions from their spec rather than to enlarge the glyph until it looks right, which is how you fail review for an aesthetic change.
  - **A tile or circle behind the glyph is the one option to expect to be wrong**, because their mark is specified to sit directly on the button surface in black or white. **Flagged, not settled — READ THE HIG BEFORE BUILDING IT.** That reading has not been done; this entry records which questions it has to answer, not their answers.
  - Cosmetic and on the sign-in screen, so it is worth doing properly once rather than quickly twice.

- **GOOGLE REFUSES OAUTH INSIDE AN EMBEDDED WEBVIEW, AND THAT IS THE LARGEST ITEM IN THE WRAP.** A full-page redirect to `accounts.google.com` from inside WKWebView comes back `disallowed_useragent`. It is deliberate, long-standing Google policy, not a bug and not something a header fixes. **Shipped as the shell stands, most candidates could not sign in** — Google is the provider they overwhelmingly use.
  - **Every OAuth hand-off has to LEAVE the webview** for `ASWebAuthenticationSession` — `@capacitor/browser`, or native Sign in with Apple. **PHASE 3**, and the biggest thing in it.
  - Found 28 Aug 2026 by reading the sign-in components before anything was built. It is the kind of fault that otherwise surfaces on a TestFlight build at the earliest, after the pipeline, the signing and the icons have all been done.
  - **IT IS READ, NOT DRIVEN.** Nothing has been launched, so this is Google's published policy rather than an observed refusal. Re-state it that way until a build exists to prove it on.

- **GOOGLE OAUTH LEAVES THE WEBVIEW THROUGH `SFSafariViewController`, NOT `ASWebAuthenticationSession` — AND THE NAME MATTERS BECAUSE IT DECIDES THE SHAPE.** `@capacitor/browser` opens the former; Capacitor's documentation says so in those words. **Both are SYSTEM browsers, so Google's policy is satisfied either way** — that part is unaffected. What differs is the RETURN: `ASWebAuthenticationSession` hands the callback URL straight back to the caller and dismisses itself, while `SFSafariViewController` does neither.
  - **THAT IS WHY THERE ARE TWO PLUGINS RATHER THAN ONE.** `@capacitor/browser` opens the sheet; `@capacitor/app`'s `appUrlOpen` catches the `uk.co.thrivecareer.app://` redirect, and we call `Browser.close()` ourselves. It is not a workaround — it follows from what the component actually does.
  - **THE FALLBACK, RECORDED SO IT IS NOT RE-DERIVED:** if the sheet misbehaves on a device — does not dismiss, loses the redirect, or the user lands on a blank Safari tab — **the next thing to try is a community plugin that genuinely wraps `ASWebAuthenticationSession`.** Two official Capacitor plugins were chosen over one community plugin deliberately, as the lower-risk first proof, not because the community one is wrong.
  - **BOTH HALVES OF THE SCHEME ARE REQUIRED AND EACH FAILS THE SAME SILENT WAY ALONE:** `CFBundleURLTypes` in `ios/App/App/Info.plist`, and `uk.co.thrivecareer.app://auth/callback` in **Supabase → Authentication → URL Configuration → Redirect URLs** (confirmed present in the allow-list 28 Aug 2026, read from the Management API). Miss either and the browser closes and nothing happens.

- **THE HAND-BACK WORKS ONLY BECAUSE THE PKCE VERIFIER IS A COOKIE ON OUR ORIGIN — A DECISION TAKEN MONTHS EARLIER, FOR UNRELATED REASONS, QUIETLY PAYING FOR THIS ONE.** `lib/supabase.ts` moved to `@supabase/ssr`'s `createBrowserClient` so client and server share ONE store; it was done to kill a drift/poisoning class of bug. **Had the verifier still been in localStorage the code could not be redeemed from the webview and the session would be stranded in the system browser** — a different and much worse problem, and one no amount of native plumbing would fix.
  - The chain: the webview starts the flow and writes the verifier in its own jar → the sheet authenticates in the system browser → the provider returns a `code`, **a bearer artefact IN A URL, not a cookie** → the webview navigates to `/auth/callback/<role>?code=…` → that request carries the verifier, so the EXISTING server route exchanges it and sets the session in the webview's jar. **Nothing is ever extracted from the system browser's cookie jar.**
  - Step five is the route already running in production for every web sign-in. **The only novel part is that the middle step happens in a different browser** — which is why the risk here is much smaller than it first looks.

- **THERE ARE FOUR SIGN-IN PATHS, NOT THREE: GOOGLE, APPLE, LINKEDIN, AND EMAIL/PASSWORD.** Every prompt and report on this project has said "the three OAuth flows — Google, Apple and email", and **LinkedIn was simply dropped**. It is real and live: `components/LinkedInSignInButton.tsx` calls `signInWithOAuth({ provider: 'linkedin_oidc' })`. So there are **three OAuth providers plus email**, and any webview work has to carry all three.
  - Worth its own line because the miscount was repeated confidently for weeks by both sides, and a sign-in path nobody lists is a sign-in path nobody tests.

- **`ITSAppUsesNonExemptEncryption` IS `false`, AND THE REASON IS A FACT ABOUT WHERE OUR CRYPTO RUNS RATHER THAN A CONVENIENT ANSWER.** It is a regulatory declaration logged against the developer account, not a way to silence a prompt — so it is worth being able to justify. Checked 27 Aug 2026: **not one client component ships cryptography.** Every HMAC and key operation we perform lives server-side on Vercel — `lib/appleClientSecret.ts`, `foundingApprovalToken`, `inviteCode`, `jobDigestToken`, `stayHiddenToken`, `webpush`. The iOS binary would carry HTTPS through the OS, Sign in with Apple, and Keychain, all of which are exempt.
  - **Re-check this if the app ever gains offline storage, its own token signing, or a bundled build.** The answer changes with the binary, not with the product.

- **A FINDING HAS A DATE, AND A DATE IS NOT A FACT — TWICE IN ONE DAY, BOTH FROM A REPORT SOMEBODY HAD READ RATHER THAN A STATE SOMEBODY HAD CHECKED.** On 27 Aug 2026 two items arrived described as live faults. Both had been fixed on the 26th:
  - **"`lib/signPdf.ts` prints the signer's IP into the retained PDF"** — removed, and `SignatureBlock` no longer even ACCEPTS an ip, so passing one is a compiler error. `job_offers` also had zero rows, so no stored document could have carried one anyway.
  - **"the delete button only records a request and emails a human, so erasure waits on Paul"** — rewired on the 26th for Guideline 5.1.1(v). The button calls `/api/account/delete`, which authenticates the caller as themselves and `await`s `eraseAccount` inside the request. Nobody is in the loop.
  - **Neither cost anything, and the reason is the same both times: the instruction was to VERIFY BEFORE ACTING, and verifying took minutes.** Acting on either would have meant "fixing" something already fixed, and in the second case rewriting a public policy to describe a workflow that no longer existed.
  - **THE SOURCE WAS A ROLLING GMAIL DRAFT** — the same mechanism named in the entry below, where three contradictions lived until only two could be evidenced. A report is a photograph. **Before acting on a finding older than today, re-read the thing it describes**, and say in the report which state you observed rather than which report you read.

## Deleting an account

- **AN EMPLOYER CANNOT SELF-DELETE, AND THE GATE THAT STOPS THEM IS NOT THE ANSWER — IT IS A HOLD WHILE A PRODUCT DECISION IS MADE.** Added 27 Aug 2026 because the fault was live: `/settings/privacy` is shared by both roles, the delete panel was not gated, and `/api/account/delete` did not check role either. **Nine employer accounts could have lost their login while 319 adverts — 251 of them live on the public board — stayed behind owned by a user id that no longer existed.**
  - **THE ERASURE PLAN IS CANDIDATE-SHAPED.** Every rule in `lib/erasure.ts` reasons about a candidate. `employer_profiles`, `jobs` and `subscriptions` are not in it, **and none of those three tables has a foreign key**, so nothing cascades and nothing would have warned anybody.
  - **THE SIGNAL IS A ROW, NOT A CLAIM.** The gate asks whether the caller owns an `employer_profiles` row. It must never key on `user_metadata.role`, because **the user can rewrite that themselves** with `supabase.auth.updateUser({ data: { role: … } })`. Where the client's idea of its role and the database disagree, the database wins. A fixture whose metadata says employer but who owns no profile row is erased normally, which is exactly the discriminator the proof runs.
  - **THE CHECK GOES BEFORE `eraseAccount`, NOT INSIDE IT.** A refusal arriving after the first table is a half-erased account that also returned a tidy error.
  - **A TEAM MEMBER IS DELIBERATELY NOT CAUGHT** — they own no profile row, `employer_members` IS in the plan, and their leaving costs the employer nothing.

- **THE REAL QUESTION, WHICH NOBODY HAS ANSWERED: WHEN AN EMPLOYER LEAVES, WHAT HAPPENS TO EVERYTHING THAT IS NOT THEIRS ALONE?** Do not read the gate as the job being done.
  - **The adverts.** 319 of them, 251 live. Archived, or left ownerless? **An advert with no employer behind it is a promise to a candidate that nobody can keep.**
  - **The applications underneath them.** Candidates applied to those jobs. That is candidate data the employer holds as controller — it does not vanish because the employer's login does.
  - **The subscription and the founding-cohort entitlement.**
  - **AND THE LEGAL SHAPE, so the gate is not mistaken for dodging an obligation:** the erasure right covers the ACCOUNT HOLDER'S personal data — their name, their email. The company's job adverts are business records, and the applications under them are candidate data held by the employer as controller. **Routing a business account to a human is a legitimate answer and it is what most B2B products do.** It is not a workaround.
  - The screen sends them to **contact@thrivecareer.co.uk**, which is proven to receive real inbound mail. Do not print an address here that has not been tested — `privacy@` was on the policy four times and never existed.

- **THE 24-MONTH ANALYTICS ROW IS A FAULT WITH A FUSE ON IT, AND THE FUSE IS THE USEFUL FACT.** The privacy policy says *"Usage and analytics data — 24 months — then anonymised or deleted"*. **Nothing prunes them.** There are seven crons — activation-emails, interview-reminders, job-expiry, reap-unconfirmed, job-digest, discoverability-flip, duplicate-release — and none touches `job_views` or `job_impressions`.
  - **It is not false yet.** Measured 27 Aug 2026: the oldest view is 18 Jun 2026 and the oldest impression 19 Jun 2026, both about two months old. **It becomes false in JUNE 2028 and nothing will act.**
  - Left alone deliberately. Recorded with its date because a promise with no mechanism is only findable if somebody wrote down when it starts lying — the same shape as the Apple client secret lapsing 22 Feb 2027.

## The three policy contradictions — found, settled, and written down at last

- **A ROLLING DRAFT IS WHERE A REASSURING, WRONG SENTENCE SURVIVES LONGEST — READ OFTEN, AUDITED NEVER.** This is a DIFFERENT fault from the one below it. That one is about the draft DESTROYING things on refresh; this one is about a sentence that survives every refresh precisely because it is carried forward unexamined.
  - **THE WORKED EXAMPLE, 28 Aug 2026:** "the first real send went to 14 candidates on 28 Jul" rode the STATE OF PLAY for a month. It was true of a MANUAL run and read as though the weekly email was working. It was not: **0 of 4 scheduled runs have ever succeeded**, and the sentence was the only reason nobody looked. It was then handed back to me as a line to fix *in CLAUDE.md* — where it had never been.
  - **THE MECHANISM IS THAT A CARRIED-FORWARD LINE LOOKS LIKE A CHECKED LINE.** Each refresh re-states it, so it accumulates the appearance of having been verified many times, when it was verified once — or never. **The more often a draft is read, the more trustworthy a stale line in it looks.**
  - Same family as the two stale findings handed over on 27 Aug — the IP in the PDF and the human in the deletion loop, both fixed the day before and both still being reported. **A FINDING HAS A DATE, AND A DATE IS NOT A FACT.**
  - **THE DEFENCE IS CHEAP:** anything in a report that is a claim about the WORLD rather than about this session's work either gets re-measured before it is repeated, or gets moved into this file where it can be argued with. A number nobody can re-derive should not be carried forward at all.

- **ALL THREE LIVED ONLY IN A ROLLING GMAIL DRAFT FOR DAYS, AND THAT IS THE REAL FAULT.** On 27 Aug 2026 they were asked for by number and only **two** could be evidenced — the third had to be recovered from a report dated two days earlier. Nothing in the repo held them. **An item that lives only in a report is one refresh from gone**, and the rolling draft has already destroyed two documents (the aggregator SQL and the 51-object orphan list, both 24 Aug). The right response to "I can only evidence two" was not to invent a third; it was to notice that none of them were written down.

- **(1) THE SIGNER'S IP IN THE RETAINED PDF — FIXED 26 Aug 2026, AND THE BLAST RADIUS WAS NIL.** `lib/signPdf.ts` printed the signer's IP into the offer document while the policy said only signature metadata was kept. **`SignatureBlock` no longer ACCEPTS an ip at all**, so passing one is a compiler error rather than a decision somebody has to remember. Checked before assuming a historical problem: **`job_offers` has ZERO rows** — no offer has ever been made through the platform, so no stored document carries one. **The `Device:` line (the user agent) is still printed and is a separate, still-open decision** — do not read this entry as covering it.

- **(2) THE POLICY SAYS "PERMANENTLY DELETED". THE CODE ANONYMISES — AND IS FASTER THAN PROMISED.** `lib/erasure.ts` declares **19 tables DELETE and 9 ANONYMISE**, and it runs **on request**, not on the "30 days" the policy describes. Both mismatches are in our favour and neither is a code fault: properly anonymised data is not personal data, and being quicker than promised is not a breach. **It is a WORDING fix and it is Paul's copy to write.** The policy must say *deleted or irreversibly anonymised*, name which kinds of data get which in plain English, and describe the real timing — and it has to stay consistent with the eleven published App Store labels, because a trader distributing in 27 EU countries has both documents read together.

- **(3) EMPLOYER NOTES SURVIVED AN ERASURE THAT PROMISED UNLINKABILITY — REVERSED 27 Aug 2026.** `employer_notes` was exempt, on the reasoning that "those are the employer's words". **THE QUESTION IS NOT WHO WROTE IT, IT IS WHO IT IDENTIFIES.** A note reading *"spoke to Sarah, strong on pastry, available from the 3rd"* is personal data about Sarah whoever typed it. The exempting comment sat **one clause after** the sentence explaining that free text "routinely contains their name and contact details — leaving them would defeat the unlinkability the decision explicitly requires". The argument was already written down and simply not carried across to the next field.
  - **Changed while it was free: 87 applications, ZERO notes, longest note 0 characters.** Nobody had ever written one. Later it would have meant deciding what to do with real employer content, which is a different and worse conversation. **Re-measure before assuming that is still true.**
  - **AND THE PROOF NOW RUNS THE ERASURE RATHER THAN READING THE PLAN.** `erasure:prove` asserts the rule shape; `erasurelive:prove` seeds a note that names a candidate, erases, and reads the row back. **A plan can list a column the executor never applies** — a mistyped name, a filter matching nothing, a path returning before it writes — and every rule assertion still passes. Watched failing on purpose: removing the column from the plan gives three named failures including `THE EMPLOYER NOTE IS GONE … STILL THERE`. It skips rather than fails without a service key, as the migration check does.

- **`information_schema` SAYS `jobs` HAS NO FOREIGN KEYS. IT HAS ONE, AND IT CASCADES FROM `auth.users`. THE WHOLE ERASURE DESIGN RESTED ON THAT WRONG ANSWER FOR MONTHS.** Two files asserted, in writing, *"There is not one foreign key from public to auth.users, so nothing cascades and every deletion is a manual enumeration."* Measured 1 Sept 2026 from **`pg_constraint`**: about **55** foreign keys point into `auth.users` and **most CASCADE** — `jobs`, `messages`, `conversations`, `notifications`, `employer_profiles`, `job_offers`, `candidate_profiles`. A foreign-key query against `information_schema` for `jobs` comes back **empty**. Same family as `cat -A` not showing the `\r` and `executablePath()` returning a path for a binary that is not there: **the tool chosen specifically to answer the question, answering it wrongly.**
  - **IT INVERTS THE RISK, WHICH IS WHY IT MATTERS MORE THAN A WRONG SENTENCE.** The plan was written as though a row SURVIVES unless we name it. The truth is the opposite on a CASCADE table: rows go **whether or not the plan names them**, at the moment `auth.users` is deleted — which is the LAST step, after every careful anonymise above it. Anything the plan chooses to KEEP on a CASCADE table is undone a moment later.
  - **THE RULE: an ANONYMISE rule on a CASCADE table survives ONLY IF it nulls the column the constraint follows. A KEEP rule on a CASCADE table does not survive at all. Check `pg_constraint`, never `information_schema`, before deciding a row will survive.**
  - **THE TWO THAT SURVIVE DO SO BY LUCK, AND THE DIVIDING LINE IS NULLABILITY.** `job_applications.candidate_id` and `temp_post_comments.user_id` are **nullable**, so those rules could null the FK column and did — because the person had to become unlinkable, not to defeat a cascade. **Nobody chose it.** It is load-bearing now.
  - **THREE RULES ARE DESTROYED BY IT, AND TWO OF THEM ARE PUBLISHED PROMISES.**
    - `deletion_requests` — marked keep, cascades. **The erasure destroys its own audit trail.**
    - `messages` — `sender_id` is **NOT NULL**, so the rule cannot null it and does not try. Its own comment reads *"sender_id is NOT NULL so it survives as a dangling id"*, which is **exactly backwards: the dangling id is what the cascade follows.** So the policy's *"anything you wrote in a message becomes '[deleted]'"* is false — the messages vanish entirely, taking the other party's thread structure with them.
    - `job_offers` — worse, because the reasoning is explicit: *"the contract is kept — candidate_id is NOT NULL and stays, deliberately"*. **The deliberately-kept column is the one the cascade follows.** The reasoning that preserves the contract is what guarantees it dies.
    - **All three are vacuously safe today**: 0 offers, and the messages fault has never fired because no candidate has self-deleted (see below).
    - **The fix for the last two is a TOMBSTONE user id rather than NULL**, since neither column can be nulled.
  - **I GOT THIS AUDIT WRONG ON THE FIRST PASS AND IT IS WORTH RECORDING WHY.** I reported `messages` as surviving because it nulls `sender_id`. It does not — I had confused it with a rule I had just written myself for the employer plan, where the same table is handled differently. **Two plans, same table, opposite behaviour, and I read the one I had authored rather than the one that ships.** Caught by re-reading the live rule rather than my note of it.
  - **AND `NO ACTION` IS NOT "SAFE" — IT REFUSES THE DELETE ENTIRELY.** `offer_audit_log.actor_user_id` and `employer_members.invited_by` are NO ACTION, so a referencing row makes the `auth.users` delete **raise** and roll the transaction back; `eraseAccount` then skips the auth delete and the route returns *"your account has NOT been deleted"*. **So anyone who has ever signed an offer, or ever invited a colleague, cannot delete their account at all** — on the CANDIDATE path as much as the employer one. A dead end rather than data loss, which is the better direction, but it is 5.1.1(v) failing on a real person. **A fuse, not a fault, only because both tables are empty.**
  - **NOTHING RECORDS A COMPLETED SELF-DELETION, AND THAT IS THE FINDING UNDER THE FINDING.** `deletion_requests` would have been the instrument and it cascades. `user_departures` survives (no FK) but **the erasure path never writes it**, even though the plan lists it as keep — its only writer is `reap-unconfirmed`, and both its rows say `unconfirmed_reap`. `email_log` deletes the person's own rows. Vercel retains under an hour. **So "no candidate has ever self-deleted" is an inference, not a fact, and it is unfalsifiable from our own data.** The one action most needing an audit trail is the one that leaves none.

## The fixed mobile header

- **AT <=768px THE HEADER IS `position: fixed`, SO IT RESERVES NO SPACE — AND `--nav-height` UNDERSTATED IT BY 3.19px FOR EVERYONE.** `components/Header.module.css` flips `.header` from `sticky` to `fixed` on mobile. `globals.css` compensates with `main { padding-top: var(--nav-height) }`. The variable said **66px**; the header renders **69.19px at every width from 320 to 767**, measured. So all **fourteen** consumers were 3px short, including three `position: sticky; top: var(--nav-height)` filter strips sitting 3px underneath the header they were meant to sit below.
  - Same family as `width: 112px` rendering at 145px: **a declared number and a rendered number are different numbers, and the stylesheet never disagrees with itself.** `navheight:prove` now asserts the AGREEMENT — rendered height <= declared — so the header growing goes red instead of a heading silently sliding under. It is 70px, leaving 0.81px of slack.

- **`overflow-x: hidden` ON `body` MAKES `position: sticky` SILENTLY DO NOTHING — AND THAT IS WHY THE MOBILE HEADER IS `fixed` RATHER THAN `sticky`.** Rescued 31 Aug 2026 off `experiment/mobile-header-sticky` before that branch was deleted. **It lived only in the commit MESSAGE**; the diff was two files of CSS and carried none of it. Same failure the "a commit can carry knowledge that is not in its diff" rule already describes, and the second time this project has nearly lost a lesson that way.
  - **When one axis of overflow is `hidden`, the other computes from `visible` to `auto`.** So `app/globals.css`'s `overflow-x: hidden` on `body` inside the mobile media query turns `body` into a **scroll container whose scrollport never scrolls** — and a sticky element sticks to *that*, not to the viewport. It does not stick, it scrolls away entirely.
  - **Measured at 390 on production with the change injected, three states, which is what makes it a fact rather than a theory:**

        A  as-is, fixed                fixed          body overflow hidden/auto    header top 0
        B  sticky only                 STICKY         body overflow hidden/auto    header top -2000
        C  sticky + body overflow clip STICKY         body overflow clip/visible   header top 0

  - **`clip` is the fix if it is ever wanted**: it clips the same overflow and leaves `overflow-y: visible`, which is exactly what desktop already computes — and why sticky has always worked above 768 and only ever failed on mobile.
  - **The harness lied on the way to this and was caught by reading the number rather than the label.** It printed `STICKS` on a header whose top was **-2000**, because the condition was `top <= 0.5` and -2000 satisfies it. The corrected test asserts the ABSOLUTE VALUE after a real scroll. Same family as every other check in this file that passed on the broken state.

- **`main.no-pad` IS THE OPT-OUT, AND OPTING OUT OF THE PADDING MEANS OPTING OUT OF THE CLEARANCE.** It exists so a dark sub-header band can sit flush, and it zeroes the mobile `padding-top`. Ten pages use it. Two of them then cleared nothing themselves: **`/jobs`** (own band padding 0.8rem) and **`/candidates`** (1.25rem), so `Find Your Next Role` and `Candidates` were rendered **completely behind the header**, and the board's first search input was clipped by 11px — which is why the page read as having failed to load. `/job-alerts` already carried the right fix and was still 2px short, purely from the bad constant.
  - **If a page uses `no-pad`, its first band owns the clearance.** The idiom is `padding-top: calc(var(--nav-height) + <its own>)`, which `/reviews`, `/saved-jobs` and `/jobs/recommended` already used.

- **A MEDIA QUERY ADDS NO SPECIFICITY, SO A SHORTHAND DECLARED LATER WINS — AND THE FIX SILENTLY DOES NOTHING.** The `/candidates` fix was first written into the `@media (max-width: 768px)` block at line 1177, while `.searchSection { padding: 1.25rem 0 1rem }` sits at line 1292. The shorthand resets `padding-top`, comes later, and wins. **The page measured exactly as broken as before and the diff looked correct.** The rule has to sit AFTER the declaration it overrides. Hit twice in one hour — the same thing happened to `.feedHead`'s `margin-bottom` on `/temp-work`.

- **A CHILD OF A STACKING CONTEXT CANNOT OUT-PAINT ANYTHING OUTSIDE IT, AT ANY z-index — SO THE NUMBER CHANGES, THE COMPUTED VALUE CONFIRMS IT, AND NOTHING MOVES.** Same family as the line above and the same 20 minutes wasted: a change that reads correctly, computes correctly and does nothing. The mobile account sheet was raised from `var(--z-modal)` (200) to 1200 to beat the sidebar toggle at 1001. The browser confirmed **1200**. The toggle still painted on top, both roles.
  - The sheet is a child of `.header`, which is `position: fixed` **with a z-index** — that is a stacking context, so the sheet's number is only ever compared with its own siblings *inside* the header. The header competes at 100; the toggle is a sibling of the header at 1001. **No value on the sheet could ever have won.**
  - **So the question is never "is my number bigger", it is "are these two elements even in the same stacking context".** `scripts/probe-sheet-stacking-context.mjs` walks both elements' ancestors and names every one that forms a context, with the property that does it (`position:fixed + z-index`, `transform`, `opacity`, `filter`, `isolation`, `contain`). Four seconds, and it replaces guessing at a second number with reading which ancestor is trapping you.
  - Caught only because the check asked what the browser **PAINTS** — `elementFromPoint` at the control's centre — rather than what the stylesheet says. A z-index assertion would have passed on the broken state, because the z-index really had changed.

- **A LAYOUT FAULT GATED ON `env()` CANNOT BE SEEN IN A BROWSER, AND A CLEAN DRIVE IS NOT EVIDENCE OF ABSENCE.** `env(safe-area-inset-top)` is **0** in every desktop browser and in mobile Safari in portrait, and it cannot be set from script. So anything positioned against it is in a *different place* on a real phone from the one every check sees, and the fault is present and **invisible** at the same time.
  - Measured 31 Aug 2026: the sidebar toggle is `top: calc(0.7rem + env(safe-area-inset-top, 0px))`. At inset 0 it runs 11.2–51.2 and the account sheet's avatar starts at 73.4 — **it clears by 22.2px and touches nothing.** Every notched iPhone reports 44–59, which drops it squarely onto the avatar. Paul found it in one look on his own phone; three browser sessions had called it clean.
  - **The reproduction is to move the control by the distance the inset moves it** — set `top` to `calc(0.7rem + 59px)` and re-measure. It is a MANUFACTURED state and must be labelled as one in the output, but it turns "cannot reproduce" into a before/after with two different answers.
  - **And derive the threshold from the measured rects, not from arithmetic on the CSS.** The run computes `avatar.top - toggle.bottom` and prints it, so the statement "any inset above 22.2px reaches it" is a fact about the page rather than a sum I did.
  - Same spine as the drive with empty storage: **the tool hands you one state and it is not the state your users are in.**

- **THERE ARE TWO z-index SCALES IN THIS PRODUCT AND THE SIDEBAR FAMILY SITS ENTIRELY ABOVE THE TOKENS. NOT FIXED — Paul's call, 31 Aug 2026 — SO HERE IS WHAT IT COSTS.**

      tokens (globals.css)      --z-header 100 · --z-dropdown 110 · --z-modal 200
      sidebar literals (both)   drawer 1100 · overlay 1099 · toggle 1001 · nav 1000
      others                    CookieConsent 1001 · NotificationBell 1000 · two 9999s

  - **EVERY ONE OF THE 16 `var(--z-modal)` USERS IS BENEATH THE SIDEBAR DRAWER, ITS OVERLAY AND ITS TOGGLE.** So any modal opened from a page where the drawer is available can be covered by navigation — and the drawer's dimming overlay at 1099 will paint *over* a modal at 200. That is a real fault waiting for somebody to open a modal with the drawer open; it has not bitten yet only because the drawer is usually shut.
  - The account-sheet fix did **not** address this. It moves `.header` to 1201 *while it hosts the sheet* and puts it back afterwards — one screen, one state. Every other modal is still underneath.
  - **Why it was not done on 31 Aug:** renumbering means moving the drawer and its overlay as well, which changes what covers the header on every page for both roles, on the same day a build was in front of App Store review. Wrong day, not wrong idea.
  - **When it is done, the shape is to put the sidebar family on the tokens** (`--z-sidebar`, `--z-sidebar-overlay`, `--z-sidebar-toggle`) rather than to raise the tokens — raising `--z-modal` moves 16 things at once and pushes modals over the cookie banner at 1001. And the check that catches the regression already exists: `elementFromPoint`, not a z-index comparison.

- **NOBODY HAD EVER LOOKED AT THIS SITE AT TABLET WIDTH UNTIL 30 Aug 2026, AND IT SHOWS AT 1032px.** Recorded, not fixed — Paul's call, and it is a proper piece of work rather than a tidy-up. Three things seen on the candidate dashboard at that width: a large dead gap between the avatar row and the progress bar; a void before "Senior Chef de Partie"; and the Recommended card rendering as **one image rather than a grid**.
  - **The reason it is a class and not three bugs:** every breakpoint in this product was written for a phone or a desktop, so 769–1200 is whatever the desktop rules happen to do in a narrower box. It is not a designed width. Expect more than these three when somebody looks properly.
  - **It matters more than it did last week**, because the iPad screenshots are on the App Store listing and `TARGETED_DEVICE_FAMILY` is `"1,2"` — Apple lists the app as an iPad app, so a reviewer can open it at exactly this width.

- **TWO CACHE FINDINGS, RECORDED AND NOT FIXED (30 Aug 2026): 77 Goldenkeys banners serve `max-age=3600`, and Host Staffing's logo serves `no-cache`.** Both are Supabase storage objects, both are effectively immutable, and both are re-fetched far more often than they change.
  - **AND THE INSTRUMENT LESSON IS THE PART TO KEEP: HEAD AND GET RETURN DIFFERENT `Cache-Control` FROM SUPABASE STORAGE.** The first comparison used HEAD and reported `no-cache` for a file whose cache header had just been set to a year. **Ask with the verb the browser uses** — GET — or the answer is about a request nobody makes. Same family as `curl` being unable to see a client-rendered page: the probe was cheap, plausible, and answering a different question.

- **AN AUTH-GATED ROUTE MEASURED WHILE SIGNED OUT REPORTS ON THE LOGIN PAGE.** The first sweep called `/candidates` clear. It was measuring `/login`, which is clear. **Record where the drive LANDED, not where it was sent** — the check now fails a route that redirected rather than passing it, because a redirect proves nothing about the page you asked for. Same spine as the recovery-landing control.

- **A `display: none` ELEMENT HAS `visibility: 'visible'` AND A 0,0,0,0 RECT.** So it looks exactly like an element painting at the top-left corner. That is how a "ghost Apply Now across every job page header" was reported **that does not exist**: the job page's sidebar is correctly `display: none` at <=768px, and the header's pixels are flat navy. Two instruments agreed — a probe that filtered on `visibility` and my own reading of a downscaled preview — and both were pointed at the wrong thing.
  - **`Element.checkVisibility()` knows the difference** and is what the check uses. A bare `visibility`/`opacity` filter does not.
  - The correction came from cropping the actual PNG and magnifying it. **Prefer a representation that cannot lie**: the pixels, not a description of them.

- **THE BOARD IS 231 GOLDENKEYS / 19 HOST / 1 COLLINS KING — AND ALL THREE ARE RECRUITMENT AGENCIES.** Three companies hold all 251 live adverts. 250 of 251 carry a banner image; Collins King's single advert has none, so its job page paints a flat gradient. **NOT ONE ADVERT ON THE BOARD COMES FROM A DIRECT EMPLOYER.** Recorded 27 Aug 2026 because it is the sharpest statement of the acquisition problem anyone has produced, not because it is a task.
  - **THIS ENTRY SAID "1 DIRECT EMPLOYER" AND THAT COLLINS KING WERE "not a recruiter" UNTIL 1 SEPT 2026. BOTH WERE FALSE.** Paul settled it from his own inbox: Collins King & Associates are an agency, and Ricci Courtney asked on 18 Aug whether they could post adverts themselves, was told yes on the 19th, and the advert appeared on the 20th. The claim entered in `f2ec175` — a commit about the mobile fixed header — with no measurement behind it, and `employer_profiles.is_recruiter` said **TRUE** for them the whole time. **The database disagreed with this file for five days and nobody asked it.**
  - **AND THE FALSE VERSION WAS LOAD-BEARING.** On 1 Sept it was used to draft Apple's answer 7, where it produced a category called "vacancies employers post themselves" that contained no employer. **The real split is not agencies versus employers — it is who PUBLISHED:** Thrive publishes on an agency's behalf (Goldenkeys imported, Host keyed in by us) for 250 of 251, and an agency posts through the form itself for 1 of 251.
  - **`jobs.is_recruiter_posting = false` ON THAT ADVERT IS THEREFORE A BUG, AND IT IS NOT A QUIET ONE.** The flag RENDERS: `JobCardLink` and `JobDetailModal` print **"· via recruiter"** from it, and `jobPostingLd` uses it to decide whether to emit `validThrough`. It also drives the 60-day expiry cron, so as it stands **that advert expires around 19 October 2026 and emails Collins King about an ad they posted themselves.** Flipping it is a visible copy change, not a data fix.

## The repository is PUBLIC

- **`hex-recruitment` IS A PUBLIC REPOSITORY, AND NOBODY HAD NOTICED.** Confirmed from the GitHub API 28 Aug 2026: `visibility: public`, `private: false`. It surfaced only because a workflow dispatch returned 403 and I went looking at the repository record. **Everything ever committed on any branch has been world-readable since 1 March 2026**, and public repositories are scraped continuously and automatically.

- **ONE REAL CREDENTIAL WAS COMMITTED AND IS STILL IN THE HISTORY: THE FIRECRAWL API KEY.** It sat in `.claude/settings.local.json` — inside a `Bash(printf "…")` permission entry, which is why no `.env` rule ever caught it — across **14 commits from 1 March to 24 April 2026**. `70624d6` gitignored the file and removed it from the tree, **but the blob remains in history and the key is unchanged.** Deleting a file does not unpublish it.
  - **BLAST RADIUS IS QUOTA AND MONEY, NOT DATA.** The key reaches `api.firecrawl.dev` for company-profile auto-fill (`app/api/company/scrape/route.ts`) and nothing else. It cannot touch Supabase, candidates, applications, CVs or email. **It is not the service-role key.**
  - **THE REMEDY IS ROTATION, NOT REDACTION.** A key that has been public is compromised whatever happens to the repository afterwards.

- **NOTHING WORSE WAS FOUND, AND THE NEGATIVE IS WORTH AS MUCH AS THE POSITIVE.** Scanned **every blob in the object database** — 1,670 commits across 215 refs, including blobs unreachable from any ref, which a `git log --all` scan would have missed. Searched for and NOT found: the **Supabase service-role key** or any `service_role` JWT, any long `eyJ` JWT at all, Resend `re_`, Stripe `sk_live`/`sk_test`/`rk_`/`whsec_`, Anthropic `sk-ant-`, LinkedIn client secret, any `BEGIN PRIVATE KEY` block, Postcoder, `CRON_SECRET` as a literal, the Vercel bypass secret, Supabase `sbp_`, GitHub `ghp_`, AWS `AKIA`. No `.env`, `.pem`, `.p12`, `.p8`, `.key`, `.mobileprovision` or service-account JSON was **ever** added on any ref.
  - `.gitignore` has covered `.env` and `.env.local` **since its very first commit**, which is why the env files are clean. The gap was a file nobody thought of as secret-bearing.
  - The `.env*.example` files hold bracketed placeholders only, verified version by version.

- **A DETECTOR THAT IS OFF LOOKS EXACTLY LIKE A DETECTOR FINDING NOTHING.** GitHub's secret scanning was **DISABLED** on this repository — which is why nothing ever announced the Firecrawl key sitting in the history for five months. When I tried to read the alerts the API returned **403**, and I reported that channel as *unchecked* rather than clean. That was right, and the reason it was right is the rule: **a 403 from a detector, and a detector with nothing to report, are the same silence.**
  - The general shape, and it is the whole family this file keeps collecting: **before trusting a check's silence, confirm the check is running.** Same spine as the emoji grep that found nothing, `cat -A` not showing the `\r`, `executablePath()` returning a path for a binary that does not exist, and `email_log` reading zero because the table did not exist yet.
  - Secret Protection, the dependency graph and Dependabot alerts were enabled 28 Aug 2026. **The Firecrawl key is ROTATED** — new key live, proven by a real company auto-fill on production, the old "Default" key revoked. The blob is still in history and always will be; what closes it is that the key it holds is dead.

- **THE OLD EMBER PASSWORD EXPOSURE IS STILL CLOSED.** `edb9660` recorded that a test password sat in six commits from 10 May 2026 and that the mitigation was that no account it opens exists. **Re-measured 28 Aug 2026: 0 `thrivetest`, 0 `+demo`, 0 `+e2e` accounts** — only the two standing fixtures, whose passwords come from the environment and were never committed. The three files it named all read from `process.env` today.

- **WHETHER THE REPOSITORY STAYS PUBLIC IS AN OPEN DECISION — PAUL'S, NOT ANYONE ELSE'S, AND NOT TAKEN AS OF 28 Aug 2026.** The trade:
  - **PUBLIC:** GitHub Actions is free for public repositories on standard runners. Whether macOS standard runners are included is **unsettled** — the billing page says free "for public repositories that use standard GitHub-hosted runners" and separately that "larger runners are always charged"; `macos-15` is standard, not larger, but it is not said in as many words. **The first build settles it from the billing page. Do not guess it again.**
  - **PRIVATE:** the codebase and this file stop being world-readable — and this file is now a detailed account of the product's weak points, its live data, its blind spots and its fixtures. Cost is a few pounds a month in macOS minutes.
  - **NOTHING WAS MOVED OUT OF THIS FILE AND NOTHING SHOULD BE** until that decision is made. Redacting it piecemeal would lose the thing that makes it useful.

## The open list — named, dated, not touched

- **THE ROLES ROUNDUP EMAIL HAS NEVER ONCE SENT ON ITS SCHEDULE.** Reported to me as "failed the last three runs". It is worse and it is a different fault: **FOUR scheduled runs, 4, 11, 18 and 25 August 2026, ALL FAILED — and the schedule has a 0% success rate for its entire existence.** The only two green runs, #1 and #5, were both `workflow_dispatch` on 28 July, the day it was built.
  - **SO NOBODY BROKE IT. IT NEVER WORKED UNATTENDED.** That changes what the fix is: this is not a regression to bisect, it is something that only ever ran by hand. And the line recorded in the STATE OF PLAY reports — "the first real send went to 14 candidates on 28 Jul" — describes a MANUAL run. **THE WEEKLY EMAIL HAS NEVER ONCE REACHED A CANDIDATE ON ITS OWN.** (That claim was never in this file; it lived in the rolling draft, which is exactly the place a reassuring and wrong sentence survives longest — see the three policy contradictions that lived only in a draft for days.)
  - Found 28 Aug 2026 by reading the run list rather than the summary; **the three-versus-four difference came from counting what was on the screen instead of asking the API for the whole history.** Same shape as the emoji inventory that reported seven of thirty-seven.
  - **DELIBERATELY NOT INVESTIGATED** — recorded so it is a decision rather than something nobody saw.
  - **IT IS THE SAME FAMILY AS THE DISABLED SECRET SCANNER, AND WORSE.** A scheduled job that stops is silent exactly as a detector that is off is silent — but here the absence is of a THING (an email a candidate should have received), not of a report about a thing, and nobody is on a list to notice that a weekly email did not arrive.
  - Whoever picks it up: the first question is not why it fails but **how many sends were lost**, and `email_log` answers it — with the caution that the table's own first row is 11 Aug, which is what turned "9 of 62" into "9 of 20".

## The OAuth failure — one capture, and it cannot be re-obtained

- **THE COOKIE DIAGNOSTIC FIRED AT LAST, AT 07:57:50 UTC ON 31 Aug 2026, AND THE ANSWER IS THAT THE `code_verifier` COOKIE WAS NOT THERE AT ALL.** Recorded here rather than in a rolling draft because **the Vercel window that held it is under an hour** — a 24-hour query run at 08:04 returned this single line and nothing else. It is gone now and no future query can bring it back.

      route            employee          provider  apple      (from auth.flow_state)
      cookieNames      hex_cookie_consent
                       sb-<ref>-auth-token.0
                       sb-<ref>-auth-token.1
                       sb-<ref>-auth-token.2
                       thrive_country
                       thrive_tz
      isChunked        true   (that is the SESSION, chunked into three)
      cookieCount      6
      secFetchSite     cross-site        secFetchMode  navigate
      result           exchange failed — "PKCE code verifier not found in storage"

  - **THE VERIFIER COOKIE IS ABSENT, NOT CHUNKED AND NOT TRUNCATED.** Six cookies arrived and none of them is `sb-<ref>-auth-token-code-verifier`. The diagnostic was built to separate exactly those two possibilities — "did it arrive" versus "was it split into `.0`/`.1`" — and it separated them: **the chunking is real but it is the session, and the verifier simply never reached the server.**
  - **So the fault is upstream of the callback.** The callback is behaving correctly; it cannot exchange a code without a verifier. The open question moves to **why the cookie is not sent** — never written, written on a different origin or in a different browser context, or dropped on the way back. `secFetchSite: cross-site` with `secFetchMode: navigate` means a top-level cross-site navigation, on which a `SameSite=Lax` cookie *is* normally sent, so plain Lax exclusion does not explain it on its own.
  - **The browser already held a session** — the three `auth-token` chunks — so this was somebody signed in who started an Apple flow, not a first-ever visitor.
  - **NOT MINE.** Every sign-in this session was email+password through `/login/employee`, which creates no `flow_state` row and never touches `/auth/callback`.
  - **`auth.flow_state` is the register and it is durable, unlike the log:** 76 rows with `auth_code_issued_at` set and never consumed, oldest **14 Apr 2026**, newest this one. Successes are deleted, so every surviving row is a failure.
  - **NOT INVESTIGATED FURTHER — Paul's explicit instruction on 31 Aug was not to start it.** This entry is evidence capture only, done because the evidence expires. **Read `auth.flow_state` for the count and the pattern; the log will not be there.**
  - **AND IT IS THE ARGUMENT FOR MAKING THE DIAGNOSTIC DURABLE.** Catching this was luck — a routine `select count(*)` five minutes after it happened. A row written at the moment of failure would be readable the next morning; a console line is readable only by somebody already watching. That is the change to make before the next one is lost.

- **THE MIDDLEWARE IS NOT IN THE PATH, AND THAT IS WHY THE CAPTURES MEAN WHAT THEY SAY.** The obvious objection to the diagnostic is that it runs inside the route handler, so it sees the request as the handler received it rather than as the browser sent it — and the standard `@supabase/ssr` middleware pattern mutates REQUEST cookies as well as response ones, so a cookie it did not set could be dropped before the handler ever looks. **It cannot happen here.** `middleware.ts`'s matcher excludes the route explicitly:

      '/((?!_next/static|_next/image|favicon.ico|auth/callback|auth/confirm|reset-password|api/auth/set-session|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'

  - `auth/callback` is in the negative lookahead, so **middleware never runs on `/auth/callback/employee` or `/auth/callback/employer`.** Nothing sits between the browser and the handler that touches cookies, so **the handler's view IS the browser's view** and an absent verifier there means the browser did not send one.
  - **The exclusion is deliberate and must not be removed to run a probe.** Its own comment records why: refreshing mid-exchange risks consuming the single-use code or refresh token before the callback does, which is the `refresh_token_already_used` failure this codebase already hit, and `reset-password` was added to the same list after a real employer was locked out of a reset on 27 Jul. **A diagnostic is never worth re-opening that.**

- **FOUR REAL EVENTS ON 31 Aug 2026, AND A NATURAL EXPERIMENT NOBODY DESIGNED: THE SAME PERSON, THE SAME PHONE, 26 SECONDS APART — SIGNED OUT SUCCEEDS, SIGNED IN FAILS.** Read from the log before it expired; **it is gone now.**

      time      verifier cookie   session cookie      what actually happened
      07:57:50  ABSENT            present, 3 chunks   FAILED
      08:11:53  PRESENT           absent              SUCCEEDED (google)
      08:12:57  ABSENT            present, 3 chunks   FAILED
      08:13:22  PRESENT           absent              SUCCEEDED (apple)
      08:13:48  ABSENT            present, 3 chunks   FAILED

  - **08:13:22 SUCCEEDED AND 08:13:48 FAILED, TWENTY-SIX SECONDS LATER ON THE SAME DEVICE.** The success signed the person in — so by the time they tapped the next provider they were holding a session, and that attempt failed. It is the exact signed-out/signed-in comparison somebody was about to run by hand, produced by accident.
  - **I REPORTED TWO SUCCESSES, "CORRECTED" IT TO ONE, AND THE ORIGINAL WAS RIGHT. THE CORRECTION WAS THE ERROR.** Recorded in full because the second mistake is more instructive than the first.
    - The first reading inferred success from the ABSENCE of an `exchange failed` line — a check that passes on more states than it names, since a request carrying no code logs nothing either. That reasoning was weak even though its answer was correct.
    - The "correction" then used `auth.users.last_sign_in_at`, saw it had moved **once**, and concluded there was one success. **`last_sign_in_at` IS A SINGLE COLUMN THAT HOLDS ONLY THE MOST RECENT VALUE. It cannot represent two logins by the same person, so it can never count anything.** Using it as a counter is the same family as counting rows in a table that did not exist yet: the instrument was structurally incapable of the answer, and it returned a confident number anyway.
    - **A WEAK METHOD THAT WAS RIGHT WAS REPLACED WITH A CONFIDENT METHOD THAT WAS WRONG**, which is the worst direction, and it took a third instrument to notice.
  - **THE INSTRUMENT THAT ACTUALLY ANSWERS IT: `auth_audit_logs` LOGIN EVENTS COME IN PAIRS.** A completed sign-in emits **two** `login` events seconds apart, and they are distinguishable by which trait is populated and by the user agent:

        traits.provider      set, user_agent = the real device   <- the provider issued a code
        traits.provider_type set, user_agent = "node"            <- OUR server exchanged it

    **A PAIR IS A SUCCESS. AN UNPAIRED DEVICE EVENT IS A FAILURE.** Applied to the morning, it settles every one of them without touching the Vercel log:

        07:57:50  apple           device only   FAILED
        08:11:52  google          device + node SUCCEEDED
        08:12:57  apple           device only   FAILED
        08:13:22  apple           device + node SUCCEEDED
        08:13:48  linkedin_oidc   device only   FAILED
        08:53:00  apple           device + node SUCCEEDED   (the first native-path tap)

  - **THIS IS THE DURABLE REGISTER THE DIAGNOSTIC WAS BEING BUILT TO PROVIDE, AND IT ALREADY EXISTS.** It carries the provider, the outcome and the **user agent**, it is retained far longer than Vercel's sub-hour window, and it needs nothing built. Before proposing any new table for this, ask what `auth_audit_logs` already answers.
  - **THE VERIFIER AND THE SESSION ARE NEVER BOTH PRESENT, IN EITHER DIRECTION, ACROSS ALL FIVE REQUESTS.** The diagnostic runs before any exchange, so a sign-in legitimately has no session yet. Every failure already had one.
  - **AND `oauth_intended_role` TRAVELS WITH THE VERIFIER, WHICH IS THE STRUCTURAL POINT.** The sign-in buttons write it in the same click handler that starts the flow (`path=/; max-age=600; SameSite=Lax`). On two of the three failures **both it and the verifier are missing together** — so this looks less like one cookie being deleted and more like a request arriving from a jar that never saw the flow start.

- **THE CALLBACK NEVER LANDS ON THE LOGIN PAGE ON SUCCESS — IT LANDS THERE ON FAILURE, WHICH IS THE OPPOSITE WAY ROUND FROM HOW IT LOOKS.** Checked 31 Aug 2026 because the login page is visibly involved and the obvious story is that a success routes through it. It does not. `app/auth/callback/employee/route.ts` builds `redirectTo = ${origin}${safeNext || '/dashboard'}` and 307s straight there. **Every** redirect to `/login/employee?error=…` is a failure branch: `error`, `no-code`, `exchange-failed`, `wrong-role`. And `/login/employee` is itself only a stub that `redirect()`s to `/login`.
  - So a login page seen immediately after a **successful** app sign-in is the page the webview was **already on** while the system-browser sheet was up, not a destination the route chose. A login page seen after a **failed** one is the route putting you there.
  - **THE DANGEROUS READING IS THAT A SUCCESS ROUTES THROUGH LOGIN, BECAUSE IT MAKES A TIDY STORY THAT THE CODE DOES NOT SUPPORT.** Read the redirect targets, not the screen.

- **NOTHING ANYWHERE STOPS AN OAUTH FLOW BEING STARTED WHILE A SESSION ALREADY EXISTS, AND THE ONLY THING THAT MOVES A SIGNED-IN PERSON OFF AN AUTH PAGE IS CLIENT-SIDE AND ASYNC.** Both halves measured 31 Aug 2026.
  - **The buttons have no guard at all.** `getSession`, `getUser` and `session` appear **nowhere** in `AppleSignInButton`, `GoogleSignInButton` or `LinkedInSignInButton`. Tapping one while signed in starts a fresh PKCE flow exactly as if you were not.
  - **`SessionGuard` bounces a signed-in visitor off auth pages in a `useEffect`, after hydration, after `await supabase.auth.getSession()`** — then `router.push`. There is no server redirect. So the login page renders, is interactive, and its provider buttons are live for the whole of that window.
  - **THAT WINDOW IS REACHABLE ON THE WEB WITHOUT ANY APP INVOLVED** — typing the URL, a bookmark, the back button, or an old link all land a signed-in browser on `/login`. So any explanation that needs the iOS shell cannot be the whole story, and **63 of the 78 register rows are Google**, which is overwhelmingly a web provider.
  - **What a fix would be, not built:** decide it on the server so there is no interactive window at all, and refuse at the button as a second gate — a provider button that finds a session should route to the dashboard rather than start a flow. Two independent gates, because the client one alone is the thing that is already too slow.
  - **SO THE CANDIDATE IS: STARTING AN OAUTH FLOW WHILE ALREADY HOLDING A SESSION LOSES THE VERIFIER.** That is a correlation across five events with a clean split, not a proven mechanism, and it must not be written down as more than that. It does fit the shape of the whole register: intermittent, provider-agnostic, and commonest for someone who already has an account.
  - **`secFetchSite` IS NOT THE DISCRIMINATOR** — one success was `same-origin` and one was `cross-site`, and every failure was `cross-site`. Nor is `hex_session_started` / `oauth_intended_role`: the 08:13:48 failure carried both and still failed.
  - **ONE MECHANISM WAS PROPOSED, CHECKED IN THE LIBRARY, AND IS FALSE — recorded so nobody re-derives it.** The tempting story is that `@supabase/ssr`'s chunk cleanup deletes the verifier as a stale chunk, because `sb-<ref>-auth-token-code-verifier` starts with `sb-<ref>-auth-token`. It does not: `isChunkLike` tests `CHUNK_LIKE_REGEX = /^(.*)[.](0|[1-9][0-9]*)$/` and requires the captured base to **equal** the key exactly. The verifier is not chunk-like against the auth-token key and is never removed by that path. **A prefix theory that reads perfectly and is not what the regex does.**
  - **THE NEXT PLACE TO LOOK IS OUR OWN MIDDLEWARE, and this is a lead rather than a finding.** `middleware.ts` runs `supabase.auth.getUser()` on every matched navigation with the SSR **server** client, which rewrites the cookie jar through `applyServerStorage`. It has real work to do only when a session exists — which is precisely the condition that correlates with the loss. Nobody has checked whether that rewrite preserves a cookie it did not set.

- **THE VERIFIER-EXPIRY HYPOTHESIS IS DEAD. TESTED 31 Aug 2026 AND RECORDED SO NOBODY TESTS IT TWICE.** The theory was that the `code_verifier` cookie is short-lived and expires while the user is still on the provider's screen, which would produce exactly the captured symptom without anything of ours being wrong. It fits the symptom and it is false.
  - **THE COOKIE'S max-age IS 400 DAYS**, read from the library rather than assumed: `DEFAULT_COOKIE_OPTIONS.maxAge = 400 * 24 * 60 * 60` in `@supabase/ssr`, and `applyServerStorage` **force-sets** `maxAge: DEFAULT_COOKIE_OPTIONS.maxAge` on every write, overriding anything passed in `cookieOptions`. Ours passes `sameSite`, `secure` and `path` and no maxAge, so it cannot be shortened by us even accidentally.
  - **AND NOTHING COMES CLOSE TO IT.** Time from flow start to the code being issued — the whole window the cookie must survive — across all rows:

        provider        rows   min     median   p90     max      >5min
        google            63   0.3s     0.9s    1.6s   89.8s       0
        apple              7   6.7s     7.2s    9.6s   11.3s       0
        linkedin_oidc      2  12.1s    22.0s   29.8s   31.8s       0
        email/recovery     6  18.2s   ~100s   209.2s  217.4s       0
        ALL               78   0.3s     1.0s   32.0s  217.4s       0

    The longest is **217 seconds against a 34,560,000-second cookie**. Failures do not skew long — they skew **short**.
  - **TWO THINGS THE DISTRIBUTION SETTLED THAT NOBODY ASKED IT TO.** First, **GOOGLE IS 63 OF 78, NOT APPLE** — "Apple fails more than Google" was a premise of the hypothesis and it is the wrong way round. Second, `provider_type` includes **`email` and `recovery`**, so this register was never purely OAuth; the recovery rows are the documented "second reset link kills the first" behaviour, and counting them as OAuth failures overstates the OAuth number.
  - **GOOGLE'S SUB-SECOND MEDIAN IS ITS OWN QUESTION.** 0.9s from flow start to code issued is not a human completing a sign-in; it is an already-authenticated silent redirect. Those 63 look like a different population from the 9 human-paced Apple/LinkedIn ones, and treating all 78 as one fault is probably why it has resisted explanation.
  - **WHAT THE REGISTER CANNOT TELL YOU, said plainly:** `auth.flow_state` has no column recording when our callback attempted the exchange, and a failed exchange updates nothing. `auth_code_issued_at` is the moment Supabase issued the code and redirected to us, so it is within about a second of the callback arriving — good enough to bound the window, and **not** a measurement of our own handling. Successful exchanges delete their row, so this is a population of failures with **no success baseline to compare against**; the distribution can say failures are not slow, and it cannot say slow attempts are more likely to fail.

- **A BRANCH'S VALUE IS NOT ITS DIFF. READ WHAT IT SAYS BEFORE DELETING IT, NOT ONLY WHAT IT CHANGES.** `experiment/mobile-header-sticky` was two files of CSS and correctly obsolete — the header had been fixed a different way — so every reason to delete it was sound. Its commit **message** carried the reason `overflow-x: hidden` on `body` silently kills `position: sticky`, three measured states, and a harness that printed `STICKS` on a header at top -2000. None of that was in the patch, and `git branch -D` would have taken all of it.
  - This is the same failure the "a commit can carry knowledge that is not in its diff" entry already describes, met from the other end: there the risk was rescuing a commit and leaving its lesson behind, here it was deleting a branch whose lesson was the only thing in it worth keeping.
  - **The order that makes it safe:** read the messages → write anything worth keeping into a file → push → **confirm it is on `origin`** → only then delete. Never against a local copy. `git log --format='%H%n%s%n%n%b' <branch>` is the whole cost.
  - **And note what `git diff main..<branch>` shows on an old branch — it is not what the branch adds.** On a branch cut months ago it renders everything main has gained since as deletions, which reads alarmingly and means nothing. `git show --stat <sha>` and `git diff main...<branch>` (three dots) are the questions you actually want.

## Product boundary

- **Thrive is a recruitment product, not HR/onboarding software.** Do not build visa/right-to-work compliance logic (visa types, hours-limited conditions, document acceptance, DBS levels, a rules engine, etc.) beyond a simple confirmation flag the employer ticks once they've verified through their own proper channel. Deeper compliance is integration territory (dedicated HR systems / a future integration), not something we model or store here — no candidate documents, no special-category data.

- **REQUESTING A SECOND RESET LINK KILLS THE FIRST, AND THE REFUSAL IT PRODUCES BLAMES THE WRONG THING.** `auth.users` holds ONE recovery token, so a second `/recover` overwrites it and the earlier link — still inside its hour, never clicked — comes back `403 otp_expired`, "One-time token not found". Proven 25 Aug 2026 with a positive control: one token alone verifies; mint a second and the first is refused while the second is accepted. **So a person with two of our emails in front of them has exactly one working link and no way to tell which**, and the one that fails says "expired" when it was superseded a minute ago.
  - **IT ALMOST WENT INTO A REPORT AS A CROSS-DEVICE FAULT.** A recovery link opened in a different browser returned that 403, and the email carries a `pkce_` token, so "PKCE needs the requesting browser" was a tidy, plausible, wrong story — and it would have had Paul telling a locked-out employer to open the email on one specific device. The token had simply been superseded 90 seconds earlier by a later request of my own. **Re-tested with a token nothing had superseded, a different browser completes the reset perfectly.** Cross-device is fine.
  - The shape: **one observation, two candidate causes, and the interesting one is not evidence.** The discriminator was free — use a token with no later request behind it — and the reason it got skipped is that the failure already "made sense".
  - Practical consequence for support: **tell people to use the NEWEST email and to request only once.** A second request made while waiting is what breaks the first.

- **DO NOT HAND-DELIVER A SINGLE-USE TOKEN. ANY MODERN MESSAGING CHANNEL WILL SPEND IT BEFORE THE PERSON TOUCHES IT.** Three recovery links were minted for one locked-out employer on 25 Aug 2026 and all three were destroyed in transit, by three different transports: the Gmail composer percent-encoded the separators (`%3D`, `%26`) so the route received one meaningless param and never saw a token; the same again on a recreated draft; and then **WhatsApp's link-preview crawler FETCHED `/auth/confirm` to build the preview card and consumed the token**, so he tapped a spent link and landed on `/login`. The preview card sitting in his chat is the proof — something other than him had already opened the URL.
  - **The crawler one is the nastiest because our side looks perfect.** The link was correct, the route worked, the token was valid, and it was spent by a robot rendering a thumbnail. Nothing logs it as a failure and the person sees only "invalid link". Same family as the published `privacy@` address and the delete button that sent nothing: **the far end of a promise, where nothing reports back.**
  - It also breaks the rule directly above this one in a way that rule did not anticipate: testing the artefact through the path the person takes is not enough when **the path itself consumes the artefact**. A link that is valid when sent and dead when tapped passes every check made before sending.
  - **So: send people to the product's own flow — `/login` → "Forgot it?" → the link in their own inbox — and never paste a credentialed URL into a chat, a draft, a ticket or a preview-rendering anything.** An email client that fetches nothing is the only transport proven to work here: Adrian's own 08:47 email token survived and was used at 08:58.
  - If a link ever genuinely must be hand-delivered, the only safe shapes are a channel with previews off, or a short code the person types.

- **When something is issued now and redeemed later, testing it now proves only that it was valid when made.** A stay-hidden token minted on 26 July verified as `invalid` in August; a send-mode test on a fresh token would have passed all week and told us nothing, because the fault lived in the nine days between minting and clicking. **Test the artefact people actually hold, through the path they actually take.** Before any credentialed link goes to a real person: one minted BY PRODUCTION, sent to Paul, clicked by hand, landing on a confirmation.

- **The stay-hidden signature mismatch is RESOLVED, and the answer was never the signature.** Recorded because a day went into it and it would otherwise be remembered as open. The opt-out link had never worked for anybody: the send path built `/stay-hidden?token=…` — the results PAGE, which reads only `status` — while dry-run and test built `/api/candidate/stay-hidden?token=…`, the route that verifies. Every real click rendered "invalid" by construction. Fixed 5 Aug 2026 with one constant used by all three modes, plus a forward so the links already in nine inboxes started working. **Proof, from the row and not from an argument:** the untouched 26 July token was clicked on 5 Aug and stamped `optedOutAt` on a real profile. The signing and the secret were correct the whole time.
  - **Two instruments agreeing is not corroboration when both are pointed at the wrong thing.** Both probes asked whether a token verifies, agreed with each other, and neither asked whether the link in the email reaches a verifier at all. **Test the artefact people actually hold, through the path they actually take** — the rule was already written down, above, and a click on a fresh token is what finally found it.
  - **A test mode that exercises a different URL from the one candidates receive can never catch a routing fault.** That is why the URL is now one function rather than three template strings three lines apart.

- **An opt-out is recorded as permanent, and it was only ever an answer about August 2026.** The dashboard "Hide my profile" switch writes `is_discoverable` and nothing else, so `optedOutAt` survives every flick of it. **The asymmetry is the part to know:** turning visibility ON changes nothing today, because `flipBlocker` returns `already-discoverable` first — but turning it OFF again lands on `opted-out`, and no future campaign will ever touch that person again. Left alone deliberately: there is exactly one campaign, so it costs nothing today, and scoping an opt-out to a campaign is a decision for when there IS a second one.

- **THE FLIP FIRES ON ITS OWN, DAILY AT 11:00 UTC.** This entry used to say the opposite — "on no schedule, five crons, none of them this, POST-only, dry-run by default" — and that has been false since **5 August 2026**. There are **seven** crons; `/api/cron/discoverability-flip` is one of them (`0 11 * * *`), and `c9cd5b1` gave the route a **GET** handler that calls `performFlip(**live**)`, not a dry run. A rule that is stale in the direction of "it cannot do anything" is the dangerous direction, which is why it is corrected here rather than deleted.
  - Daily rather than one date, deliberately: each candidate carries their **own stored `deadlineAt`** and is blocked `window-open` until it passes, so a daily run flips each person on their own deadline. A single-date cron is a one-shot with no retry — if that invocation fails, nobody is told and the promised date passes in silence.
  - **The current cohort is eight, and they flip on THURSDAY 20 August 2026, not the 19th.** Their deadlines land ~14:17 UTC on the 19th and the cron runs at 11:00, so the 19th reports `window-open 8`. From the 21st they read `already-discoverable`, **not** `already-flipped` — `flipBlocker` tests `is_discoverable` first.
    - **The day name is written here because the rolling handover draft said "20 AUGUST, TUESDAY" for a week and it was repeated into three reports.** This file was right and the drafts were wrong; 20 Aug 2026 is a Thursday and the 18th is the Tuesday. A correct date with the wrong day name is worse than either alone — someone clears the Tuesday, watches, sees `window-open 8`, and the flip fires unattended two days later.
    - Verified 16 Aug 2026 by running the REAL `flipBlocker` against the REAL rows at each cron instant, rather than re-reading the rule: the 19th at 11:00 gives `window-open 8 · opted-out 2`, the 20th gives eight flips. The two blocked are `pauldavies.gbr@` (Paul's own, opted out 5 Aug) and the `+candidate` fixture. **Import the gate, never restate it** — a restated gate proves only that you restated it consistently.
    - **CRON_SECRET is the single point of failure and it fails CLOSED.** No secret, no bearer token, 401, and the promised date passes in silence. It cannot be read from a session, so prove it from data instead: `/api/cron/activation-emails` runs `0 9 * * *` and is the only sender of `activation_day3`; one is logged at 2026-08-12 09:20 UTC, so the scheduler does reach our cron routes with a valid secret.
  - **A manual flip is the authenticated `POST` with `mode:'flip'` and `confirm:'FLIP'`, and NEVER raw SQL.** The route re-evaluates the whole gate per row *at write time* and stamps `flippedAt` as the audit trail; an `UPDATE` skips both, so it can flip someone who opted out an hour ago and leaves no record that we did.
  - **A quiet day and a dead schedule look identical**, so the route logs exactly one receipt line per invocation naming the trigger. **VERCEL RUNTIME LOGS HERE RETAIN UNDER AN HOUR, NOT UNDER A DAY** — checking "did it run" even a couple of hours later is already too late.
    - **MEASURED 30 Aug 2026, and the previous figure in this file was out by more than an order of magnitude.** A 13-hour query returned its oldest line at 51 minutes; a 9-hour and a 24-hour query returned the same fifteen rows. **The window you ask for is not the window you get, and nothing in the response says so** — it prints the range you requested above results that cover a fraction of it.
    - **SO AN EMPTY VERCEL LOG QUERY IS NOT EVIDENCE THAT NOTHING HAPPENED.** It is the same silence as the disabled secret scanner and the `email_log` table that did not exist yet: absence of a row is absence of a *retained* row. Before reading anything into an empty window, **ask what the oldest surviving line is** — one unfiltered query with a wide `since` answers it.
    - **The thing that DOES cover an overnight window is Supabase `auth_audit_logs`**, which held a full 23 hours when Vercel held 51 minutes. For "did anybody sign in", ask the database, not the platform logs.

- **COMMIT `f591111` CALLS RENDERING `profile_picture_url` "A REAL PHOTO LEAK". THAT IS STILL TRUE OF WHAT IT DESCRIBES, AND IT IS NOT TRUE OF THE DIRECTORY TODAY.** Read alone, it says showing a candidate's photo to an employer is a leak — which would make the 24 Aug photos merge look like a reintroduced fault. It is not. The two are about different surfaces:
  - **28 Jun 2026, `f591111`:** the old employer-dashboard slider rendered `profile_picture_url` inside a card whose own design was "ghost INITIALS — never the candidate's photo". A component showing a photo where its own contract said initials is a leak, and retiring it was right.
  - **24 Aug 2026:** Paul decided uploaded photos ARE shown to employers on `/candidates`, because **the candidate chose to put one on a recruitment profile.** That is a decision about consent, made deliberately, and the directory card's comment now records it.
  - **The line that separates them is consent, not the column.** An UPLOADED photo is shown. The OAuth avatar in `auth.users` metadata is not, and must not be — 52 candidates have one and every one arrived as a side effect of pressing "Sign in with Google". The employer-mode watermark also stays initials-only: it is a gated preview state, and what it reveals is a product decision rather than a consistency tidy-up.

- **A DOCUMENT WRITTEN FOR A DECISION MUST LIVE WHERE THAT DECISION GETS MADE. SAVED IS NOT THE SAME AS REACHABLE.** Three times on 24 Aug 2026, something was stored somewhere technically correct and practically unreachable:
  1. **The aggregator attribution SQL** — written into the rolling STATE OF PLAY draft, destroyed by the next refresh-in-place.
  2. **The 51-object orphan list** — same draft, same fate, same day.
  3. **The replacement file** — committed properly, but onto an UNMERGED branch, so the document needed to approve an irreversible deletion sat behind a merge gate for an unrelated feature.
  - Three different mechanisms, one fault. The third is the instructive one, because it looks like the fix for the first two.
  - **A rolling draft is for state, not for anything that must survive. An unmerged branch is for code, not for something needed BEFORE the merge.** Ask where the decision will actually be taken, and put the document there.
  - **It is the same family as the rest of the day's faults, and the family is the point:** the deletion button that reported success and sent nothing, the `privacy@` address published four times and never created, the feed announcing live adverts as dead. Every one is **the far end of something, where nothing reports back.** Our side looks perfect in all of them. The common failure is not the mechanism — it is that nobody checks the far end.

- **A PUBLISHED ADDRESS IS A DEPENDENCY NOBODY TESTS.** `privacy@thrivecareer.co.uk` was printed four times in the Privacy Policy — as the Data Protection contact, the route for every data right, the children's-data contact and the page footer — and **it never existed.** Not misconfigured: never created, with no catch-all, so every message to it vanished and no bounce reached us. Live and dead the whole time. Swapped to `contact@` on 24 Aug 2026, which is proven to arrive because a real inbound email landed there on 22 Aug.
  - **The lesson is not about email.** It is the same shape as the deletion button that fired zero requests and the feed's expiry date going out already in the past: **the far end of a promise, where nothing reports back.** Our side looks perfect in all three — the address renders, the button clicks, the XML validates — and the failure is entirely at the end we never observe.
  - So: **an address, a webhook, a feed URL or a support link that we PUBLISH is a claim, and a claim gets checked the way any other claim does.** Send one message to it and read the inbox. `mailto:` renders identically whether the mailbox exists or not, which is exactly why it survived four appearances on a legal page.
  - **THREE addresses are proven to arrive, and this line used to say two.** `contact@thrivecareer.co.uk` (a real inbound landed 22 Aug 2026), `paul@thrivecareer.co.uk`, and **`support@thrivecareer.co.uk`** — proven by the same standard and two weeks earlier: on **8 Aug 2026 fraser@saucehospitality.co.uk, a real employer, emailed support@ asking how to remove a job ad; it arrived in Paul's inbox and he answered it.** Anything else in a template or a policy is unverified until someone receives a test.
    - **THE STALENESS MATTERED, in the direction that wastes a day rather than the one that breaks something.** `support@` is the most-published address in the product — **26 references** against contact@'s 15, and it carries the only route to a human on `/account-under-review`, `/post-job`, `/candidates` and the Terms. Reading "only two are proven" straight after the `privacy@` fault, the obvious move is a 26-file swap to contact@ — replacing a working address with a different working address, for nothing, on four sensitive surfaces.
    - **The check that settled it was a Gmail search, not an argument**: `to:support@thrivecareer.co.uk in:anywhere`, looking for a message that ARRIVED rather than one we sent. A sent test proves nothing about delivery; an inbound from a stranger proves everything. **THAT TEST IS SOUND WHEN IT SAYS YES AND WORTHLESS WHEN IT SAYS NO — SEE THE `hello@` CORRECTION IMMEDIATELY BELOW, WHICH THIS FILE GOT WRONG FOR THREE WEEKS.**

- **`hello@thrivecareer.co.uk` IS LIVE. THIS FILE AND TWO CODE COMMENTS CALLED IT DEAD, AND ALL THREE WERE WRONG.** Corrected 31 Aug 2026 on Paul's own account of the mailbox: it is **one of three aliases** — `hello@`, `contact@` and `support@` — and **all three land in the `paul@` inbox**.
  - **WHY IT LOOKED DEAD, AND THIS IS THE PART THAT MATTERS: NONE OF THE ALIASES FORWARDS TO GMAIL.** So a Gmail search for mail sent to one of them returns nothing whether the address works or not. Re-run 31 Aug 2026, `to:hello@thrivecareer.co.uk in:anywhere` still returns exactly one result — Paul's own SENT test of 11 Aug — on an address that has been working the whole time.
  - **A POSITIVE FROM THAT SEARCH PROVES DELIVERY; A NEGATIVE PROVES NOTHING.** An inbound found in Gmail really did arrive, which is why the `support@` and `contact@` findings stand. An empty result only means *Gmail* never saw it, and for these aliases Gmail never sees any of it. **The instrument has one direction, and this file wrote down a conclusion in the direction it cannot answer.**
  - Same family as the disabled secret scanner, the `email_log` table that did not exist yet, and the Vercel window that retains under an hour: **absence of a record is not absence of the thing.** The novelty here is that the check was chosen deliberately, described in this file as the thing that settles it, and then used backwards.
  - **The Reply-To change was still right and must not be reverted.** `support@` is the address `/terms`, `/privacy-policy` and the chatbot publish, so it is the one that has to work; moving to it was correct on its own merits. Only the stated *reason* — that `hello@` swallows mail — was false.
    - The general shape, and it is the same one as the board being 252 rather than 247: **a fact recorded here is true as of the day it was written, and the ones that read as absolute limits ("only two", "never", "none") are the ones most worth re-measuring before acting on.**

- **A rule broken five times needs a mechanism, not another line.** "Read the deployment record, don't guess the preview hostname" was written down after the second failure and broken three more times — a DNS error and two 404s, each briefly reading as "the route is broken". `npm run preview-url` now prints the real URLs from the record. Same argument as `migrations:check` and the pre-push hook: discipline is what already failed, so make the correct move the easy one.

## Verification — how checks fail quietly

These are all real, from this project. A check that passes for the
wrong reason is worse than no check, because it ends the search.

- AN ASSERTION THAT PASSES ON A BROKEN PICTURE IS NOT A PASS.
  LOOK AT THE SCREEN. On 27 Aug 2026 four App Store screenshots were
  captured with every assertion green — content present, no fixtures,
  no emoji, no cookie banner, the file exactly 1284x2778 read from the
  PNG header — and TWO LIVE BUGS were visible in them. `/jobs` rendered
  its own <h1> ENTIRELY BEHIND the fixed header, and `/temp-work` put
  45% of a phone screen of filter chips above the sentence that says
  what the page is. Both had presumably been true for weeks. Nobody
  noticed because nobody had looked at the product on a phone.
  - The assertions were not wrong. They were about the DOM, and every
    element was present, correct and in it. Presence is not visibility,
    and a check that asks the DOM cannot tell you what a person sees.
  - This is the same division already in this file — state beats screen
    for whether it is CORRECT, screen beats state for whether it is
    FINISHED — but it had only ever been applied to our own drives. The
    lesson is that it applies to the PRODUCT: open the page, at the size
    a person holds, and look.

- A SCRIPT THAT CAN WRITE MUST REFUSE TO GUESS WHERE. Pass the
  target or skip. Never default, never infer. `prove-employer-delete-gate.ts`
  fell back to `https://thrivecareer.co.uk` when given no argument, was
  wired into `npm run verify`, and so ran UNATTENDED AGAINST PRODUCTION —
  a build that did not yet carry the gate — and really deleted an
  employer account. It cost nothing because that script's teardown was
  written properly, which is luck about this script and not a property
  of the pattern. A default target is a loaded gun pointing wherever the
  default points, and the shot is fired by somebody who never typed a
  URL. It now exits 2 with SKIP and says which deployment it needs.
  - The related half, already applied: A CHECK THAT CANNOT RUN BY
    DEFAULT DOES NOT BELONG IN `verify`. Wired in, it skipped on every
    machine and every push, leaving verify permanently NOT VERIFIED —
    and a red nobody expects to be green is a red nobody reads. Same
    reasoning as `rlsprobe:prove`.

- THE SECOND ONE WAS WORSE, AND IT DID NOT GUESS A TARGET — IT HARDCODED
  THE ONE ACCOUNT THIS FILE SAYS NEVER TO TOUCH. `scripts/delete-test-users.js`
  ran `main()` unconditionally at the bottom of the file, took no argument,
  asked no confirmation, held the service-role key, and its two targets were
  `pauldavies.gbr@gmail.com` — **Paul's real account, which exists and had
  signed in the day before** — and `gicalorandi@gmail.com`. It walked 25
  table/column pairs including `{ table: 'jobs', column: 'employer_id' }`, then
  called `auth.admin.deleteUser`. **DELETED 1 Sept 2026.**
  - **IT ALSO LIED WHILE IT WORKED.** The loop printed `Cleared <table>`
    whenever `error` was null, and a delete matching nothing returns no error.
    So it reported success on every table whether or not it touched one — the
    same fault as reading your own `echo` instead of an exit status, in a
    script whose whole job is deletion.
  - **NOTHING REFERENCED IT** — no npm script, no workflow, no doc — and it
    entered the repository as a stowaway inside `d395575`, a commit about
    storing the PKCE verifier in cookies. **A file nothing calls is a file
    nobody reviews**, and an unrelated commit is how it gets in.
  - **WHAT THE DELETION ACHIEVES AND WHAT IT DOES NOT.** It can no longer be
    run by accident from a fresh clone or by tab-completing in `scripts/`,
    which is the actual risk — it carries no credential of its own. It is
    still in history and always will be, and one
    `git checkout d395575 -- scripts/delete-test-users.js` puts it back.
    **History was deliberately NOT rewritten:** the file holds no secret, the
    repository is public so it is already published, and rewriting 1,753
    commits would break every clone and every sha quoted in this file.
    **This entry is what stops it coming back**, because the reason lives here
    rather than only in a commit message.
  - **AND THE SWEEP THAT WOULD HAVE FOUND IT WAS NEVER RUN.** It surfaced while
    looking for something else. Two instances is a class: before trusting
    anything in `scripts/`, ask of every writing script whether its target is
    an ARGUMENT or a LITERAL. 26 of 120 files can write; 14 can delete.

- **THE SWEEP FOUND TWO MORE, AND THE INTERESTING PART IS THAT I DESCRIBED THEM
  WRONG FIRST.** `scripts/run-migrations.js` and `scripts/insert-employer-profile.js`
  both took no argument and both hardcoded `pauldavies.gbr@gmail.com` — **Paul's
  real candidate login** — inserting an `employer_profiles` row for it. That is
  not cosmetic: **owning an `employer_profiles` row is exactly what blocks
  self-deletion and switches `/settings/privacy` to the employer branch**, so a
  stray run would have silently taken away his own ability to delete his account.
  Nothing referenced either file. **BOTH DELETED 1 Sept 2026.**
  - **I CALLED THEM "a third undocumented path that writes schema, alongside
    `apply_migration` and the `db push` we forbid". THAT WAS WRONG, and it was
    repeated back to me before I checked it.** Dating the files settles it:
    `insert-employer-profile.js` and all three `.sql` files it reads arrived in
    `cce9f68` on **1 March 2026, the first commit**; `run-migrations.js` arrived
    28 March. **The ledger's first row is 7 April.** They are not a rival path
    competing with `apply_migration` — they are **fossils of how schema was
    applied before the ledger existed**, and the schema half is already dead
    because all three `.sql` files have since been deleted from the repo.
  - **AND THE LEDGER CANNOT TELL YOU WHETHER THEY EVER RAN.** Both tables
    `run-migrations.js` would create (`platform_settings`, `saved_candidates`)
    exist, and **no ledger row creates either** — which looks damning until you
    notice the ledger begins 7 April and the repository begins 1 March. **The
    entire original schema was created in a five-week window the ledger never
    recorded**, so their absence is absence of a RETAINED RECORD, not of the
    event. Same shape as `email_log` reading zero because the table did not
    exist yet. The only durable trace either script could leave is the
    `employer_profiles` row, and there is none — meaning *never ran* and *ran,
    row later removed* are *now indistinguishable*.
  - **THE GENERAL LESSON IS ABOUT THE DESCRIPTION, NOT THE SCRIPTS.** "A live
    third path writing schema" is alarming and actionable; "March fossils whose
    inputs are gone" is neither. I reached for the first because I had found a
    real hazard ten minutes earlier and was still reading everything in that
    light. **A correct finding next to an overstated one makes the overstatement
    credible** — check the dates before you name a thing a live path.

- THE POSITIVE CONTROL MUST NOT COST MORE THAN THE THING IT PROVES.
  The obvious way to watch the employer gate fail is to remove it and
  redeploy — which means publishing a build where employers CAN erase
  themselves, against a database shared with production and nine real
  employer accounts. Small window, unbounded cost, wrong trade. The
  control used instead moves what the check READS rather than removing
  the check: a fixture whose `user_metadata.role` says employer but who
  owns no `employer_profiles` row must be erased normally. Same
  metadata, opposite outcome, decided by the row.
  - And two real deployments disagreeing is a better control than a
    broken one anyway — the accidental production run IS the red. Same
    script, one deployment without the gate and one with, opposite
    answers, neither of them manufactured.
  - This does not license skipping the control. It says find one whose
    blast radius is a fixture. If the only control you can think of is
    "deploy it broken", the thing to change is the control.

- VERIFY BY PROPERTY, NOT BY THE THING YOU REMOVED. To confirm a
  yellow box is gone, scan for yellow backgrounds — not for the class
  you just deleted. Searching for what you removed passes whether or
  not something else still does it.

- A CHECK THAT LOOKS FOR A WORD CANNOT FIND A CLAIM MADE BY A PICTURE.
  31 Aug 2026: a grep for "Verified" found four surfaces asserting a
  check we never made. It could not have found the fifth, because the
  fifth had no word in it — a green ✓ beside "Level 2 Food Hygiene",
  on a certification the candidate typed in themselves. The claim was
  made entirely by a GLYPH AND A COLOUR.
  - It was found by opening the after-screenshot and looking at it,
    which is the division this file already draws: state beats screen
    for whether it is CORRECT, screen beats state for whether it is
    FINISHED. Every string assertion passed and was right.
  - **AND THE FIX IS TO MOVE THE CHECK FROM THE INSTANCES TO THE
    CLASS.** Counting "✓" characters would still miss a green dot, a
    green SVG, or a tick drawn as a background image. The check now
    walks EVERY element and fails on any short green glyph, wherever it
    lives and whatever it is called — so the next one goes red instead
    of waiting for somebody to look.
  - **REMOVE THE PICTURE, NOT ONLY THE WORD.** Honest wording above a
    green tick leaves the image saying what the text no longer does.
    Both halves assert; both have to change.

- WHAT WE GOT RIGHT IN ONE PLACE IS OFTEN WRONG EVERYWHERE ELSE, AND
  THAT IS A SEARCHABLE PATTERN RATHER THAN BAD LUCK. Two instances
  found on 31 Aug 2026, minutes apart:
  - The **correct** right-to-work wording already existed at offer
    stage on `/my-jobs` — "Thrive stores only that you've confirmed it
    — no documents" — written once, correctly, and never applied to the
    four surfaces that claimed the opposite.
  - `SignedImage` **already** supports a `fallback` for a photo that
    fails to load. **Two of fourteen call sites pass one.** The other
    twelve render `null`, so a broken or still-signing photo shows
    nothing at all rather than initials.
  - So when you fix a thing, grep for the RIGHT version as well as the
    wrong one. The good answer is usually already in the codebase, used
    once, by whoever thought about it hardest — and it is cheaper to
    copy than to re-derive. Same spine as the `/candidates` declaration
    that was copied byte-for-byte onto `/jobs`.

- ASYNC RESOLUTION MEANS A SCREENSHOT CAN LIBEL THE PRODUCT, AND IT DID.
  31 Aug 2026 I reported that an avatar "renders as an empty yellow
  square" from a full-page screenshot, and it was wrong: driven
  properly the image is `naturalWidth=1024`, `complete=true`, storage
  200. `SignedImage` signs the URL in a `useEffect`, so there is a real
  window where the box is legitimately empty — and my drive had waited
  on BODY TEXT LENGTH, which says nothing about an image.
  - **The report went out before the check did**, and it caused work to
    be reprioritised around a fault that does not exist.
  - **Wait on the thing you are photographing.** `img.naturalWidth > 0`
    is one predicate and it cannot be satisfied by an unsettled page.
    Same family as "0 jobs" at 1.5s and "Loading roles…" at 6s, and the
    third time this file has had to record it.

- A CHECK THAT FAILS SAFE IS THE DANGEROUS KIND. An anon insert test
  returned "violates row-level security policy" and nearly got
  reported as secure — the refusal came from reading the row back,
  not from the insert. If a refusal surprises you, explain it before
  accepting it.

- TEST THE STATEMENT THE CODE ACTUALLY RUNS. A passing .insert()
  proved nothing about an endpoint using .upsert({onConflict}) —
  different statements, different failures.

- IF A TOOL RETURNS A CLEAN RESULT, CHECK THE TOOL. An emoji grep
  returned nothing while a pencil sat in the file it had just read.
  Prove the tool can find a thing you know is there.

- ASK THE QUESTION WITH TWO DIFFERENT ANSWERS. If both the old and
  new behaviour would produce the same output, the test proves
  nothing. Production and preview returning different error strings
  is what proved the dispatcher routing.

- A QUERY'S SHAPE IS NOT A FACT ABOUT THE WORLD, AND WIDENING IT IS
  THE CHEAPEST INVESTIGATION THERE IS. Twice on 30 Aug 2026, in one
  day: a user agent truncated to 70 characters in my own SELECT, which
  became "the log cannot tell the app from Safari"; and a 60-row LIMIT
  ordered newest-first, which became "Apple failed twice". Both times
  the instrument answered exactly what it was asked and the answer was
  read as a property of the product.
  - THE SAME SENTENCE IS THE REMEDY, WHICH IS WHY IT IS ONE ENTRY AND
    NOT TWO. Reading the full user agent proved the log CAN separate
    Chrome from Safari from a bare WKWebView; lifting the row limit
    found three GOOGLE sign-in failures nobody had ever seen, and
    turned a two-day hunt for an Apple bug into a provider-agnostic
    fault in our own OAuth callback. Both of that day's real findings
    came from re-running a query with less of my own shape in it.
  - **AND IT IS NOT ONLY SQL. TWICE MORE THE SAME DAY, WITH grep.** `SignupPanel.tsx` was searched for `type="password"`, found none, and reported as "candidate signup is OAuth-only" — the password field is in `CandidateSignupForm`, which SignupPanel RENDERS. And `pg_trigger` plus one call site became "a message never notifies anybody" — the notification is sent from `app/messages/page.tsx`, a different file, and `email_log` holds `new_message` rows proving it. **Both conclusions were about a FEATURE and both searches were of ONE FILE.**
  - So when a result supports a tidy conclusion, ASK WHAT THE QUERY
    EXCLUDED before believing it: the LIMIT, the ORDER BY, the WHERE,
    the substring, the time window. It costs one re-run.

- A CHECK'S SELECTOR IS PART OF THE CHECK, AND IT IS THE PART THAT IS
  WRONG. When a drive comes back red, the first question is not "what
  did I break" but "is my instrument measuring what I named". Five in
  one week: `aside a[href^="/admin"]` counting the LOGO's link as a
  thirteenth nav item; a wrap check matching the value's parent row;
  an emoji grep finding nothing in a file it had just written; an RLS
  refusal that came from the read-back, not the insert; a card count
  that predated my own is_house change. Every one read as a product
  fault and was the instrument. Stopping at red would have "fixed"
  working code.

- A VALUE THAT IS SUPPOSED TO MOVE NEEDS TWO MEASUREMENTS, TAKEN
  APART. One generation of the jobs feed cannot tell a rolling
  horizon from a frozen constant — both emit one date that looks
  correct today, and "no date is in the past" PASSES on the frozen
  one. Demonstrated rather than argued: freezing the horizon left
  12 of 15 checks green, and the three that went red were exactly
  the three that generate twice. Force the gap through a real
  parameter of the shipped function (`feedExpiryHorizon(now)`),
  never a mocked clock, so the thing proven is the thing that runs.
  - The general shape is the substring rule again, in time rather
    than in text: **if both states produce the same output at the
    instant you look, looking once cannot tell you which one you
    are in.**

- A POSITIVE CONTROL MUST LIVE OUTSIDE THE THING BEING CHANGED. The
  emoji detector's control pointed at a file the sweep then
  legitimately emptied — so the control began failing ON SUCCESS,
  and for twenty minutes that read as a broken detector. The fixture
  was part of the population under change. Controls come from inline
  literals or fixtures the operation cannot reach.

- ANY FINDING MEASURED UNDER A TEMPORARY ALLOWLIST OR FIXTURE NAMES
  THE FIXTURE STATE IT WAS MEASURED IN, AND IS RE-MEASURED AFTER THE
  REVERT. The /admin/settings clip sat in the queue for a day as a
  decision Paul owed. It was real as a measurement and it belonged to
  a fixture: a candidate account temporarily allowlisted into Admin
  Users put a second, longer address on the list. Revert the
  allowlist and the fault is gone, because the live list holds one
  short address.
  - Nothing was faked. The measurement was honest, the number was
    right, and the report even said the screenshots were taken with
    the allowlist still in. What was missing is that THE FINDING DID
    NOT RECORD WHICH STATE IT WAS MEASURED IN, so it outlived that
    state and became a property of the page.
  - This is the same spine as the two rules above, the other way up:
    there the fixture was inside the population and broke the
    control; here the fixture created the ONLY state in which the
    fault existed. Either way, a measurement that does not name its
    fixture cannot be re-checked by the next person.
  - It does NOT mean the finding was worthless. A data-driven list is
    exactly as wide as the data someone adds later, so the fix is
    still right — it just had to be justified by "the next address is
    not ours to choose", not by "the page is broken today".
