-- WHO LEFT, AND WHY.
--
-- Nothing recorded a departure. The unconfirmed reaper deletes accounts and
-- writes only a count into its HTTP response, which Vercel drops within a day
-- — so every account lost so far is gone without trace and cannot be
-- recovered or counted. This table is the trace, and like the country capture
-- it FILLS FORWARD ONLY.
--
-- IT DELIBERATELY KEEPS NO PERSONAL DATA BEYOND THE EMAIL DOMAIN. The point
-- is to count drop-offs and see their shape, not to retain people who have
-- gone: a departure row must not become a way of keeping someone's details
-- after their account was removed. The local-part is dropped on write.

create table if not exists public.user_departures (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  -- Domain only: 'gmail.com', never 'someone@gmail.com'.
  email_domain text,
  role         text,
  -- 'unconfirmed_reap' | 'admin' | 'self_serve'. Free text rather than an
  -- enum so a new path can log itself without a migration.
  reason       text not null,
  joined_at    timestamptz,
  departed_at  timestamptz not null default now(),
  -- How long they had an account. Stored rather than derived so it survives
  -- even if joined_at is unknown.
  days_held    integer
);

create index if not exists user_departures_departed_at_idx on public.user_departures (departed_at desc);
create index if not exists user_departures_reason_idx on public.user_departures (reason);

comment on table public.user_departures is
  'One row per account removed, from any path. Fills forward from 17 Aug 2026; everything lost before that is unrecorded. Email domain only, never the full address.';

-- Service role only. Nothing client-side reads or writes this.
alter table public.user_departures enable row level security;
revoke all on public.user_departures from anon, authenticated;

notify pgrst, 'reload schema';
