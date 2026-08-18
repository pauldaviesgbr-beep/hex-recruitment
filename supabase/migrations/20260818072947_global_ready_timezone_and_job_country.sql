-- GROUNDWORK FOR OPERATING OUTSIDE THE UK.
--
-- Two columns that cost nothing today and are impossible to backfill later.
--
-- 1. signup_timezone — THE BROWSER'S OWN IANA ZONE, not one derived from the
--    country. A country -> timezone map is wrong for exactly the markets in
--    the plan: the United States spans six zones and Australia five, so
--    "US = America/New_York" puts a Los Angeles candidate three hours out.
--    Intl.DateTimeFormat().resolvedOptions().timeZone gives the real zone, so
--    we store that instead of guessing from the country.
--
-- 2. jobs.country — without it, "is this candidate in the same country as the
--    job?" cannot be asked at all, and that is the question that decides
--    whether a marketing channel is worth paying for. Today every job is UK
--    so the answer is trivially yes; the day it is not, the column has to
--    already exist on the old rows or the comparison is meaningless.
--
-- THE BACKFILL IS EVIDENCED, NOT ASSUMED. All 54 distinct locations across
-- the 247 live listings are UK places — England, plus Inverness, Loch Ness
-- and Scottish Borders in Scotland, plus Cardiff and South Wales. Checked
-- before writing. NO DEFAULT is set on the column: a job posted from
-- Australia tomorrow must state its country rather than silently inherit GB,
-- and null is reported as unknown rather than counted as UK.

alter table candidate_profiles add column if not exists signup_timezone text;
alter table employer_profiles  add column if not exists signup_timezone text;
alter table jobs               add column if not exists country         text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_country_iso') then
    alter table jobs add constraint jobs_country_iso
      check (country is null or country ~ '^[A-Z]{2}$');
  end if;
end $$;

-- Existing rows only. Guarded on `country is null` so a re-run cannot
-- overwrite a country somebody has since set deliberately.
update jobs set country = 'GB' where country is null;

comment on column jobs.country is
  'ISO 3166-1 alpha-2 of where the ROLE is. Backfilled to GB on 18 Aug 2026 after checking all 54 live locations are UK. No column default on purpose — a non-UK job must state its country rather than inherit one.';
comment on column candidate_profiles.signup_timezone is
  'IANA zone reported by the browser at signup (e.g. Australia/Sydney). NOT derived from country — the US and AU span several zones. NULL predates capture (18 Aug 2026).';
comment on column employer_profiles.signup_timezone is
  'IANA zone reported by the browser at signup. NULL predates capture (18 Aug 2026).';

create index if not exists jobs_country_idx on jobs (country) where country is not null;

notify pgrst, 'reload schema';
