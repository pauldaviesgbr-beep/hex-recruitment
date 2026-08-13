-- Lock down the `profiles` storage bucket.
--
-- WHAT WAS WRONG
-- The four policies on this bucket checked only `bucket_id = 'profiles'`. They
-- checked nothing about the PATH and nothing about WHO was asking:
--
--   SELECT  role public         -> anyone at all, no session needed
--   INSERT  role authenticated  -> write to anybody's folder
--   UPDATE  role authenticated  -> overwrite anybody's file
--   DELETE  role authenticated  -> delete anybody's file
--
-- The DELETE policy was named "Allow users to delete own profile files" and had
-- no "own" in it. That name is why this survived being read: people believed the
-- name instead of the rule. Every policy below is named after what it actually
-- enforces.
--
-- SELECT being granted to `public` was the live hole. The bucket is private
-- (public = false), which made it look safe; it is not the same thing. Proved
-- before writing this, using a throwaway object created and deleted for the
-- purpose: holding only the publishable key that ships in the browser bundle,
-- with no session at all, it was possible to LIST every folder, enumerate all
-- 80 objects with names and sizes, and download by path. That covered 36 CVs,
-- 14 offer letters and 13 signature images belonging to real people.
--
-- TWO PATH SHAPES, NOT ONE
-- There are nine writers of this bucket across six files, and they do not agree
-- on where the user id goes. Counted on the live rows before writing anything:
--
--   <uid>/cv-<ts>.<ext>      22 objects   uid at segment 1  (app/cv-builder)
--   photos/<uid>/…           17 objects   uid at segment 2
--   cvs/<uid>/…              14 objects   uid at segment 2
--   offer-letters/<uid>/…    14 objects   uid at segment 2
--   signatures/<uid>/…       13 objects   uid at segment 2, except 3 under
--                                         signatures/_sim/ (service role)
--
-- A policy matching only segment 1 -- the obvious one, and the one the newest
-- writer uses -- would have matched 22 of 80 and silently orphaned the other 58:
-- their owners locked out of their own CV, photo, offer letter or signature with
-- no error saying why. The expression below accepts both shapes and names the
-- four folder kinds rather than accepting any segment-2 match, so it stays tight
-- and tells the next reader what the convention is.
--
-- Covers 77 of 80. The remaining 3 are signatures/_sim/, the simulator's shared
-- placeholder, written by the service role -- which bypasses RLS entirely, so
-- they are unaffected by every policy here.
--
-- WHY SELECT IS `authenticated` AND NOT OWNER-ONLY
-- Owner-only was the intention and it is not reachable in this pass, for a
-- reason found by reading the code rather than assuming:
--
--   1. Signing is NOT a way round RLS. lib/storageUrl.ts imports the BROWSER
--      client, so createSignedUrl() runs as the caller and is itself subject to
--      this SELECT policy. 18 files sign this way. Under an owner-only rule the
--      employer's "View CV" link, both sides of an offer letter, and the two
--      signatures on it would all stop resolving -- the signing call fails, not
--      just the download.
--   2. The product deliberately lets employers read candidates they have no
--      relationship with: /candidates renders a SignedLink for every
--      discoverable candidate's CV. That is the talent pool working as designed,
--      so even a relationship-scoped rule would break a core feature.
--
-- Restricting `public` -> `authenticated` closes the anonymous hole completely,
-- which is the live exposure, and breaks nothing: every one of the 18 consuming
-- surfaces is behind a login, and no email template embeds an object from this
-- bucket (checked -- a mail client has no session and would have failed).
--
-- Going further than `authenticated` needs a product decision (may employers
-- browse CVs at all?) plus a server-side signing route, and is deliberately NOT
-- in this migration. Note that an employer-only rule would buy very little
-- today in any case: anyone can create a free employer account in a minute, so
-- employer-vs-candidate is not currently a real boundary.

begin;

drop policy if exists "Allow public read of profiles"          on storage.objects;
drop policy if exists "Allow authenticated uploads to profiles" on storage.objects;
drop policy if exists "Allow users to update own profile files" on storage.objects;
drop policy if exists "Allow users to delete own profile files" on storage.objects;

-- Read: any signed-in user. NOT public. See the note above for why this is not
-- owner-scoped yet.
create policy "profiles: read requires a signed-in session"
  on storage.objects for select
  to authenticated
  using ( bucket_id = 'profiles' );

-- Write: only under your own user id, in either of the two path shapes.
create policy "profiles: insert only under your own user id"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profiles'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[1] in ('photos','cvs','offer-letters','signatures')
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );

-- USING decides which rows you may target; WITH CHECK stops you moving an object
-- out of your own folder in the same statement. Both are required.
create policy "profiles: update only your own objects"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profiles'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[1] in ('photos','cvs','offer-letters','signatures')
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  )
  with check (
    bucket_id = 'profiles'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[1] in ('photos','cvs','offer-letters','signatures')
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );

create policy "profiles: delete only your own objects"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profiles'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[1] in ('photos','cvs','offer-letters','signatures')
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );

commit;
