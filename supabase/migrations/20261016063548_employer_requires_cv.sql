-- AN EMPLOYER CAN REQUIRE A CV WITH EVERY APPLICATION.
--
-- Asked for by Goldenkeys (Toby); switched on for them 16 Oct 2026 on Paul's
-- instruction (a separate, named data change). It was believed to exist and did
-- not: the only switch was a per-advert "CV required" tag that imported adverts
-- never carry, and the /jobs board's own Apply never checked it.
--
-- THE RULE LIVES HERE, UNDER EVERY APPLY PATH, because the application write is
-- client-side. Same shape as fixture_application_refusal: a decision function
-- that can be asked read-only, and a BEFORE INSERT trigger that applies it.
--
-- "ATTACHED" MEANS ON THE APPLICATION: when a CV is required and the candidate
-- has one, the trigger copies their profile CV onto the application if the
-- path did not, so the employer always receives it.

alter table public.employer_profiles
  add column if not exists requires_cv boolean not null default false;

comment on column public.employer_profiles.requires_cv is
  'Every application to this employer''s adverts must carry a CV. Enforced by trg_require_cv_for_application.';

create or replace function public.job_requires_cv(p_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce(ep.requires_cv, false) or coalesce('CV required' = any(j.tags), false)
    from public.jobs j
    left join public.employer_profiles ep on ep.user_id = j.employer_id
    where j.id = p_job
    limit 1
  ), false);
$$;

create or replace function public.application_cv_refusal(p_candidate uuid, p_job uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.job_requires_cv(p_job) then null
    when exists (
      select 1 from public.candidate_profiles cp
      where cp.user_id = p_candidate and coalesce(cp.cv_url, '') <> ''
    ) then null
    else 'THRIVE_CV_REQUIRED'
  end;
$$;

create or replace function public.require_cv_for_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.job_requires_cv(new.job_id) then
    return new;
  end if;
  if public.application_cv_refusal(new.candidate_id, new.job_id) is not null then
    raise exception 'THRIVE_CV_REQUIRED: this employer requires a CV with every application';
  end if;
  if coalesce(new.cv_url, '') = '' then
    select cp.cv_url into new.cv_url
    from public.candidate_profiles cp
    where cp.user_id = new.candidate_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_cv_for_application on public.job_applications;
create trigger trg_require_cv_for_application
  before insert on public.job_applications
  for each row execute function public.require_cv_for_application();

revoke all on function public.application_cv_refusal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.job_requires_cv(uuid) from public, anon;
grant execute on function public.job_requires_cv(uuid) to authenticated;
