-- A DELETION REQUEST HAS TO EXIST AS A ROW, WHETHER OR NOT AN EMAIL SENDS.
--
-- The screen this serves used to show "request submitted" and do nothing at
-- all: zero network requests, no record, no email. The person was told a
-- confirmation would arrive within 48 hours and nothing ever came. So the row
-- is the primary artefact here and the email is the notification — if Resend
-- is down, the request still exists and is still findable.
--
-- THIS TABLE DELETES NOTHING. It is the doorbell, not the door. Erasure is a
-- separate, deliberate, human-approved script.
create table if not exists public.deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  role          text,
  requested_at  timestamptz not null default now(),
  -- open -> the person is waiting. actioned -> a human has dealt with it.
  -- cancelled -> they changed their mind (no UI for this yet; the column
  -- exists so cancelling never means deleting the evidence of the request).
  status        text not null default 'open'
                check (status in ('open', 'actioned', 'cancelled')),
  actioned_at   timestamptz,
  actioned_by   text,
  note          text
);

-- ONE OPEN REQUEST PER PERSON. Without this, a candidate who clicks twice
-- because nothing visibly happened the first time creates two rows, and the
-- "do you have one outstanding" check becomes ambiguous. Clicking again while
-- one is open is a no-op, not a second request.
create unique index if not exists deletion_requests_one_open_per_user
  on public.deletion_requests (user_id) where status = 'open';

create index if not exists deletion_requests_status_requested_at
  on public.deletion_requests (status, requested_at desc);

alter table public.deletion_requests enable row level security;

-- A person may raise their own request and see their own request. That second
-- half is not a nicety: the screen has to be able to say "you asked us on the
-- 24th and we have it", or they are left guessing exactly as before.
create policy "deletion_requests: insert your own"
  on public.deletion_requests for insert to authenticated
  with check (user_id = auth.uid());

create policy "deletion_requests: read your own"
  on public.deletion_requests for select to authenticated
  using (user_id = auth.uid());

-- NO UPDATE OR DELETE POLICY FOR authenticated, deliberately. Only the service
-- role closes a request. A person being able to edit or remove the record of
-- their own erasure request is precisely the audit trail we would want to keep.

comment on table public.deletion_requests is
  'UK GDPR erasure requests raised from /settings/privacy. Records and notifies; deletes nothing.';
