# Backfill, 25 Aug 2026 — 44 false placements moved from `filled` to `archived`

**This file is the undo record.** It exists as a file rather than in a report
because the rolling draft has destroyed content twice, and an undo you cannot
find is not an undo.

Run at **05:42 UTC / 06:42 BST, 25 August 2026**, after
`fix/scraper-archives-not-fills` was merged (`6ff5e48`) and deployed, so the
next scrape cannot re-create what this corrected.

---

## Why

The Goldenkeys reconcile wrote `status = 'filled'` whenever a role vanished
from their site. A listing disappearing means the role left **their** board —
not that anyone was hired, and certainly not through Thrive.

**Thrive has never placed anyone.** Established from `job_applications` and
`application_status_events`: 0 hired, 0 offer-accepted, nothing past
`reviewing`. So there was no genuine hire to protect, and the honest placement
count starts at zero.

## What changed

| | before | after | change |
|---|---|---|---|
| `filled` (all jobs) | 48 | **4** | −44 |
| `archived` (all jobs) | 17 | **61** | +44 |
| **`active` (all jobs)** | **247** | **247** | **0 — unchanged** |
| total rows | 312 | 312 | 0 |

By employer:

| employer | filled before → after | archived before → after | active |
|---|---|---|---|
| Goldenkeys Recruitment | 33 → 0 | 0 → 33 | 226, unchanged |
| Host Staffing | 11 → 0 | 11 → 22 | 19, unchanged |
| Thrive Test Employer | 4 → **4** | 0 → 0 | 0 — **excluded, untouched** |

The remaining 4 `filled` rows are Thrive Test Employer's fixtures. They were
deliberately excluded: they are not adverts, several drives assert against
them, and they were never a claim about a real role.

**The active board did not move.** Both `filled` and `archived` are already off
the public board, so a change in `active` would have meant a live advert was
touched. 247 before, 247 after.

## The statement that ran

```sql
update jobs
set status = 'archived'
where status = 'filled'
  and company in ('Goldenkeys Recruitment', 'Host Staffing')
  and company <> 'Thrive Test Employer'
returning id, company, title, status;
```

Guarded three ways: only rows already off the board, only the two recruiters,
and the fixtures excluded explicitly on top of that.

**Counted three independent ways, all agreeing on 44:** `RETURNING` gave 44
rows; `archived` rose by exactly 44 in a **separate** statement (a count inside
the same CTE reads the pre-write snapshot and cannot show the change); and 44
rows now carry the update's timestamp.

---

## THE UNDO

A `BEFORE UPDATE` trigger `jobs_updated_at` runs
`new.updated_at = now()` **unconditionally**, so all 44 rows now read
`2026-08-25 05:42:05.706818+00`.

**That means a one-command undo cannot restore the original `updated_at`.** The
trigger overwrites whatever you set. Both forms are given below; use the one
that matches what you need.

### Form A — status only, one command

Restores `filled`. `updated_at` will be stamped with the time you run it.

```sql
update jobs
set status = 'filled'
where updated_at = '2026-08-25 05:42:05.706818+00'
  and status = 'archived'
  and company in ('Goldenkeys Recruitment', 'Host Staffing');
```

That timestamp identifies **exactly** these 44 rows and nothing else —
verified: 44 rows, all archived, 33 Goldenkeys + 11 Host, 0 anything else.

### Form B — status *and* the original `updated_at`

Needs the trigger suspended, so it is not one command. Run as a block.

```sql
alter table jobs disable trigger jobs_updated_at;

-- 43 rows, original updated_at 2026-08-18 07:29:47.531126+00
update jobs set status = 'filled', updated_at = '2026-08-18 07:29:47.531126+00'
where id in (
  '0619f44d-5e32-4a3b-9bce-e0c7ed785934',
  '10ebf46b-1bfd-477b-a7ce-a92663e04acb',
  '12b03156-2c51-4ee6-b4f7-8c906ebfbaa4',
  '14e72d16-3f3d-4da5-bbcc-dad50bc40bea',
  '1b4e812e-f9d1-4a39-b8d2-69aab6de58e6',
  '27287db0-8fc5-417a-baf0-3bdd1af30db2',
  '2a1ecaa3-a15b-484b-b70f-429ec7f121e8',
  '3c8535ae-d7fe-49d9-a7e6-6584d266ca73',
  '3e1c3f7c-417f-45e8-9a3b-adecbd59fb07',
  '48c61891-3eff-439e-b145-97a2c5438fa9',
  '6029b5dc-a209-4d2e-9924-7c7c803d8f39',
  '60a87dbb-3dd9-491d-9fb1-06d5e0c840fa',
  '6416425c-a439-45ef-b0e8-15746df38875',
  '8655e2a0-3068-4c0c-b2b5-6824366ab757',
  '8799b00b-def2-49dd-a213-883d1d550524',
  '8a7b48c3-6d23-450f-9d31-0767fe646a05',
  '8c228b9b-443b-4832-ac02-f34621ebe33b',
  '8ebae458-2b36-4871-a6ef-857f7c5e99e4',
  '8fb9f111-cfe3-4463-b5e6-657a467d292a',
  '92138ca8-dd36-4a03-b70a-41ec9228c86a',
  '92b0982e-8824-4623-b64f-01f7901f3181',
  '9760fa84-ee5f-4f24-a332-ef01921c2df5',
  '98239683-6bbc-4d69-936b-a14387492d50',
  '99b24b3b-7aa7-41f8-b38c-386958252cfc',
  '9b1ea2bd-2f65-4060-9ef1-7b7373bcd671',
  '9ef36f87-201f-46fb-8f6d-ccad27349048',
  'a839b943-f445-4b9e-b15e-c898de4902ea',
  'aa6d04f2-0f4b-4dc7-9439-9cc95b7e1d46',
  'aee67005-0243-40a3-9b3e-c3563cbba68e',
  'af2fadc2-a699-439e-b885-06ee6f7bba9f',
  'b42aa166-5c74-448b-a437-6e9b980ec0f8',
  'b797195a-cb7e-41f9-974d-182108198acb',
  'ba9d9ffd-da5a-4866-ba0e-a45bf05151d3',
  'be6a80dc-c739-453d-b831-be758a1018eb',
  'c0af2f9b-a4d5-4541-b5e9-b0e6ce0316a4',
  'c1c3c876-7e49-4f4b-a782-4dc91d4e76f0',
  'c66ee479-0c1f-4239-8f50-5f2dee4bdc8a',
  'd408fb7d-1931-4d42-b794-1751755affb6',
  'd94b3779-88c6-4c32-9af9-f52be917c457',
  'e1ab1ce1-8b30-483d-8750-0282dc05cc7b',
  'e391d388-2919-44fc-8831-6d3644999036',
  'f4536aae-dcbf-41b6-8ecc-2c3911522259',
  'f8e88464-5a41-405a-8cf5-d67b49d98001'
);

-- 1 row, original updated_at 2026-08-21 11:32:55.291318+00
update jobs set status = 'filled', updated_at = '2026-08-21 11:32:55.291318+00'
where id = '2fdd1f83-8b2e-4e37-ae34-049b536703b2';

alter table jobs enable trigger jobs_updated_at;
```

**Re-enable the trigger.** A left-disabled `jobs_updated_at` means every later
edit silently stops stamping `updated_at`, which is a quieter fault than the
one being undone.

After either form, check in a **separate** statement:

```sql
select count(*) filter (where status = 'filled')   as filled,
       count(*) filter (where status = 'archived') as archived,
       count(*) filter (where status = 'active')   as active
from jobs;
```

Expect `filled 48 · archived 17 · active 247`.

---

## Two rows worth knowing about

- **`2fdd1f83` "Page Not Found"** — a junk row the scrape captured from a 404
  page. It was in the 44 and is now `archived`, which is right for it whatever
  else happens. It stays on the open list as a row to delete properly.
- **`99b24b3b`, `9760fa84`, `d94b3779`, `a839b943`** — the four hand-seeded
  June Goldenkeys rows with no `source_url`, which the weekly scrape cannot
  see. They were `filled` and are now `archived`. Still orphans; still nothing
  reconciles them. Recorded so the next count of Goldenkeys rows knows.
