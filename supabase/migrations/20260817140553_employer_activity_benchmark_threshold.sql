-- A BENCHMARK OF ONE IS NOT A BENCHMARK, IT IS A DISCLOSURE.
--
-- The previous version returned the median across all OTHER employers with no
-- floor on how many that was. Today it is exactly one — so "the platform
-- median is 1.7 hours" told the reader precisely what that single competitor's
-- median is. An aggregate over n=1 is just that one row wearing a hat.
--
-- Below the floor the benchmark is null and the page says there is not enough
-- to compare against. Three is the minimum where no single employer's figure
-- can be read off the median.

create or replace function public.employer_candidate_activity()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  me uuid := auth.uid();
  min_peers constant int := 3;
  peer_count int;
  result jsonb;
begin
  if me is null or not public.is_approved_employer() then
    return jsonb_build_object('error', 'not_an_approved_employer');
  end if;

  select count(distinct j.employer_id) into peer_count
  from job_applications a
  join jobs j on j.id = a.job_id
  where a.viewed_at is not null and a.applied_at is not null and j.employer_id <> me;

  with cand as (
    select user_id from candidate_profiles
    where coalesce(is_test, false) = false and coalesce(is_house, false) = false
  ),
  s as (
    select se.created_at at time zone 'Europe/London' as t, se.user_id
    from auth.sessions se join cand c on c.user_id = se.user_id
  ),
  -- viewed_at is stamped when the applicant LIST loads, not when a single
  -- application is read. The employer-facing copy says "opened", never "read".
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
    'platform', jsonb_build_object(
      -- Null below the floor. The page must render "not enough employers to
      -- compare yet" and never a zero.
      'medianHours', case when peer_count >= min_peers then
                       (select round(percentile_cont(0.5) within group (order by hours)::numeric, 1)
                        from lags where employer_id <> me)
                     else null end,
      'employers',   peer_count,
      'minPeers',    min_peers
    )
  ) into result;

  return result;
end $$;

revoke all on function public.employer_candidate_activity() from public, anon;
grant execute on function public.employer_candidate_activity() to authenticated;

notify pgrst, 'reload schema';
