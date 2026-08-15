-- ============================================================================
-- THE STATUS TRANSITION LOG
-- ============================================================================
-- job_applications.status carries only its CURRENT value, so every move
-- overwrites the one before it. Employer responsiveness is the number the
-- business case rests on and it was derived from a column with no memory.
--
-- WHY A TRIGGER AND NOT ROUTE CODE: sixteen files write that column and TWELVE
-- OF THEM ARE CLIENT-SIDE, through the browser client. There is no server
-- chokepoint to put a capture behind, so anything at application level would
-- be sixteen edits today and a silent gap the moment somebody adds a
-- seventeenth. A trigger sees every path and cannot be bypassed.
-- ============================================================================

create table if not exists public.application_status_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  -- NULL from_status means THE APPLICATION'S BIRTH, not "unknown". Recording
  -- the insert as an event is what makes this table SELF-CONTAINED: the whole
  -- journey reads from here alone, with no join to stage_entered_at or any
  -- other insert-time column that could later be repurposed.
  from_status    text,
  to_status      text not null,
  -- auth.uid(), and NULL MEANS NOT RECORDED — never "the system" and never a
  -- thing to infer from. It is null on the four service-role paths (admin
  -- routes, the simulator) because those carry no user JWT. Anything that
  -- renders this must say "not recorded" rather than leaving a blank.
  actor_id       uuid,
  occurred_at    timestamptz not null default now()
);

create index if not exists application_status_events_application_id_idx
  on public.application_status_events (application_id, occurred_at);

-- CLOSED, like email_log and push_log: RLS on, ZERO policies. That denies
-- every role RLS applies to and leaves the service role as the only reader.
-- Nothing candidate-side or employer-side reads this.
alter table public.application_status_events enable row level security;

comment on table public.application_status_events is
  'One row per job_applications.status change, plus one for the row''s birth. Written by a trigger; service-role only. NULL from_status = birth. NULL actor_id = not recorded (service-role path).';

-- ============================================================================
-- THE FUNCTION — AND THE ONE WAY THIS WORK COULD DO HARM
-- ============================================================================
-- A TRIGGER THAT ERRORS ROLLS BACK THE WHOLE UPDATE. If this insert fails, the
-- employer's status change fails with it and the pipeline breaks in production
-- for everyone.
--
-- TWO INDEPENDENT REASONS IT CANNOT:
--
--   1. SECURITY DEFINER. Twelve of the sixteen write paths run as the CLIENT
--      role. This table has RLS enabled and no policies, so a client-role
--      insert would be REFUSED — and a refusal inside a trigger is an
--      exception, which aborts the employer's UPDATE. Running the function as
--      its owner means the insert is not subject to that policy check at all.
--      Without SECURITY DEFINER this trigger would break every client-side
--      status change in the product on its first click.
--
--   2. AN EXCEPTION BLOCK. Belt and braces for everything else — a constraint,
--      a disk error, a future column change. Instrumentation must never take
--      down the thing it measures, which is the same rule the push dispatcher
--      and the email log already follow. If the log cannot be written we lose
--      a row; we do not lose the employer's action.
--
-- search_path is pinned because a SECURITY DEFINER function without one is
-- resolvable against a caller-controlled schema.
-- ============================================================================

create or replace function public.log_application_status_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.application_status_events (application_id, from_status, to_status, actor_id)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status else null end,
      new.status,
      auth.uid()
    );
  exception when others then
    -- Swallow deliberately. See the header: losing a log row is acceptable,
    -- breaking a real employer's click is not.
    raise warning 'application_status_events insert failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- ============================================================================
-- THE TRIGGERS
-- ============================================================================
-- GATED IN THE WHEN CLAUSE, not with an IF inside the body. A body-level check
-- is the kind of thing a later tidy-up simplifies away without noticing that
-- the gate was the point.

drop trigger if exists job_applications_status_event_ins on public.job_applications;
create trigger job_applications_status_event_ins
  after insert on public.job_applications
  for each row
  execute function public.log_application_status_event();

drop trigger if exists job_applications_status_event_upd on public.job_applications;
create trigger job_applications_status_event_upd
  after update on public.job_applications
  for each row
  when (old.status is distinct from new.status)
  execute function public.log_application_status_event();

-- NO BACKFILL, DELIBERATELY. The three status_updated_at values are the
-- timestamp of a last move with no from-status attached; inventing an origin
-- would put fiction in the one table built to be trustworthy. This log starts
-- the day it starts, and whatever renders it must say so.;
