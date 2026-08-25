# Real account erasure — scope and open decisions

**Nothing here is built. This is a proposal and a set of questions.**
Compiled 25 August 2026. Paul decides section 3 before any code exists.

The driver is **Apple App Store Review Guideline 5.1.1(v)**: an app offering
account creation must let a user **initiate *and complete*** account deletion
**from inside the app**. "Contact support to delete your account" is a
documented rejection reason.

---

## 1. Where we are against Apple, honestly

| Apple requires | Today (after the deletion-request merge) | Verdict |
|---|---|---|
| Deletion **initiated** in-app | Yes — a button in `/settings/privacy` | ✅ |
| Deletion **completed** in-app | **No.** It records a row and emails a human, who then does it by hand | ❌ |
| The **account gone**, not deactivated | **No.** Nothing is deleted at all | ❌ |
| A confirmation step, not accidental | Partially — one click, no confirm step | ⚠️ |

**The merged route is strictly better than what preceded it and it is not
enough.** It is an automated version of "contact support", which is the
specific pattern the guideline names. Assume rejection if submitted as-is.

The confirmation point cuts both ways and is worth stating: Apple wants an
accidental tap to be impossible, but a multi-step flow that argues with the
person on each screen is a dark pattern. One clear confirm, no retention offer,
no guilt.

---

## 2. The enumeration

**There is not one foreign key from `public` to `auth.users`.** Verified across
all 48 person-bearing columns: `fk_to_auth = 0` for every one. Nothing
cascades. Every deletion is a manual enumeration, which is exactly why the
admin route refuses — **that refusal stays.**

### 2a. Reachable by an id column — 44 tables, 48 columns

Candidate-side, employer-side and shared. Proposed treatment per table, with
reasons. **Rows marked ⚠ depend on a decision in section 3.**

| table · column | rows | proposed | why |
|---|---|---|---|
| `candidate_profiles.user_id` | 66 | **delete** | the profile itself |
| `candidate_cvs.user_id` | 40 | **delete** | `cv_data` jsonb is the richest PII we hold |
| `deletion_requests.user_id` | 0 | **keep, anonymise id** | the audit trail *of the erasure*. Deleting it destroys the evidence we complied |
| `saved_jobs.candidate_id` | — | **delete** | theirs alone |
| `job_alerts.candidate_id` | — | **delete** | theirs alone; also stops future email |
| `apply_starts.candidate_id` | — | **delete** | analytics, no other party |
| `device_tokens.user_id` | — | **delete** | must go, or push still reaches the device |
| `push_log.user_id` | — | **delete** | delivery log |
| `user_onboarding.user_id` | — | **delete** | theirs alone |
| `boosts.user_id` | — | **delete** | theirs alone |
| `platform_feedback.user_id` | — | **anonymise** | the feedback is useful, the author is not |
| `job_views.viewer_id` | 578 | **anonymise → null** | a null viewer already means "anonymous"; the count stays honest |
| `job_click_events.user_id` | — | **anonymise → null** | as above |
| `job_impressions.user_id` | — | **anonymise → null** | as above |
| `profile_views.profile_id` / `.viewer_id` | — | **delete / anonymise** | rows *about* them go; rows *by* them anonymise |
| `job_applications.candidate_id` | 77 | ⚠ **DECISION** | see 3a |
| `messages.sender_id` | 82 | ⚠ **DECISION** | see 3b |
| `notifications.user_id` | 93 | ⚠ **DECISION** | see 3c |
| `interviews.candidate_id` | — | ⚠ **DECISION** | employer's diary |
| `interview_bookings.candidate_id` | — | ⚠ **DECISION** | employer's diary |
| `job_offers.candidate_id` | 0 | ⚠ **DECISION** | a signed contract |
| `application_status_events.actor_id` | 17 | ⚠ **DECISION** | employer's audit trail |
| `offer_audit_log.actor_user_id` | 0 | ⚠ **DECISION** | legal audit trail |
| `temp_post_comments.user_id` | 6 | ⚠ **DECISION** | see 3d — public, others replied |
| `temp_post_likes.user_id` | — | **delete** | no content, no other party |
| `temp_interest.candidate_user_id` | 2 | ⚠ **DECISION** | an expression of interest to an employer |
| `saved_candidates.candidate_id` | — | **delete** | an employer's shortlist entry pointing at a person who is gone |
| `company_reviews.reviewer_id` | 0 | ⚠ **DECISION** | public content |
| `review_helpful_votes.user_id` | — | **delete** | a vote, no content |
| `user_departures.user_id` | 1 | **keep** | it *is* the departure log |
| **employer-side** (`employer_profiles`, `employer_members`, `employer_subscriptions`, `jobs`, `ai_generation_usage`, `employer_availability`, `employer_availability_overrides`, `employer_email_templates`, `employer_job_stats`, `interview_notes`, `temp_posts`, `employees`) | — | **out of scope for v1** | an employer deleting their account orphans live adverts and other people's applications. A much bigger question — candidate-first |

### 2b. Reachable ONLY by email — no id column at all

**These are the ones a `*_id` sweep silently leaves behind**, and they are how
you end up with a person who is "deleted" but still in the system.

| table · column | rows | proposed | why |
|---|---|---|---|
| `email_log.recipient` | 131 | **anonymise the address** | keep the send record (it proves what we sent and when), replace the address |
| `waitlist.email` | 0 | **delete** | nothing but the address |
| `employer_members.invited_email` | — | **delete row** | a pending invite to an address that no longer exists |
| `user_departures.email_domain` | 1 | **keep** | domain only, already not identifying |

### 2c. Storage — the `profiles` bucket has FIVE layouts, not one

Private bucket, 83 objects. **A script handling `photos/<uid>/` only would
leave three quarters behind — which is precisely how the 51 orphans happened.**

| layout | objects | owners |
|---|---|---|
| `photos/<uuid>/…` | 18 | 13 |
| `cvs/<uuid>/…` | 15 | 12 |
| `offer-letters/<uuid>/…` | 14 | 4 |
| `signatures/<uuid>/…` | 13 | 5 |
| **`<uuid>/…` — bare, legacy, no prefix** | **23** | **23** |

That last row is the trap: the owner id is `foldername[1]`, not
`foldername[2]`, so any code assuming a prefix misses all 23.

The three public buckets — `company-logos`, `job-banners`, `temp-posts` — are
keyed by **job or company id, not user id**, and hold employer content rather
than candidate PII. Out of scope for a candidate deletion; in scope if employer
deletion is ever built.

### 2d. Not a table or a bucket, but still them

- **`auth.users`** — the account itself, plus `raw_user_meta_data` which holds
  the OAuth avatar URL, full name and provider identity for 52 of 66
  candidates.
- **`job_offers`** holds `signature_ip` and `signature_user_agent` for both
  parties. Zero rows today, so no problem now — but it is PII that no
  `*_id` sweep would think to look for, and it will exist once offers are used.

---

## 3. THE DECISIONS — these are Paul's, and I am not making them

Each is genuinely two-sided. I have set out the consequences for both parties
and stopped.

### 3a. An application an employer has already received — 77 rows

A candidate deletes their account. An employer holds their application.

| | **Delete the application** | **Anonymise it** |
|---|---|---|
| the employer sees | a row vanishes from their pipeline with no explanation; counts change retrospectively | "Deleted candidate" stays in the pipeline; they know someone applied, cannot contact them |
| the candidate gets | genuinely gone | their application history persists, attached to nobody |
| honesty of our stats | applications-received drops | stays accurate |
| GDPR | cleanest | defensible — the person is no longer identifiable |

**These are different products.** The first says an account deletion is total.
The second says an employer's record of their own hiring is not the
candidate's to erase. Both are legitimate; they imply different promises in the
privacy policy, and the policy should be written to match whichever is chosen.

### 3b. Messages — 82 rows, two-sided by nature

A thread has two participants. Deleting one side's messages leaves the other
holding half a conversation. Anonymising leaves the text — which the candidate
wrote, and which may name them in the body regardless of what the row says.

Options: delete the whole thread (removes the employer's side too, which they
also authored); delete only their messages (leaves gaps); anonymise the sender
(leaves the words). **There is no option that satisfies both parties fully.**

### 3c. Notifications sent to OTHER people about this person — 93 rows

"Sarah applied to your Chef role." That row belongs to the *employer*, and it
names someone who has asked to be erased. Delete it and the employer loses
notification history; keep it and a deleted person's name is still on our
servers, in a row we would not think to look at.

### 3d. Comments on temp shifts — 6 rows, public, others replied

Public content other people responded to. Deleting leaves replies answering
nothing. Anonymising leaves the words attributed to "a deleted user" — the
Reddit model. Small numbers today; the principle is what matters.

### 3e. Anything with legal weight

`job_offers` and `offer_audit_log` are 0 rows today. When they are not, a
signed offer is a contract, and contract records normally survive a deletion
request under the "legal obligation" basis. **Worth deciding before offers are
in real use rather than after.**

---

## 4. Safety requirements for whatever gets built

Not optional, and each has a specific failure it prevents.

- **Count before → enumerate → delete → count after → read back.** The
  after-count must be a **separate statement**: a count inside the same CTE as
  the delete reads the pre-write snapshot, cannot show the change, and reads as
  reassuring. (I made exactly that mistake on 24 Aug; it is the reason this is
  written down.)
- **RE-RUNNABLE AFTER A PARTIAL FAILURE.** A deletion that dies halfway and
  cannot be resumed leaves a person half-deleted, which is worse than either
  end state. Every step must be idempotent — `delete where` is naturally so;
  the storage step must tolerate "already gone".
- **A person with no rows in most tables must not fail it.** Most candidates
  have nothing in most of these tables. Zero rows is the normal case, not an
  error.
- **STORAGE FIRST, `auth.users` LAST.** This is the important one. If the auth
  row goes first and storage then fails, the files become **unattributable** —
  no id to match them to, no way to find them again. That is exactly the
  51-orphan fault, and doing it in that order makes it *rebuildable by design*.
  Deleting storage first means a failure leaves a recoverable, findable state.
- **A receipt.** Record what was deleted, per table, with counts, at the time.
  Without it there is no way to answer "did we actually erase them" six months
  later — and that question is the whole point.

---

## 5. What I would build, once section 3 is decided

Not built. For discussion only.

1. `lib/erasure.ts` — a pure enumeration returning what *would* be deleted,
   with a dry-run mode. Testable without a database.
2. `scripts/prove-erasure.ts` — the enumeration checked against a throwaway
   user it creates and destroys, in `verify`, watched failing on purpose.
3. `/api/account/delete` — authenticated, confirm-token, calls the same
   enumeration. **Storage first, auth last.**
4. The settings screen becomes: confirm → deleted → signed out.
5. The `deletion_requests` row is marked `actioned`, not removed — the audit
   trail of the erasure survives the erasure.

The request route stays as the fallback for anyone who cannot complete it
in-app, and as the record that they asked.
