-- jobs.updated_at was stamped at insert and never moved again — no trigger,
-- measured 14 Aug 2026 while asking "which six Goldenkeys rows retired today":
-- the table could not date its own status flips, and updated_at read as a lie
-- by omission. Same per-table function-and-trigger shape as job_offers,
-- interviews, candidate_cvs and the rest of the house pattern. Nothing in the
-- app reads jobs.updated_at today (checked), so nothing changes behaviour;
-- the next reconcile simply becomes datable.

create or replace function public.update_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function public.update_jobs_updated_at();
