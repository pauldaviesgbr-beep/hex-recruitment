# App Store listing copy — Thrive

Apple ID 6805802815. Everything here is the BARE value, ready to paste.

This file exists because the copy was drafted in a Gmail draft and lived
nowhere else. A document written for a decision has to live where the
decision is taken, and the decision is taken in App Store Connect — so the
text needs to survive outside an email that gets refreshed in place.

Last updated 31 Aug 2026.

---

## Support URL

```
https://thrivecareer.co.uk/support
```

Bare value. Type it, do not copy it out of an email — Gmail wraps links in
`https://www.google.com/url?q=…` and it is not visible until it is already
in a permanent public field.

Live and returns 200. Carries support@thrivecareer.co.uk, one of the three
addresses proven to receive real inbound mail.

## Marketing URL

Deliberately blank. Optional, and we have nothing that is not the site.

---

## Description

4,000 character limit. This is well under it — written to what it needs,
not to what it allows.

```
Thrive is a job board for people who work shifts.

Browse real roles from real employers — permanent jobs and short-term shifts, side by side. Pay, hours and location are on the listing, so you know what you are applying for before you apply.

WHAT YOU CAN DO
• Search by role, town or postcode. Filter by pay, hours, and whether the work is in person.
• Apply in a few taps. Attach a CV if you have one, or build one in the app if you do not.
• Save roles to come back to, and keep every application in one place.
• Get an email when an employer replies.

TEMP WORK, NOT JUST PERMANENT
Short-term roles and casual shifts have their own section, with the hourly rate shown up front. Tell employers you are available and they can come to you.

WHY IT EXISTS
Applying for a job should not feel like sending something into a void. Employers reply through Thrive, so you can see where you stand.

Thrive is starting in hospitality — kitchens, bars, hotels and restaurants — and growing from there.
```

### Four deliberate omissions — do not "improve" these back in

- **NO NUMBER OF JOBS.** 251 is true today and false next week, and nobody
  will remember to update a store description. The screenshots carry the
  number and date themselves honestly.
- **NO "the salary on every role".** It is on 249 of 251 — two imported
  Goldenkeys rows carry a literal zero. "Pay is on the listing" is true.
- **NO "free to use".** True today; Profile Boost is planned as an in-app
  purchase. A description that says free and then is not is worse than one
  that never said it.
- **NO PRICE, RATE OR TRIAL LENGTH ANYWHERE.** Standing rule.

### Two claims that were verified rather than assumed

Apple rejects for inaccurate metadata, so both were checked in the code
before being written down:

- *"Tell employers you are available and they can come to you"* — TRUE.
  /temp-work inserts into `temp_interest`; the table carries
  `trg_temp_interest_notify`; /api/temp-notify emails the poster;
  /temp-work/manage reads it back.
- *"Get an email when an employer replies"* — TRUE. Sent from
  `app/messages/page.tsx`, and `email_log` holds `new_message` rows.
  (This was briefly cut on a wrong reading and then restored — the
  notification is sent in application code, not by a database trigger,
  so checking `pg_trigger` alone says the opposite.)

---

## Keywords

100 character limit, comma separated, **no spaces after commas** — Apple
counts every character.

```
chef,kitchen,bar,waiter,waitress,restaurant,hotel,catering,shifts,temp,barista,sous,pastry,porter
```

97 of 100.

- Single words only. Apple indexes individual words and recombines them,
  so "part time" and "front of house" were paying for their own spaces
  and covering nothing extra.
- **Thrive, Hospitality and Jobs are deliberately absent** — already
  indexed from the app name and subtitle, and repeating them wastes
  characters.

---

## App Review Information

Sign-in required is ticked, so the reviewer needs credentials.

- **Account:** `pauldavies.gbr+applereview@gmail.com`
- **Name on the account:** Marcus Hale
- **uid:** `4ba92141-677d-4422-91cf-9b6f4e0067ca`
- **Password:** NOT RECORDED HERE. App Store Connect is the system of record
  — App Review Information on the version page. If it is ever lost, reset it
  through the product rather than writing it down again.

See CLAUDE.md — that account is not a fixture and must survive the next
census, or a future update is rejected with no visible cause.

---

## Screenshots

1290x2796, seven captured, in `store-shots/r1-…` to `r7-…`.

Order for the install sheet — the first three are what people see without
scrolling:

1. the board
2. a job detail
3. temp work

then dashboard, saved jobs, applications, profile.

They are browser captures, so the top bar sits slightly shorter than in
the real app, which carries the safe-area inset.

---

## If the reviewer deletes the credentials — recreation steps

**ASSUME THEY WILL.** Apple asked for an account-deletion demonstration, and
reviewers test what they are shown. Both accounts in the Notes field are
deletable from inside the app, which is the entire point of the change.

### ⚠️ THERE IS NO SCRIPT THAT RECREATES EITHER ACCOUNT

`scripts/seed-test-accounts.js` seeds **content** — adverts, saved jobs — for
accounts that **already exist**, and it does so against two hardcoded uids
(`dda822a2-…` and `e8ad7a0b-…`). If either account is deleted the uid is gone,
and that script writes against a dead id. **It will not rebuild anything.**
Nothing recreates Marcus Hale at all; that account was made by hand.

### RECREATING IS NOT UNDOING, AND THIS IS THE PART THAT SURPRISES

A recreated account gets a **NEW user id**. Everything the deletion repointed
stays repointed — at the tombstone, forever.

**If the employer demo (`+employer@`, Thrive Test Employer) is deleted:**

- its **4 filled adverts are archived and owned by the tombstone**. They do not
  come back to a recreated employer, and several drives assert against them
- the **applications on them survive** — Marcus's 2 and the `+candidate`
  fixture's 3 — with `employer_notes` cleared, but now hanging off adverts the
  new account does not own
- `employer_profiles`, `employer_subscriptions` and `employer_members` rows are
  deleted outright
- the fixture message thread survives with `participant_2` repointed at the
  tombstone and `participant_2_name` reading **"Deleted account"**
- the founding-cohort spot returns to the pool on its own

**If Marcus (`+applereview@`) is deleted:**

- his **2 applications survive with `candidate_id` NULLed** — so Thrive Test
  Employer's pipeline keeps the rows and loses the person
- his messages and the fixture thread survive, repointed at the tombstone
- profile, CV, photo, saved jobs and alerts are deleted outright
- `protected:prove` **goes red on the next `npm run verify`**, which is how we
  find out

### THE STEPS

**Marcus Hale — `pauldavies.gbr+applereview@gmail.com`**

1. Create the auth user with `email_confirm: true` and role `employee`. It must
   be confirmed or `reap-unconfirmed` removes it within three days.
2. Set a password and **paste it into App Store Connect → App Review
   Information**. The old password is dead; the record there is now wrong.
3. Create the `candidate_profiles` row — keyed on **`user_id`**, not `id`:
   full name **Marcus Hale**, job title **Senior Chef de Partie**,
   `is_discoverable: true`.
4. Upload an avatar and a CV named `marcus-hale-cv.pdf`.
5. Save 4 jobs, and apply to **Thrive Test Employer's own filled adverts only** —
   an application against a live advert emails a real employer, and Goldenkeys
   and Host are real companies.
6. **Update `lib/protectedAccounts.ts` with the new uid** and run
   `npm run protected:prove`. The census looks accounts up BY ID precisely so a
   recreated account is not mistaken for the original.

**The employer demo — `pauldavies.gbr+employer@gmail.com`**

1. Create the auth user, confirmed, role `employer`.
2. Create the `employer_profiles` row: company **Thrive Test Employer**,
   `approval_status: 'approved'`.
3. Update the two hardcoded uids in `scripts/seed-test-accounts.js`, then run it
   to rebuild the 4 adverts. **They are new rows** — the originals stay archived
   under the tombstone.
4. Re-point any drive that asserts against the old advert ids.

### THE CHEAPER OPTION, IF YOU WOULD RATHER NOT REBUILD

**Hand Apple the candidate credential only**, and say in the reply that employer
accounts are a separate approved business tier available on the web. It is
honest, it is one sentence, and it halves what has to be rebuilt. The counter —
that a reviewer can create an employer account themselves from the launch screen
in under a minute — is real, but they would then be deleting an account they
made rather than one of ours.
