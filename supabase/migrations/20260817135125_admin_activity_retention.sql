-- Adds a `retention` block to admin_activity(). Everything already returned
-- is unchanged.
--
-- THE NUMBER THAT MATTERS IS NOT DELETIONS. Nobody can delete their own
-- account — there is no self-serve path — so a departures count would read
-- zero and stay zero, and would look like "no drop-off" when the real
-- drop-off is enormous. `neverReturned` is the honest one: signed up,
-- confirmed, and never came back.
--
-- "Never returned" is last_sign_in_at within two minutes of created_at. Signing
-- up IS a sign-in, so the timestamps are equal-ish for someone who never came
-- back; the tolerance absorbs the gap between the auth row being written and
-- the session being minted.

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
s as (
  select se.created_at at time zone 'Europe/London' as t, se.user_id
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
    'jobViewsUnknown', (select count(*) from job_views where country is null)
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

revoke all on function public.admin_activity() from public, anon, authenticated;
grant execute on function public.admin_activity() to service_role;

notify pgrst, 'reload schema';
