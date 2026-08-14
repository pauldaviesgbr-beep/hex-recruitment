-- Applied AFTER feat/notifications-authorised-route was live on production
-- (deploy b3ba91e READY, route answering) — the browser no longer inserts
-- notifications, so the client INSERT path closes with nothing to break.
-- From here the only writer is the service role: API routes, crons, the
-- simulator, and /api/notifications/notify, which authorises every event.

-- The 13 Aug stopgap: any signed-in user could create a notification for
-- ANY user with ANY text. Its job is done.
drop policy "notifications: only a signed-in user may create one" on public.notifications;

-- The duplicate policy pairs on the same table (identical qual, both
-- redundant), tidied in the same pass; one of each survives.
drop policy "Users see own notifications" on public.notifications;
drop policy "Users update own notifications" on public.notifications;
