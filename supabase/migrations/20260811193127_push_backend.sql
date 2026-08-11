-- Push notifications, phase 1: the database half.
--
-- THE ARCHITECTURAL DECISION, from the phase-0 audit: hook the DATABASE, not
-- the app code. 21 of 29 notification inserts are CLIENT-SIDE, including
-- new_application — 36 of 50 live rows — written by the candidate's own browser
-- at app/jobs/page.tsx:754. A hook in server code would miss two thirds of the
-- call sites and the single event employers care about most. One trigger on
-- INSERT INTO public.notifications covers all 29 and every future one, with no
-- change to any call site.

-- pg_net gives Postgres an async HTTP client, so the trigger can call the
-- dispatcher without blocking the insert that fired it.
create extension if not exists pg_net with schema extensions;

-- ── device_tokens ─────────────────────────────────────────────────────────
--
-- A push token identifies a specific handset belonging to a specific person.
-- It is at least as sensitive as an email address: anyone holding one can send
-- that person a notification, and the set of them reveals how many devices they
-- use and when they last opened the app.
--
-- SO THE POLICY IS DELIBERATELY NARROWER THAN email_log's. email_log is service
-- role only, because nothing in the product needs to read it. This table is
-- different: the app itself must register and revoke tokens as the user signs
-- in and out, so the OWNER needs to write and delete their own rows. Nobody
-- needs to READ them but the dispatcher, which runs as service role.
create table if not exists public.device_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  token         text not null,
  platform      text not null check (platform in ('android', 'ios', 'web')),
  -- Set when a provider tells us the token is dead. Kept rather than deleted so
  -- "this person has no working device" and "this person never registered" stay
  -- distinguishable — the same reason push_log records failures.
  revoked_at    timestamptz,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  -- THE SAME DEVICE RE-REGISTERING IS THE NORMAL CASE, not an error. FCM
  -- reissues a token on reinstall, restore and periodically on its own, and the
  -- app registers on every launch. Unique on the token itself so a repeat
  -- registration is an upsert that refreshes last_seen_at rather than a
  -- duplicate row that would send the same person the same push twice.
  constraint device_tokens_token_key unique (token)
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id) where revoked_at is null;

comment on table public.device_tokens is
  'One row per registered device. Owner may manage their own; only the service role reads them.';
comment on column public.device_tokens.revoked_at is
  'Set when the provider reports the token dead. Kept, not deleted, so "no working device" and "never registered" stay distinguishable.';

alter table public.device_tokens enable row level security;

-- The owner may see and manage their own devices — needed for register,
-- unregister and a future "signed-in devices" screen. Scoped to auth.uid() in
-- both USING and WITH CHECK so a token cannot be written against someone else.
create policy "own device tokens: select" on public.device_tokens
  for select to authenticated using (auth.uid() = user_id);
create policy "own device tokens: insert" on public.device_tokens
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own device tokens: update" on public.device_tokens
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own device tokens: delete" on public.device_tokens
  for delete to authenticated using (auth.uid() = user_id);

-- ── push_log ──────────────────────────────────────────────────────────────
--
-- Deliberately the same shape as public.email_log, and for the same reasons —
-- one convention, not two. Every ATTEMPT, successes and failures both, because
-- a table recording only successes reproduces today's blindness somewhere new.
create table if not exists public.push_log (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid,
  notification_id       uuid,
  notification_type     text        not null default 'unknown',
  title                 text,
  success               boolean     not null,
  -- 'sent' | 'no_tokens' | 'opted_out' | 'provider_error' | 'no_credentials'
  outcome               text        not null,
  provider_message_id   text,
  error                 text,
  created_at            timestamptz not null default now()
);

comment on table public.push_log is
  'One row per dispatch attempt, written by /api/push/dispatch. Includes failures and skips. Service-role only.';
comment on column public.push_log.outcome is
  'Why nothing was sent, when nothing was: no_tokens, opted_out, no_credentials — so a zero is readable rather than ambiguous.';

create index if not exists push_log_created_at_idx on public.push_log (created_at desc);
create index if not exists push_log_user_idx       on public.push_log (user_id);
create index if not exists push_log_outcome_idx    on public.push_log (outcome, created_at desc);

-- No policies at all: service role only, exactly as email_log.
alter table public.push_log enable row level security;

-- ── the counter ───────────────────────────────────────────────────────────
--
-- THE POINT OF THIS TABLE. "The hook never fired" and "the hook fired and the
-- dispatcher failed" look identical in an empty push_log — which is precisely
-- how the activation cron hid for four and a half months. The trigger bumps
-- this on every fire, before the HTTP call and regardless of its outcome, so
-- the two states are distinguishable by subtraction.
create table if not exists public.push_dispatch_stats (
  id             boolean primary key default true check (id),
  hook_fires     bigint      not null default 0,
  last_fired_at  timestamptz
);
insert into public.push_dispatch_stats (id) values (true) on conflict (id) do nothing;
alter table public.push_dispatch_stats enable row level security;

comment on table public.push_dispatch_stats is
  'Single row. hook_fires increments on every trigger fire, so "hook never fired" and "hook fired, dispatch failed" are distinguishable when push_log is empty.';

-- ── the heartbeat ─────────────────────────────────────────────────────────
--
-- A receipt line every day, INCLUDING ON A ZERO DAY. A quiet day and a dead
-- hook must not look the same — that is the lesson from the flip cron, which is
-- the one thing that was visible today when three other things were not.
create table if not exists public.push_heartbeat (
  id                    uuid primary key default gen_random_uuid(),
  ran_at                timestamptz not null default now(),
  notifications_24h     bigint not null,
  hook_fires_24h        bigint not null,
  dispatch_attempts_24h bigint not null,
  consistent            boolean not null,
  note                  text not null
);
alter table public.push_heartbeat enable row level security;

comment on table public.push_heartbeat is
  'One row per day from pg_cron, written even when every count is zero. A silent hook shows as notifications > 0 with hook_fires 0.';

-- ── the trigger ───────────────────────────────────────────────────────────
--
-- Reads BOTH the dispatcher URL and the shared secret from Supabase Vault
-- rather than hard-coding them. The secret must never appear in a migration
-- file, because a migration file is committed and its ledger row is readable.
create or replace function public.dispatch_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Count the fire FIRST, unconditionally. If the HTTP call below fails, or
  -- the secret is missing, we still know the hook ran — which is the whole
  -- reason this counter exists.
  update public.push_dispatch_stats
     set hook_fires = hook_fires + 1, last_fired_at = now()
   where id = true;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'push_dispatch_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_dispatch_secret' limit 1;

  -- No destination configured is not an error worth failing an insert over.
  -- The notification is the source of truth; push is a copy. A person must
  -- still get their in-app bell even if push is entirely broken.
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-dispatch-secret', v_secret),
    body    := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  -- NEVER BREAK THE INSERT. A notification that fails to create because push
  -- was misconfigured would be a far worse bug than a push that never arrives.
  raise warning 'dispatch_push_for_notification failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notifications_dispatch_push on public.notifications;
create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row
  execute function public.dispatch_push_for_notification();

-- ── the daily receipt ─────────────────────────────────────────────────────
create or replace function public.push_heartbeat_run()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n_notifs   bigint;
  n_attempts bigint;
  n_fires    bigint;
  ok         boolean;
begin
  select count(*) into n_notifs
    from public.notifications where created_at > now() - interval '24 hours';
  select count(*) into n_attempts
    from public.push_log where created_at > now() - interval '24 hours';
  select count(*) into n_fires
    from public.push_heartbeat where ran_at > now() - interval '48 hours';

  -- hook_fires is cumulative, so the 24h figure is the delta since the last
  -- heartbeat. On the first run there is nothing to subtract from.
  select coalesce(
           (select s.hook_fires
              - coalesce((select h.hook_fires_24h from public.push_heartbeat h
                           order by h.ran_at desc limit 1), 0), 0)
         , 0)
    into n_fires
    from public.push_dispatch_stats s where s.id = true;

  ok := (n_notifs = 0 and n_attempts = 0) or (n_notifs > 0 and n_attempts > 0);

  insert into public.push_heartbeat
    (notifications_24h, hook_fires_24h, dispatch_attempts_24h, consistent, note)
  values (
    n_notifs, greatest(n_fires, 0), n_attempts, ok,
    case
      when n_notifs = 0 and n_attempts = 0 then 'quiet day — 0 notifications, 0 dispatch attempts, consistent'
      when n_notifs > 0 and n_attempts = 0 then 'ALARM: notifications were created and NOTHING was dispatched'
      when n_notifs = 0 and n_attempts > 0 then 'odd: dispatches without notifications in the same window'
      else 'ok — notifications created and dispatches attempted'
    end
  );
end;
$$;

-- 07:00 UTC, before the working day, so a broken hook is visible the morning
-- after rather than a week later.
select cron.schedule('push-heartbeat', '0 7 * * *', $$select public.push_heartbeat_run()$$);
