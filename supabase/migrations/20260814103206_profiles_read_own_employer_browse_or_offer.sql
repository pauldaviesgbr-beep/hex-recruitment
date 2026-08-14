-- profiles bucket SELECT: from "any signed-in session may read everything"
-- to relationship-scoped. Paul's ruling 14 Aug 2026: employers MAY browse
-- candidate CVs and photos (the headhunter model), so the tightening is
-- aimed at everyone else — one candidate can no longer read another's CV,
-- and one employer can no longer read another employer's offer terms.
--
-- Three legs, matching how the paths are actually laid out (both the
-- legacy <uid>/... roots and the <kind>/<uid>/... shape):
--   A. your own objects
--   B. employer browse of candidate content (cvs, photos, legacy roots)
--      for any ACTIVE employer member — the same membership the write
--      policies and has_employer_permission rest on
--   C. offer-letters and signatures cross the candidate/employer boundary
--      by construction (each side uploads under its OWN folder and the
--      other side must read it), so they are readable exactly when a row
--      in job_offers connects the reader to the folder's owner.

drop policy "profiles: read requires a signed-in session" on storage.objects;

create policy "profiles: own files, employer browse, or an offer between you"
on storage.objects for select to authenticated
using (
  bucket_id = 'profiles' and (
    (storage.foldername(name))[1] = (auth.uid())::text
    or ((storage.foldername(name))[1] = any (array['photos','cvs','offer-letters','signatures'])
        and (storage.foldername(name))[2] = (auth.uid())::text)
    or (
      (
        (storage.foldername(name))[1] = any (array['photos','cvs'])
        or (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
      and exists (
        select 1 from public.employer_members m
        where m.user_id = auth.uid() and m.status = 'active'
      )
    )
    or (
      (storage.foldername(name))[1] = any (array['offer-letters','signatures'])
      and (
        exists (
          select 1 from public.job_offers o
          where o.candidate_id = auth.uid()
            and o.employer_id::text = (storage.foldername(name))[2]
        )
        or exists (
          select 1 from public.job_offers o
          join public.employer_members m on m.user_id = auth.uid() and m.status = 'active'
          join public.employer_profiles ep on ep.id = m.employer_id and ep.user_id = o.employer_id
          where o.candidate_id::text = (storage.foldername(name))[2]
        )
      )
    )
  )
);
