-- Close the jobs-insert hole: ANY authenticated account could post a job.
--
-- THE FAULT. The insert policy read:
--
--   WITH CHECK (auth.uid() = employer_id AND NOT is_employer_blocked_by_approval())
--
-- and is_employer_blocked_by_approval() is
--
--   EXISTS (SELECT 1 FROM employer_profiles
--           WHERE user_id = auth.uid()
--             AND approval_status IN ('pending','rejected','waitlisted'))
--
-- That function was written to BE the employer gate and is not one. It blocks
-- you only if you HAVE an employer profile in a bad state. Anyone with NO
-- employer profile at all — every candidate, every team member — matches no
-- row, EXISTS is false, NOT false is true, and they pass. IT FAILS OPEN FOR
-- EXACTLY THE PEOPLE IT APPEARS TO EXCLUDE.
--
-- So `auth.uid() = employer_id` was doing all the work, and that only means
-- "you may post a job as yourself" — safe only if holding an account implied
-- being an approved employer. It does not: candidates hold accounts.
--
-- Proven before this migration by attempting an insert from a real candidate
-- session carrying employer_id = their own uid, with no other columns. It
-- returned 23502 (null value in column "title"), NOT 42501. A not-null
-- violation means the row passed the policy and was stopped by a column
-- constraint; an RLS refusal would have been 42501 and no constraint would
-- ever have been reached. Nothing was created — the transaction aborts either
-- way, which is what made the probe safe.
--
-- The same self-owned-row shape is CORRECT on candidate_profiles,
-- employer_profiles and job_applications, where the row genuinely is the
-- user's own record. A job advert is public content on the board, not a
-- personal record. That is why the identical pattern is right there and wrong
-- here.

-- WHY A NEW FUNCTION RATHER THAN EDITING THE OLD ONE. Other policies call
-- is_employer_blocked_by_approval() and its "am I blocked" meaning is correct
-- for them. What was missing is the positive question, so that is what this
-- adds. The old function is left exactly as it is.
create or replace function public.is_active_employer()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.employer_profiles
    where user_id = auth.uid()
      and (approval_status is null
           or approval_status not in ('pending', 'rejected', 'waitlisted'))
  );
$$;

comment on function public.is_active_employer() is
  'True when the caller HAS an employer profile that is not pending/rejected/waitlisted. '
  'The positive counterpart to is_employer_blocked_by_approval(), which returns false for '
  'someone with no employer profile at all and therefore cannot gate anything on its own.';

-- NULL approval_status STAYS ALLOWED, deliberately. There are zero nulls today
-- (8 approved, 1 pending), but lib/authCallback settles approval_status with a
-- guarded update that only fires while it is still NULL, so a brand-new
-- employer legitimately sits at NULL for a moment. Requiring 'approved' here
-- would refuse them during their own signup.
drop policy if exists "Employers insert own jobs" on public.jobs;

create policy "Employers insert own jobs"
  on public.jobs
  for insert
  to authenticated
  with check (
    auth.uid() = employer_id
    and public.is_active_employer()
  );

-- NOT TOUCHED, and both matter:
--
--   "members insert jobs (manage_jobs)" — a team member inserts with
--   employer_id = the OWNER's id, and is authorised by
--   has_employer_permission(employer_id,'manage_jobs') rather than by owning
--   the row. That policy is what keeps members working after this change, and
--   it only matches once /post-job sends the OWNER's id instead of the
--   session user's — which is the code half of this branch. The two must ship
--   together or manage_jobs members lose the ability to post.
--
--   The UPDATE policies — "Employers update own jobs" is
--   USING auth.uid() = employer_id, which never had this hole: nobody could
--   edit another employer's row.
--
-- Checked against live rows before applying: all four accounts that own jobs
-- (250 / 34 / 4 / 2, every row in the table) have an employer profile and are
-- 'approved', so nobody who can post today loses the ability. The one
-- 'pending' employer stays blocked, as it already was.
