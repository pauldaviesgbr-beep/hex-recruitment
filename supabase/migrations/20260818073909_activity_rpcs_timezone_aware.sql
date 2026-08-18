-- TWO CHARTS THAT LOOKED IDENTICAL ASK DIFFERENT QUESTIONS, AND ONLY ONE OF
-- THEM WANTS UK TIME.
--
-- Both admin_activity() and employer_candidate_activity() bucketed sign-ins
-- with `at time zone 'Europe/London'`. That is correct only while everyone is
-- in the UK, and it is wrong in opposite ways for the two audiences:
--
--   ADMIN asks "when are candidates active" — a question about behaviour.
--   The answer must be in EACH CANDIDATE'S OWN time, or a Sydney candidate
--   browsing after their dinner service lands in the 03:00 bucket and the
--   pattern that actually exists is smeared into noise. This is the question
--   behind "which platforms and which times reach the demographic we want",
--   so it has to survive the move to AU/US/AE.
--
--   AN EMPLOYER asks "when should I post" — a question about their own diary.
--   The answer must be in THEIR time. Converting to candidate-local here
--   would produce a chart they cannot act on: "candidates are busiest at
--   19:00 local" tells a London employer nothing about when to press publish.
--
-- So admin converts per candidate and the employer panel converts once, into
-- the viewer's zone, and each says which it did.
--
-- AN UNKNOWN ZONE MUST NOT TAKE THE PAGE DOWN. `at time zone 'Foo/Bar'`
-- raises, which would kill the whole RPC and blank a dashboard over one bad
-- row. The client validates the shape, but a shape-valid name Postgres has
-- never heard of would still pass. So the zone is resolved by LEFT JOIN to
-- pg_timezone_names: unknown and null both arrive as null, both fall back,
-- and neither can throw.
--
-- AND THE FALLBACK IS COUNTED AND RETURNED. Every row today is a fallback —
-- capture starts now, so 67 existing sign-ins have no zone. A chart that is
-- entirely Europe/London default must not be readable as a global finding,
-- so the payload carries `tzKnown` / `tzFallback` and the UI states it.

create or replace function public.admin_activity()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
with cand as (
  -- tz is null when we never captured one OR when Postgres does not recognise
  -- what we captured. Both mean "fall back", and the LEFT JOIN is what makes
  -- the second case a fallback rather than an exception.
  select cp.user_id, tzn.name as tz
  from candidate_profiles cp
  left join pg_timezone_names tzn on tzn.name = cp.signup_timezone
  where coalesce(cp.is_test, false) = false
    and coalesce(cp.is_house, false) = false
    and cp.email not in ('pauldavies.gbr@gmail.com', 'paul@thrivecareer.co.uk')
    and cp.email not like 'pauldavies.gbr+%'
),
s as (
  select se.created_at at time zone coalesce(c.tz, 'Europe/London') as t,
         se.user_id,
         c.tz is not null as tz_known
  from auth.sessions se
  join cand c on c.user_id = se.user_id
),
u as (
  select au.id, au.created_at, au.last_sign_in_at, au.email_confirmed_at
  from auth.users au
  join cand c on c.user_id = au.id
)
select jsonb_build_object(
  'signins', jsonb_build_object(
    'total',           (select count(*) from s),
    'distinctPeople',  (select count(distinct user_id) from s),
    'first',           (select min(t)::date from s),
    'last',            (select max(t)::date from s),
    -- WHAT THE CLOCK ON THE CHART MEANS. Local to each candidate where we
    -- know it, Europe/London where we do not. Named so the page can say so.
    'basis',           'candidate-local',
    'tzKnown',         (select count(*) from s where tz_known),
    'tzFallback',      (select count(*) from s where not tz_known),
    'tzFallbackZone',  'Europe/London',
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('zone', tz, 'n', n) order by n desc, tz)
      from (
        select c.tz, count(*) as n
        from auth.sessions se join cand c on c.user_id = se.user_id
        where c.tz is not null group by 1
      ) z
    ), '[]'::jsonb),
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
    ), '[]'::jsonb),
    'byHour', coalesce((
      select jsonb_agg(jsonb_build_object('hour', hr, 'n', n) order by hr)
      from (select extract(hour from t)::int as hr, count(*) as n from s group by 1) h
    ), '[]'::jsonb),
    'byDow', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dw, 'label', lbl, 'n', n) order by dw)
      from (
        select extract(isodow from t)::int as dw, to_char(t, 'Dy') as lbl, count(*) as n
        from s group by 1, 2
      ) d
    ), '[]'::jsonb)
  ),
  'countries', jsonb_build_object(
    'candidateSignups', coalesce((
      select jsonb_agg(jsonb_build_object('country', country, 'n', n) order by n desc, country)
      from (
        select signup_country as country, count(*) as n
        from candidate_profiles
        where signup_country is not null
          and coalesce(is_test,false) = false and coalesce(is_house,false) = false
        group by 1
      ) c
    ), '[]'::jsonb),
    'candidatesUnknown', (
      select count(*) from candidate_profiles
      where signup_country is null
        and coalesce(is_test,false) = false and coalesce(is_house,false) = false
    ),
    'jobViews', coalesce((
      select jsonb_agg(jsonb_build_object('country', country, 'n', n) order by n desc, country)
      from (select country, count(*) as n from job_views where country is not null group by 1) v
    ), '[]'::jsonb),
    'jobViewsUnknown', (select count(*) from job_views where country is null),
    -- WHERE THE WORK IS, against where the people are. Without this the
    -- country chart cannot answer the question it exists for: an applicant
    -- from a country we have no jobs in will never be placed, however many
    -- of them a channel delivers.
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object('country', country, 'n', n) order by n desc, country)
      from (
        select country, count(*) as n from jobs
        where country is not null and status = 'active' group by 1
      ) jc
    ), '[]'::jsonb),
    'jobsUnknown', (select count(*) from jobs where country is null and status = 'active')
  ),
  'retention', jsonb_build_object(
    'accounts',       (select count(*) from u),
    'neverConfirmed', (select count(*) from u where email_confirmed_at is null),
    'neverReturned',  (select count(*) from u
                       where email_confirmed_at is not null
                         and last_sign_in_at is not null
                         and last_sign_in_at <= created_at + interval '2 minutes'),
    'returned',       (select count(*) from u
                       where last_sign_in_at is not null
                         and last_sign_in_at > created_at + interval '2 minutes'),
    'hidden',         (select count(*) from candidate_profiles
                       where is_discoverable = false
                         and coalesce(is_test,false) = false and coalesce(is_house,false) = false),
    -- Fills forward from 17 Aug 2026. Zero here means "none recorded", NOT
    -- "nobody has ever left" — everything before the log existed is unknown.
    'departures',     (select count(*) from user_departures),
    'departuresByReason', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'n', n) order by n desc)
      from (select reason, count(*) as n from user_departures group by 1) dr
    ), '[]'::jsonb),
    'departuresFrom', '2026-08-17'
  )
);
$$;

create or replace function public.employer_candidate_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  min_peers constant int := 3;
  peer_count int;
  my_tz text;
  result jsonb;
begin
  if me is null or not public.is_approved_employer() then
    return jsonb_build_object('error', 'not_an_approved_employer');
  end if;

  -- THE VIEWER'S OWN CLOCK, because the only thing they can do with this
  -- chart is decide when to press publish. Resolved through pg_timezone_names
  -- for the same reason as above: an unrecognised name must fall back, not
  -- raise. Every employer is null today, so every employer sees UK time —
  -- and the panel is told which zone it got rather than hard-coding "UK".
  select coalesce(tzn.name, 'Europe/London') into my_tz
  from employer_profiles ep
  left join pg_timezone_names tzn on tzn.name = ep.signup_timezone
  where ep.user_id = me;
  my_tz := coalesce(my_tz, 'Europe/London');

  select count(distinct j.employer_id) into peer_count
  from job_applications a
  join jobs j on j.id = a.job_id
  where a.viewed_at is not null and a.applied_at is not null and j.employer_id <> me;

  with cand as (
    select user_id from candidate_profiles
    where coalesce(is_test, false) = false and coalesce(is_house, false) = false
  ),
  s as (
    select se.created_at at time zone my_tz as t, se.user_id
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
      'timezone',       my_tz,
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

grant execute on function public.admin_activity() to authenticated, service_role;
grant execute on function public.employer_candidate_activity() to authenticated;

notify pgrst, 'reload schema';
