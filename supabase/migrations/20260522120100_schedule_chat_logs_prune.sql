-- Schedules the 90-day prune of public.chat_logs via pg_cron.
-- Split from the table-creation migration so a permission error here
-- (CREATE EXTENSION or cron.schedule on managed Supabase can require
-- superuser on some plans) doesn't take the table with it.
--
-- If this migration fails on a "permission denied" or "must be
-- superuser" error: schedule manually via the Supabase dashboard
-- (Database → Cron Jobs → New Cron Job, name 'prune-chat-logs-daily',
-- schedule '0 3 * * *', SQL: SELECT public.prune_chat_logs();).

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule any prior copy under the same name so re-running is safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-chat-logs-daily') THEN
    PERFORM cron.unschedule('prune-chat-logs-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'prune-chat-logs-daily',
  '0 3 * * *',
  $$SELECT public.prune_chat_logs();$$
);
