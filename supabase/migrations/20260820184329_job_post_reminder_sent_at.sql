-- When we last reminded this advert's employer that it is still running.
-- NULL means never. Nullable and unindexed on purpose: the reminder query is a
-- daily scan over a few hundred active rows, not a hot path, and an index here
-- would cost more to maintain than it saves.
alter table jobs add column if not exists last_reminder_sent_at timestamptz;

comment on column jobs.last_reminder_sent_at is
  'Last time a "is this advert still open?" reminder was emailed to the employer. NULL = never. Written only by /api/cron/job-post-reminders in send mode.';

notify pgrst, 'reload schema';
