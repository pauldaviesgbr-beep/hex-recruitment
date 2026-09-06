-- ============================================================================
-- A FIXTURE ACCOUNT CANNOT APPLY TO A REAL EMPLOYER'S ADVERT.
--
-- Twice in three days a review fixture applied to a live Goldenkeys advert and
-- toby@goldenkeys.co.uk was emailed about a candidate who does not exist:
--   3 Sept 15:42:34  "Junior Sous Chef - Luxury Country House Hotel"
--   6 Sept 08:34:51  "Sous Chef - Michelin-Starred Restaurant"
-- Both by the operator, both with the rule in front of him. A rule the operator
-- has in front of them is not a guard.
--
-- WHY THIS IS IN THE DATABASE AND NOT IN THE BUTTON.
-- The application write is CLIENT-SIDE: app/jobs/page.tsx and
-- components/ApplyNowModal.tsx each call supabase.from('job_applications')
-- .insert() straight from the browser. There is no server route in the path, so
-- there is no server-side place to put this except here. A check in the two
-- components would also be two copies of one rule, and bypassable by anything
-- holding a session.
-- ============================================================================

-- ── 1. THE LIST, AND IT IS THE ONLY LIST ────────────────────────────────────
-- A table rather than a constant in TypeScript, because the thing that has to
-- consult it is a trigger. Anything in TS that needs it reads it from here.
create table if not exists public.fixture_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind    text not null check (kind in ('candidate', 'employer')),
  label   text not null,
  note    text,
  created_at timestamptz not null default now()
);

comment on table public.fixture_accounts is
  'Test and review accounts. A fixture CANDIDATE may not apply to an advert '
  'owned by anyone who is not a fixture EMPLOYER. See fixture_application_refusal().';

alter table public.fixture_accounts enable row level security;

-- Readable by any authenticated user: it holds no secret, and the refusal
-- message is more useful than a mysterious one. Writable by nobody through
-- the API - membership changes are a migration, deliberately.
drop policy if exists fixture_accounts_read on public.fixture_accounts;
create policy fixture_accounts_read on public.fixture_accounts
  for select to authenticated using (true);

-- ── 2. THE FOUR FIXTURE CANDIDATES ──────────────────────────────────────────
-- EXPLICIT IDS, NEVER AN EMAIL PATTERN. The two directions of error are not
-- symmetrical: MISSING a fixture leaves things exactly as they are today,
-- while WRONGLY INCLUDING a real person stops them applying for work. A
-- pattern like '%+%' would catch any real candidate using plus-addressing.
insert into public.fixture_accounts (user_id, kind, label, note) values
  ('4ba92141-677d-4422-91cf-9b6f4e0067ca', 'candidate', 'Marcus Hale',
   'The Apple review credential. Applied to two live Goldenkeys adverts.'),
  ('65e46b07-2a67-4ae3-a5a9-2b44b6b314dd', 'candidate', 'Jordan Ellis',
   'pauldavies.gbr+deletiontakecandidate - the deletion take.'),
  ('e8552e23-410b-4370-8540-a3302bb6c5bb', 'candidate', 'James Smith',
   'pauldavies.gbr+appletest.'),
  ('e8ad7a0b-6632-4a6f-b8e7-3d7fa6db0984', 'candidate', 'Drive Test',
   'pauldavies.gbr+candidate - the standing test candidate the drives use.')
on conflict (user_id) do nothing;

-- ── 3. THE FOUR FIXTURE EMPLOYERS ───────────────────────────────────────────
-- Adverts a fixture candidate MAY apply to.
insert into public.fixture_accounts (user_id, kind, label, note) values
  ('dda822a2-7fc1-4d6d-b208-66e8c021630a', 'employer', 'Thrive Test Employer', null),
  ('dfad7ed4-21a7-4d61-b3ea-b784511f9c01', 'employer', 'Thrive Demo Kitchen',
   'The Apple review EMPLOYER credential.'),
  ('6ac1c745-5cab-48f9-b7de-17c25f5df0ce', 'employer', 'Thrive Demo Bistro', null),
  ('66ea10d4-75f3-489f-9cae-21df327c8f79', 'employer', 'Tombstone',
   'Owns archived adverts of deleted employers. Nobody is emailed for it.')
on conflict (user_id) do nothing;

-- ── 4. THE DECISION, AS ITS OWN FUNCTION ────────────────────────────────────
-- Separate from the trigger ON PURPOSE, so the exact decision that runs can be
-- asked about ANY pair read-only - including a real candidate against a real
-- advert - without inserting a row. A trigger body can only be tested by
-- writing, and writing is the thing we are trying not to do.
--
-- Returns the refusal reason, or NULL to allow.
create or replace function public.fixture_application_refusal(
  p_candidate uuid,
  p_job uuid
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Not a fixture candidate. Every real candidate leaves here, on one
    -- primary-key hit, and nothing else is evaluated.
    when not exists (
      select 1 from public.fixture_accounts
      where user_id = p_candidate and kind = 'candidate'
    ) then null
    -- The advert's owner is a fixture employer: the intended demo path.
    when exists (
      select 1 from public.jobs j
      join public.fixture_accounts fa on fa.user_id = j.employer_id
      where j.id = p_job and fa.kind = 'employer'
    ) then null
    else 'THRIVE_FIXTURE_GUARD'
  end;
$$;

-- SECURITY DEFINER IS LOAD-BEARING. fixture_accounts has RLS; if the lookup
-- ran as the caller and a policy hid a row, the guard would silently decide
-- "not a fixture" and let the application through. That fails OPEN - no worse
-- than today, and completely useless. Same for public.jobs.

-- ── 5. THE TRIGGER ──────────────────────────────────────────────────────────
create or replace function public.refuse_fixture_application()
returns trigger
language plpgsql
as $$
begin
  if public.fixture_application_refusal(new.candidate_id, new.job_id) is not null then
    -- The MARKER is what the client matches on; the client shows its own
    -- sentence. A raw server string must never reach a person - this codebase
    -- put "Unauthorized" in front of a user once already.
    raise exception 'THRIVE_FIXTURE_GUARD: a test account may not apply to a real employer''s advert';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refuse_fixture_application on public.job_applications;
create trigger trg_refuse_fixture_application
  before insert on public.job_applications
  for each row execute function public.refuse_fixture_application();
