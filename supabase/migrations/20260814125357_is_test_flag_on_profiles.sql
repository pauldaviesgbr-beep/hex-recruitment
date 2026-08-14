-- ONE mechanism for "does this number include test rows", instead of every
-- admin query filtering by email pattern and some forgetting. The flag is
-- stamped on exactly the two standing test accounts (CLAUDE.md: the survivors
-- of the 14 Aug census). Paul's real accounts are NOT test accounts and are
-- not flagged.

alter table public.candidate_profiles add column if not exists is_test boolean not null default false;
alter table public.employer_profiles add column if not exists is_test boolean not null default false;

update public.candidate_profiles set is_test = true
where user_id = 'e8ad7a0b-6632-4a6f-b8e7-3d7fa6db0984';  -- pauldavies.gbr+candidate

update public.employer_profiles set is_test = true
where user_id = 'dda822a2-7fc1-4d6d-b208-66e8c021630a';  -- pauldavies.gbr+employer (Thrive Test Employer);
