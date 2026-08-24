# Orphaned storage — 51 objects belonging to accounts that no longer exist

**Status: NOTHING HAS BEEN DELETED. This is a list for approval.**
Compiled 24 August 2026. Storage deletion is irreversible and has no undo
record, so nothing here is removed until Paul approves the named list.

This file exists because the list was twice written into a rolling email draft
that gets refreshed in place, and twice destroyed. A file survives.

---

## What this is

Nothing in the Thrive product has ever deleted a storage object. There is no
code that removes a file from the bucket — searched for, and the only match is
a `localStorage` mock inside a test script. So when an account went, its
uploads stayed.

The database side was done properly every time: across 25 tables carrying a
user id, only 3 `platform_feedback` rows, 2 `push_log` rows and 1
`user_departures` row point at an id that no longer exists. Storage was the one
blind spot, and it was missed by everyone, every time.

**Nothing here is newer than 26 June 2026.** This is a historical pile from
early accounts and test data, not an active leak filling up now. The bucket is
**private**, so none of it is publicly reachable — every read needs a signed
URL. But the mechanism is still live: the next account deleted adds to it.

## The count

| kind | objects | people | size |
|---|---|---|---|
| offer-letters | 14 | 4 | 1,948 kB |
| photos | 14 | 9 | 6,695 kB |
| signatures | 13 | 5 | 88 kB |
| cvs | 10 | 7 | 121 kB |
| **total** | **51** | **15 folders / ~14 people** | **~8.6 MB** |

Kind counts sum to more than 15 people because several people appear under
more than one kind.

### Two corrections to the headline number

1. **`signatures/_sim/default.png` is 0 kB simulation scaffolding**, not a
   person's signature — it sits under a folder literally called `_sim`. It is
   in the 51 by the letter of the rule and should not be treated as personal
   data. So it is **50 real objects plus 1 fixture**.

2. **An earlier count of "14 photographs, 9 accounts" was wrong** — it searched
   the `photos/` prefix only, and used `cv/` when the folder is `cvs/`. The
   bucket also has a second layout: 22 objects live under a bare `<uuid>/`
   folder rather than a named prefix. Those 22 all belong to live candidates
   and are **not** orphans, but they are why a prefix-only search undercounts.

## Which of these matter most

**The CVs.** Ten named documents with employment history, frequently an address
and a phone number, belonging to people with no account.

**The signatures.** Twelve images of people's actual handwriting (thirteen
minus the `_sim` fixture).

## The evidence line

Every object below satisfies **all four** of these — its owner id appears in
none of them:

- no row in `auth.users`
- no row in `candidate_profiles` (by `user_id`)
- no row in `employer_profiles` (by **either** `user_id` **or** the profile
  `id` — checked both, because offer-letter folders are keyed by employer id
  rather than user id)
- no row in `job_offers` (by `id`, `employer_id` **or** `candidate_id`)

The query that produced this list is at the bottom. **Re-run it before acting
on this file** — approving a deletion from a list that has drifted is how the
wrong object gets removed.

---

## Grouped by PERSON

Erasure per person is the right unit, not per file. Newest first.

### 1. `2b8b7a0f-799f-418b-a0e2-bf96c77cbb9c` — 7 objects, 2,400 kB, Apr–Jun 2026
photos, signatures, offer-letters
```
offer-letters/2b8b7a0f-799f-418b-a0e2-bf96c77cbb9c/signed-a84d7853-8bea-4b75-813c-fe2258a581a0-1777046971496.pdf
offer-letters/2b8b7a0f-799f-418b-a0e2-bf96c77cbb9c/signed-edd602cd-1b61-4d8d-afec-a00b566d8f6d-1777408248265.pdf
photos/2b8b7a0f-799f-418b-a0e2-bf96c77cbb9c/dashboard-1782404329199.jpeg
photos/2b8b7a0f-799f-418b-a0e2-bf96c77cbb9c/dashboard-1782475274191.png
signatures/2b8b7a0f-799f-418b-a0e2-bf96c77cbb9c/00ec4756-3691-4b8f-bd7a-bd083279335e-1777044188735.png
signatures/2b8b7a0f-799f-418b-a0e2-bf96c77cbb9c/a84d7853-8bea-4b75-813c-fe2258a581a0-1777046970224.png
signatures/2b8b7a0f-799f-418b-a0e2-bf96c77cbb9c/edd602cd-1b61-4d8d-afec-a00b566d8f6d-1777408246407.png
```

### 2. `78d9038b-2e4d-4ff5-88f3-6f8a0496fb65` — 11 objects, 433 kB, Apr 2026
offer-letters, signatures — the largest single group
```
offer-letters/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/1777006556209.pdf
offer-letters/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/1777046727259.pdf
offer-letters/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/1777048997889.pdf
offer-letters/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/1777049122627.pdf
offer-letters/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/1777051169676.pdf
offer-letters/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/1777407960542.pdf
signatures/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/employer-1777046726500.png
signatures/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/employer-1777048997476.png
signatures/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/employer-1777049122137.png
signatures/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/employer-1777051168755.png
signatures/78d9038b-2e4d-4ff5-88f3-6f8a0496fb65/employer-1777407960107.png
```

### 3. `bd089661-4340-4432-a77f-3ba43424a4d4` — 6 objects, 882 kB, Jun 2026
offer-letters, signatures
```
offer-letters/bd089661-4340-4432-a77f-3ba43424a4d4/1781285867012.pdf
offer-letters/bd089661-4340-4432-a77f-3ba43424a4d4/1781356751833.pdf
offer-letters/bd089661-4340-4432-a77f-3ba43424a4d4/1781421219856.pdf
signatures/bd089661-4340-4432-a77f-3ba43424a4d4/employer-1781285866535.png
signatures/bd089661-4340-4432-a77f-3ba43424a4d4/employer-1781356751519.png
signatures/bd089661-4340-4432-a77f-3ba43424a4d4/employer-1781421219294.png
```

### 4. `756d3484-039b-464d-93f2-12d1a027bd54` — 1 object, 3 kB, Jun 2026
```
signatures/756d3484-039b-464d-93f2-12d1a027bd54/53848625-04dc-477c-976c-1200e09e542f-1780559927621.png
```

### 5. `_sim` — 1 object, 0 kB, Apr 2026 — **FIXTURE, NOT A PERSON**
Simulation scaffolding. Listed for completeness; not personal data.
```
signatures/_sim/default.png
```

### 6. `da217c5e-3188-4864-adcc-e5fc7a65a092` — 1 object, 1,580 kB, Apr 2026
```
photos/da217c5e-3188-4864-adcc-e5fc7a65a092/1775896428216.jpeg
```

### 7. `ba5231e9-4f93-4425-bd1b-14a9fea9dc1f` — 2 objects, 420 kB, Mar 2026
```
photos/ba5231e9-4f93-4425-bd1b-14a9fea9dc1f/1772746151328.JPG
photos/ba5231e9-4f93-4425-bd1b-14a9fea9dc1f/1772803270996.jpeg
```

### 8. `9b73b1fe-06df-49ab-bc32-ad2f677eea4b` — 3 objects, 2,367 kB, Mar 2026
**has a CV**
```
cvs/9b73b1fe-06df-49ab-bc32-ad2f677eea4b/1772652642995.docx
photos/9b73b1fe-06df-49ab-bc32-ad2f677eea4b/1772652943212.jpeg
photos/9b73b1fe-06df-49ab-bc32-ad2f677eea4b/1772740036137.jpeg
```

### 9. `05cfc93b-2f01-4d3f-bde5-f698e215aa54` — 7 objects, 371 kB, Feb–Mar 2026
**has FOUR CVs**
```
cvs/05cfc93b-2f01-4d3f-bde5-f698e215aa54/1770731479603.docx
cvs/05cfc93b-2f01-4d3f-bde5-f698e215aa54/1771148355965.docx
cvs/05cfc93b-2f01-4d3f-bde5-f698e215aa54/1771148363047.docx
cvs/05cfc93b-2f01-4d3f-bde5-f698e215aa54/1771167479048.docx
photos/05cfc93b-2f01-4d3f-bde5-f698e215aa54/1771145949224.jpg
photos/05cfc93b-2f01-4d3f-bde5-f698e215aa54/1771146496443.jpg
photos/05cfc93b-2f01-4d3f-bde5-f698e215aa54/1772360340492.jpg
```

### 10. `9362c0d8-7901-4ced-b66f-d5f9c11931b2` — 2 objects, 79 kB, Mar 2026
**has a CV**
```
cvs/9362c0d8-7901-4ced-b66f-d5f9c11931b2/1772360155467.docx
photos/9362c0d8-7901-4ced-b66f-d5f9c11931b2/1772360154839.png
```

### 11. `f123d65c-26e9-487b-ad5a-1b9f9d0ff84f` — 2 objects, 69 kB, Feb 2026
**has a CV**
```
cvs/f123d65c-26e9-487b-ad5a-1b9f9d0ff84f/1772298111510.docx
photos/f123d65c-26e9-487b-ad5a-1b9f9d0ff84f/1772298426826.png
```

### 12. `a1102d1a-9ddb-421a-a862-b47df7a807c3` — 2 objects, 72 kB, Feb 2026
**has a CV**
```
cvs/a1102d1a-9ddb-421a-a862-b47df7a807c3/1772296656162.docx
photos/a1102d1a-9ddb-421a-a862-b47df7a807c3/1772296655724.png
```

### 13. `70ae403e-e97e-4713-a327-e1bbeb0bd57f` — 3 objects, 67 kB, Feb 2026
```
offer-letters/70ae403e-e97e-4713-a327-e1bbeb0bd57f/1771320649065.docx
offer-letters/70ae403e-e97e-4713-a327-e1bbeb0bd57f/1771487250930.docx
offer-letters/70ae403e-e97e-4713-a327-e1bbeb0bd57f/1771764859266.docx
```

### 14. `34174c7b-473e-49fd-a758-4a16f6c466f1` — 1 object, 9 kB, Feb 2026
**has a CV**
```
cvs/34174c7b-473e-49fd-a758-4a16f6c466f1/1770651233606.docx
```

### 15. `6701c543-388d-4ebc-b3b8-4872a34a674d` — 2 objects, 101 kB, Feb 2026
**has a CV**
```
cvs/6701c543-388d-4ebc-b3b8-4872a34a674d/1770136847445.docx
photos/6701c543-388d-4ebc-b3b8-4872a34a674d/1770136846699.jpg
```

---

## The query that produced this — re-run it before acting

Read only. Run in the Supabase SQL editor.

```sql
with o as (
  select name, (metadata->>'size')::bigint bytes, created_at,
         split_part(name,'/',1) kind,
         case when split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
              then split_part(name,'/',1) else split_part(name,'/',2) end owner_txt
  from storage.objects where bucket_id='profiles'
)
select o.name, o.bytes, o.created_at, o.kind, o.owner_txt
from o
where not exists (select 1 from auth.users u          where u.id::text        = o.owner_txt)
  and not exists (select 1 from candidate_profiles c  where c.user_id::text   = o.owner_txt)
  and not exists (select 1 from employer_profiles e   where e.user_id::text   = o.owner_txt
                                                         or e.id::text        = o.owner_txt)
  and not exists (select 1 from job_offers j          where j.id::text        = o.owner_txt
                                                         or j.employer_id::text = o.owner_txt
                                                         or j.candidate_id::text= o.owner_txt)
order by o.owner_txt, o.name;
```

If that returns 51 rows, this file is still accurate. **If it returns a
different number, stop and find out why before deleting anything.**

## Related

- The code-side fix — deletion should remove the person's folders — is separate
  and not yet done. It must cover **all four kinds** and **both folder
  layouts**: a fix handling only `photos/<uid>/` would leave three quarters of
  the problem behind, which is how this happened.
- The Privacy Policy publishes *"After account deletion: 30 days — data is
  permanently deleted"*. These are from February to June. That commitment is
  not being met today, and it is a second, independent reason to act.
