-- Branch 2 of design 25 (the Applicants list), approved 15 Nov 2026.
-- "Not a fit" sends its polite update FROM THE SERVER, only after the
-- 6-second Undo has run out (decision 5). These two columns are how the
-- server knows an update is owed and that it has been sent, so it is
-- never sent twice and never after Undo.
alter table public.job_applications
  add column if not exists decline_notice_due_at  timestamptz,
  add column if not exists decline_notice_sent_at timestamptz;

comment on column public.job_applications.decline_notice_due_at is
  'When the "Not a fit" polite update may be sent: now()+6s on Not a fit, cleared by Undo. Null = nothing owed.';
comment on column public.job_applications.decline_notice_sent_at is
  'When the polite update was sent (email, message, bell). Set once; a second send is skipped.';

create index if not exists job_applications_decline_notice_owed_idx
  on public.job_applications (decline_notice_due_at)
  where decline_notice_due_at is not null and decline_notice_sent_at is null;

-- Settings: "Check rejection messages before they send" (decision 5).
alter table public.employer_profiles
  add column if not exists review_rejection_messages boolean not null default false;

comment on column public.employer_profiles.review_rejection_messages is
  'Settings: "Check rejection messages before they send". Off by default; on, Not a fit opens the message for editing first.';
