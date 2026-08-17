-- WHERE PEOPLE SIGN UP AND BROWSE FROM.
--
-- Vercel sends `x-vercel-ip-country` (ISO 3166-1 alpha-2) on every request and
-- we have been discarding it. Nothing here derives a location from an IP: we
-- store the two-letter code the edge already told us, and no IP is copied into
-- these columns.
--
-- ALL THREE ARE NULLABLE AND FILL FORWARD ONLY. Every existing row stays null
-- and that is correct — we did not know, and a backfill would have to invent it
-- or geolocate stored IPs, which is a separate decision.
--
-- 'XX' is Vercel's own value for "could not determine", so it is allowed by the
-- constraint rather than being written as null: "we asked and it did not know"
-- is a different fact from "we never asked", and only the constraint keeps them
-- distinguishable.

alter table candidate_profiles add column if not exists signup_country text;
alter table employer_profiles  add column if not exists signup_country text;
alter table job_views          add column if not exists country        text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'candidate_profiles_signup_country_iso') then
    alter table candidate_profiles
      add constraint candidate_profiles_signup_country_iso
      check (signup_country is null or signup_country ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employer_profiles_signup_country_iso') then
    alter table employer_profiles
      add constraint employer_profiles_signup_country_iso
      check (signup_country is null or signup_country ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'job_views_country_iso') then
    alter table job_views
      add constraint job_views_country_iso
      check (country is null or country ~ '^[A-Z]{2}$');
  end if;
end $$;

comment on column candidate_profiles.signup_country is
  'ISO 3166-1 alpha-2 from x-vercel-ip-country at signup. XX = edge could not determine. NULL = predates capture (17 Aug 2026) or was never seen.';
comment on column employer_profiles.signup_country is
  'ISO 3166-1 alpha-2 from x-vercel-ip-country at signup. XX = edge could not determine. NULL = predates capture (17 Aug 2026) or was never seen.';
comment on column job_views.country is
  'ISO 3166-1 alpha-2 from x-vercel-ip-country at view time. XX = edge could not determine. NULL = predates capture (17 Aug 2026).';

-- Reading "how many from each country" is a group-by over the whole table.
create index if not exists job_views_country_idx on job_views (country) where country is not null;

notify pgrst, 'reload schema';
