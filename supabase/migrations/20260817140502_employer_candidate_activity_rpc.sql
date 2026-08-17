-- WHEN CANDIDATES ARE ACTIVE, for employers — plus how fast THIS employer
-- opens applications against the platform.
--
-- NO PARAMETER, ON PURPOSE. It reads auth.uid(), so an employer cannot ask
-- about another employer by passing an id. The only per-employer figures it
-- can ever return are the caller's own.
--
-- IT REFUSES ANYONE WHO IS NOT AN APPROVED EMPLOYER, reusing the same
-- is_approved_employer() that guards the candidate profiles. A candidate
-- calling this gets nothing.
--
-- AGGREGATE ONLY ON THE CANDIDATE SIDE. Counts per time band across the whole
-- candidate base — never a person, never an id, never a country tied to
-- anyone. An employer must not be able to learn that a named candidate browses
-- at 2am.

create or replace function public.employer_candidate_activity()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null or not public.is_approved_employer() then
    return jsonb_build_object('error', 'not_an_approved_employer');
  end if;

  with cand as (
    select user_id from candidate_profiles
    where coalesce(is_test, false) = false and coalesce(is_house, false) = false
  ),
  -- A row in auth.sessions is written when a session STARTS, i.e. at sign-in.
  -- Europe/London per row, so BST and GMT are each handled: the question is
  -- when the CANDIDATE was awake, and this board is UK-only.
  s as (
    select se.created_at at time zone 'Europe/London' as t, se.user_id
    from auth.sessions se join cand c on c.user_id = se.user_id
  ),
  -- Every real application, with how long it took the employer to open the
  -- list. viewed_at is stamped when the applicant LIST loads, not when one
  -- application is read — the admin route is explicit about that and the
  -- employer-facing copy must not quietly upgrade it to "read".
  lags as (
    select j.employer_id,
           (extract(epoch from (a.viewed_at - a.applied_at)) / 3600.0) as hours
    from job_applications a
    join jobs j on j.id = a.job_id
    join cand c on c.user_id = a.candidate_id
    where a.viewed_at is not null and a.applied_at is not null
  )
  select jsonb_build_object(
    'candidateActivity', jsonb_build_object(
      'total',          (select count(*) from s),
      'distinctPeople', (select count(distinct user_id) from s),
      'byBand', coalesce((
        select jsonb_agg(x order by x->>'band')
        from (
          select jsonb_build_object('band', band, 'n', count(*)) as x
          from (
            select case
              when extract(hour from t) between 0 and 5   then '00:00-05:59'
              when extract(hour from t) between 6 and 8   then '06:00-08:59'
              when extract(hour from t) between 9 and 11  then '09:00-11:59'
              when extract(hour from t) between 12 and 14 then '12:00-14:59'
              when extract(hour from t) between 15 and 17 then '15:00-17:59'
              when extract(hour from t) between 18 and 20 then '18:00-20:59'
              else '21:00-23:59' end as band
            from s
          ) b group by band
        ) y
      ), '[]'::jsonb)
    ),
    'yourResponse', jsonb_build_object(
      'applications', (select count(*) from job_applications a
                        join jobs j on j.id = a.job_id
                        where j.employer_id = me),
      'opened',       (select count(*) from lags where employer_id = me),
      'medianHours',  (select round(percentile_cont(0.5) within group (order by hours)::numeric, 1)
                        from lags where employer_id = me)
    ),
    -- The benchmark is every OTHER employer pooled, so it is a comparison
    -- rather than a number that includes the reader and drags toward itself.
    -- Null when there is nobody to compare against, which the page must show
    -- as "no benchmark yet" and not as zero.
    'platform', jsonb_build_object(
      'medianHours', (select round(percentile_cont(0.5) within group (order by hours)::numeric, 1)
                       from lags where employer_id <> me),
      'employers',   (select count(distinct employer_id) from lags where employer_id <> me)
    )
  ) into result;

  return result;
end $$;

revoke all on function public.employer_candidate_activity() from public, anon;
grant execute on function public.employer_candidate_activity() to authenticated;

comment on function public.employer_candidate_activity() is
  'Aggregate candidate sign-in timing plus the CALLING employer''s own response speed against a benchmark of other employers. Keyed on auth.uid(); refuses non-approved employers. No candidate is identifiable.';

notify pgrst, 'reload schema';
