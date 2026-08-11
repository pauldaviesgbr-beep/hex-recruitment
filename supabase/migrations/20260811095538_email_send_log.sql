-- Record every email we attempt to send.
--
-- WHY THIS EXISTS. Three separate investigations on 11 August 2026 stopped at
-- the same wall:
--   • the activation cron sent nothing for four and a half months and nobody
--     could tell, because "no errors in the logs" and "nothing was attempted"
--     look identical;
--   • the weekly roundup sent something that morning and we could not say how
--     many or to whom;
--   • a bounce failed a workflow and we could not name the address.
-- All three are the same missing thing: nothing records what we send.
--
-- ATTEMPTS, NOT SUCCESSES. Every row is an attempt. A send that failed, or that
-- never left because Resend was unconfigured, is exactly the event we have been
-- unable to see — a table that only recorded successes would reproduce today's
-- blindness somewhere new. `success` distinguishes them.
--
-- NO UNIQUE CONSTRAINT, deliberately. The obvious one is (user_id, email_type),
-- and it is wrong here for three reasons:
--   1. Not every email is once-per-person. The roundup goes to the same
--      candidate every Tuesday; a unique key would refuse the second one.
--   2. An audit trail's job is to record what happened, INCLUDING a duplicate
--      send. Deduplicating in the log destroys the evidence of exactly the
--      fault we would most want to find.
--   3. A constraint can raise. This insert sits in the send path, and the
--      first rule of it is that it must never break a send. Adding something
--      that can throw works against that.
-- Idempotency, where it is wanted, belongs at the decision to send — the
-- activation cron's exact-day matching is already that — not in the record of
-- what was sent.
--
-- NO user_id COLUMN in this version. sendEmail receives an address, not a user,
-- and populating a user id only where a caller happened to have one would give
-- a column that is null for reasons nobody could later reconstruct. The
-- recipient address is the join key, and it is the thing every caller has.

create table if not exists public.email_log (
  id                    uuid primary key default gen_random_uuid(),
  recipient             text        not null,
  email_type            text        not null default 'unknown',
  subject               text,
  success               boolean     not null,
  provider_message_id   text,
  error                 text,
  created_at            timestamptz not null default now()
);

comment on table public.email_log is
  'One row per attempted send, written by lib/email.ts sendEmail(). Includes failures. Service-role only.';
comment on column public.email_log.provider_message_id is
  'Resend message id, so a row here can be matched to a row there without guessing.';
comment on column public.email_log.success is
  'False covers both a provider rejection and a send that never left (e.g. no API key).';

create index if not exists email_log_created_at_idx on public.email_log (created_at desc);
create index if not exists email_log_recipient_idx  on public.email_log (recipient);
create index if not exists email_log_type_time_idx  on public.email_log (email_type, created_at desc);

-- RLS FROM LINE ONE, AND NO POLICIES AT ALL.
--
-- This table holds every address we have ever mailed — candidates and
-- employers both. Enabling RLS with zero policies denies every role that RLS
-- applies to; the service role bypasses RLS entirely and is the only thing
-- that can read or write it. That is the intended posture, and it is stricter
-- than any policy I could write: there is no policy to get wrong later.
--
-- If a human-readable view is ever wanted (an admin screen), it should go
-- through a server route holding the service role — not by loosening this.
alter table public.email_log enable row level security;
