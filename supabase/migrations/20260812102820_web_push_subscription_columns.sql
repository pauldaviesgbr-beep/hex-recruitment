-- Web Push (RFC 8291) subscriptions alongside FCM device tokens.
--
-- A browser subscription is NOT one string. It is an endpoint URL plus two
-- keys: p256dh (the client's public key) and auth (a shared secret). Packing
-- those into the existing `token` column as JSON would put three values in a
-- field that currently holds one real value — it reads fine and rots later, so
-- they get their own columns.
--
-- `token` KEEPS ITS MEANING: an FCM registration token for the native path that
-- phase 1 already proved end to end. It only becomes NULLABLE, because a web
-- push row genuinely has no FCM token. The CHECK below is what stops that
-- nullability turning into rows that are neither one thing nor the other.
alter table public.device_tokens
  add column if not exists endpoint text,
  add column if not exists p256dh   text,
  add column if not exists auth     text;

alter table public.device_tokens alter column token drop not null;

-- Exactly one transport per row, and it must be complete.
--   FCM      -> token present, no subscription fields
--   WebPush  -> endpoint + p256dh + auth all present, no token
-- A half-populated web push row cannot be inserted, so the sender never has to
-- defend against one.
alter table public.device_tokens
  drop constraint if exists device_tokens_one_transport;
alter table public.device_tokens
  add constraint device_tokens_one_transport check (
    (token is not null
       and endpoint is null and p256dh is null and auth is null)
    or
    (token is null
       and endpoint is not null and p256dh is not null and auth is not null)
  );

-- The endpoint is the identity of a web push subscription the way `token` is
-- for FCM, so it gets the same uniqueness guarantee. Partial, because NULL
-- endpoints (every FCM row) must not collide with each other.
create unique index if not exists device_tokens_endpoint_key
  on public.device_tokens (endpoint)
  where endpoint is not null;

comment on column public.device_tokens.endpoint is
  'Web Push: the push service URL to POST to. Unique. NULL for FCM rows.';
comment on column public.device_tokens.p256dh is
  'Web Push: subscription public key, base64url, for RFC 8291 encryption.';
comment on column public.device_tokens.auth is
  'Web Push: subscription auth secret, base64url. A shared secret — never log it.';
