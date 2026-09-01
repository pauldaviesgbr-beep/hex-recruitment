-- REPORTING AND BLOCKING — App Store Guideline 1.2.
--
-- reporter_id is NULLABLE with ON DELETE SET NULL, deliberately. A moderation
-- record should outlive the person who filed it, unlinked. Making it NOT NULL
-- with a CASCADE — the obvious first draft — would have destroyed the report
-- when the reporter deleted their account, which is exactly the fault found in
-- job_offers and messages on 1 Sept 2026.
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('job', 'message')),
  target_id uuid not null,
  reason text not null,
  detail text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);
create index if not exists content_reports_target_idx on public.content_reports (target_type, target_id);

-- A block is between two PEOPLE, not two rows in one thread. Deleting either
-- account makes it meaningless, so CASCADE is correct here.
create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_idx on public.user_blocks (blocker_id);

alter table public.content_reports enable row level security;
alter table public.user_blocks enable row level security;

-- Reports: you may file one as yourself, and read your own back so the UI can
-- say "you have reported this". Nobody reads anyone else's; admin uses the
-- service role.
create policy "Users file their own reports" on public.content_reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy "Users read their own reports" on public.content_reports
  for select to authenticated using (reporter_id = auth.uid());

-- Blocks: only the blocker sees, creates or removes one. The blocked person
-- must NOT be able to read the row — being told you have been blocked is a
-- reason to make another account.
create policy "Blockers manage their own blocks" on public.user_blocks
  for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- TRUE IF EITHER PARTICIPANT HAS BLOCKED THE OTHER — which is what makes the
-- block work in BOTH directions from one row. SECURITY DEFINER so it can read
-- user_blocks past the policy above, which deliberately hides a block from the
-- person it is against.
create or replace function public.is_blocked_in_conversation(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.conversations c
    join public.user_blocks b
      on (b.blocker_id = c.participant_1 and b.blocked_id = c.participant_2)
      or (b.blocker_id = c.participant_2 and b.blocked_id = c.participant_1)
    where c.id = conv_id
  );
$$;

notify pgrst, 'reload schema';
