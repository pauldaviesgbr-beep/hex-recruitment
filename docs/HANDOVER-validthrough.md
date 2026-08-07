# Handover — proving `validThrough` on a real row

**Branch:** `feat/jobposting-validthrough` · **not merged** · `npm run verify` green
**Main** carries the server-rendered JobPosting schema already (`8992987`) and is unaffected by this branch.

Paul will not merge this branch until `validThrough` has been seen **present on one row and absent on another, in the same report**. That is the only thing outstanding.

---

## Why it is not done

The run needs a **non-recruiter** job, and nothing on the board is one — all 246 live rows are recruiter postings, which are exempt from `job-expiry` and therefore correctly emit no `validThrough`. So a test job has to be created through the real post-a-job form.

The drive got to step 1 and stopped. **The form was right and the driver was wrong:** it refused to advance with a red banner reading *"Please choose whether the pay is per hour or per year"*, because the script picked the salary unit with a regex `/year|annum|annual/` that matched the **placeholder** option — "Per hour or per year?" — and so selected nothing.

That is the defaults-must-not-make-claims rule working: `salaryPeriod` has no default, and the form stops rather than publishing "£32,000 per hour".

---

## The one-line fix

In `scratchpad/post-job2.js`, select the salary unit **by value, not by matching label text** — the placeholder is a question containing the word "year" and will match any such regex.

```js
// wrong — matches the placeholder "Per hour or per year?"
const yearly = uopts.find(o => /year|annum|annual/i.test(o))
// right — pick by the option's value, and assert something was chosen
await unit.selectOption('year')            // or 'annual'; read the values first
if (!(await unit.inputValue())) throw new Error('salary unit not set')
```

Assert the selection took rather than assuming it did — see the CLAUDE.md rule about substring searches confirming changes.

---

## The run, in order

1. **Pre-flight, repeated — not inherited.** `job_alerts` empty, zero triggers on `jobs`, 246 active. `job_alerts` being empty is the only reason a throwaway ad is safe, and *"it was empty this morning"* is not a safety property.
2. Publish through the form as the **test employer** (`pauldavies.gbr+employer@gmail.com`), on a preview of this branch.
3. `curl` the new job's page and read `validThrough` **out of the served HTML** — not from source, not from a component.
4. `curl` a **recruiter** row in the same pass and show `validThrough` correctly **absent**.
5. Delete the test job, prove the board is back to **246**.

**Both halves in one run.** "Absent everywhere" and "correctly conditional" look identical if you only check one, and that is the entire reason this test exists.

---

## Still unwalked

Nobody has taken this form end to end with a real post at the end since it became three steps. **Steps 2 and 3 have not been seen at all.** Specifically open:

- does the AI generator produce something usable
- does the publish-at-step-2 transition behave
- does step 3 read as optional rather than unfinished

---

## UI finding, recorded not fixed

**The salary unit control shows "Per hour or" truncated at 1440.** It is a `<select>`, so a person clicks it and sees the options — but the visible label is a fragment of a sentence.

Both this and the driver bug have **one cause**: the placeholder is a question long enough to be cut off, and long enough to contain the words a matcher would look for. Something shorter — "Per…", or a blank with the label above — fixes the display and stops a script mistaking it for a real choice.

---

## What is on the branch

- `lib/jobExpiry.ts` — `JOB_EXPIRY_DAYS`, one constant read by both the expiry cron and the schema, so they cannot drift
- `validThrough` emitted **only** where `job-expiry` will act, i.e. `is_recruiter_posting = false`. Google *stops showing* a posting after this date, so publishing it on a listing the scrape keeps alive would remove our own live jobs from the results — 23 rows cross 60 days on **18 August 2026**
- postcode districts (`SW18`, `RG17`, `W1`) map to `postalCode` instead of `addressRegion`; `area` itself is untouched because twelve files read it and it is the spine of location matching
