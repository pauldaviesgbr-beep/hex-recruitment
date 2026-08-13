-- A PARTIAL UNIQUE INDEX CANNOT BE AN ON CONFLICT TARGET.
--
-- The previous migration created:
--   create unique index device_tokens_endpoint_key on device_tokens (endpoint)
--     where endpoint is not null;
--
-- The partial predicate was there to stop the many NULL endpoints on FCM rows
-- colliding. IT WAS UNNECESSARY — SQL treats NULLs as distinct in a unique
-- constraint, so a plain UNIQUE already permits unlimited NULLs — and it broke
-- registration outright: Postgres will not accept a partial index as an
-- ON CONFLICT target unless the statement repeats the same WHERE clause, which
-- PostgREST's `onConflict` cannot express.
--
-- Every browser that tried to register got:
--   SQLSTATE 42P10  there is no unique or exclusion constraint matching the
--                   ON CONFLICT specification
-- surfaced to the phone as a bare 500. Confirmed in the Vercel runtime log for
-- /api/push/register at 04:16 and 04:17 UTC on 13 Aug 2026, and reproduced
-- directly against the database with the same statement.
--
-- Replaced with a real UNIQUE CONSTRAINT, which ON CONFLICT can target and
-- which still allows every FCM row to hold a NULL endpoint.
drop index if exists public.device_tokens_endpoint_key;

alter table public.device_tokens
  drop constraint if exists device_tokens_endpoint_key;
alter table public.device_tokens
  add constraint device_tokens_endpoint_key unique (endpoint);

comment on constraint device_tokens_endpoint_key on public.device_tokens is
  'Identity of a web push subscription, as token is for FCM. A CONSTRAINT, not a partial index, because ON CONFLICT (endpoint) needs a targetable one — see the migration note. NULLs are distinct, so every FCM row can carry a NULL endpoint.';
