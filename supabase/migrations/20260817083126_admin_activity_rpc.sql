-- WHEN AND WHERE, for /admin.
--
-- WHY A FUNCTION AND NOT A QUERY. The sign-in times live in auth.sessions,
-- and PostgREST only exposes `public` — so the admin route cannot select it
-- however privileged its key. This is the narrow, read-only door.
--
-- SECURITY DEFINER, then locked down: execute is REVOKED from public, anon and
-- authenticated and granted ONLY to service_role. That adds no privilege at
-- all — service_role already bypasses RLS — it simply means a signed-in user
-- who found the function name cannot call it. lib/admin.ts uses the service
-- role key in production, so this is the exact grant the caller needs and
-- nothing wider.
--
-- IT RETURNS NO PERSONAL DATA. Counts and two-letter country codes only: no
-- id, no email, no IP address. auth.sessions.ip is read by nothing here.

create or replace function public.admin_activity()
returns jsonb
language sql
security definer
set search_path = public, auth
stable
as $$
with cand as (
  select user_id from candidate_profiles
  where coalesce(is_test, false) = false
    and coalesce(is_house, false) = false
    and email not in ('pauldavies.gbr@gmail.com', 'paul@thrivecareer.co.uk')
    and email not like 'pauldavies.gbr+%'
),
-- A row in auth.sessions is written when a session STARTS, i.e. at sign-in.
-- Local time, per row, so BST and GMT are each handled correctly rather than
-- by a fixed offset.
s as (
  select se.created_at at time zone 'Europe/London' as t, se.user_id
  from auth.sessions se
  join cand c on c.user_id = se.user_id
)
select jsonb_build_object(
  'signins', jsonb_build_object(
    'total',           (select count(*) from s),
    'distinctPeople',  (select count(distinct user_id) from s),
    'first',           (select min(t)::date from s),
    'last',            (select max(t)::date from s),
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
    -- NULL is not a country. It means the row predates capture, and it is
    -- reported as its own number rather than folded into a total that would
    -- then understate every real one.
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
    'jobViewsUnknown', (select count(*) from job_views where country is null)
  )
);
$$;

revoke all on function public.admin_activity() from public;
revoke all on function public.admin_activity() from anon;
revoke all on function public.admin_activity() from authenticated;
grant execute on function public.admin_activity() to service_role;

comment on function public.admin_activity() is
  'Aggregate sign-in timing (Europe/London) and country counts for /admin. Counts only — no ids, emails or IPs. service_role only.';

notify pgrst, 'reload schema';
