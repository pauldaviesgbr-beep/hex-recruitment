-- WHEN WE WERE TOLD ABOUT A REPORT.
--
-- Found 16 Oct 2026: a report filed through ReportControl was inserted and then
-- reached nobody. No trigger, no email, no admin page reads content_reports, so
-- Apple's Guideline 1.2 promise (reports are acted on) had nothing behind it.
--
-- alerted_at is set when the alert email has gone to Thrive. The server claims a
-- report by setting it BEFORE sending and clears it again if the send fails, so
-- the immediate alert and the daily sweep can never both email one report.
-- Null means "nobody has been told yet".
alter table public.content_reports add column if not exists alerted_at timestamptz;

create index if not exists content_reports_unalerted_idx
  on public.content_reports (created_at) where alerted_at is null;

comment on column public.content_reports.alerted_at is
  'When the alert email about this report went to Thrive. Null = not yet told.';

notify pgrst, 'reload schema';
