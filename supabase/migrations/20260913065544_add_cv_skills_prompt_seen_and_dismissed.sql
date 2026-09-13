-- THE CV-SKILLS PROMPT'S STATE MOVES OUT OF localStorage.
--
-- ConfirmCvSkillsPrompt remembered dismissal in localStorage, keyed per user.
-- That is per-DEVICE, unreadable by us, and lost when somebody changes phone —
-- so "they never saw it" and "they saw it and said no" are indistinguishable
-- from our side. 26 real candidates hold a parsed CV whose skills the matcher
-- cannot see, and that question is the reason this exists.
--
-- TWO COLUMNS, NOT ONE, BECAUSE THEY ARE DIFFERENT FACTS. A single column
-- cannot express "seen and not dismissed", which is precisely the state the
-- open question turns on. Dismissal alone only describes people who saw it;
-- an impression is the thing nobody can currently count.
alter table public.candidate_profiles
  add column if not exists cv_skills_prompt_seen_at      timestamptz,
  add column if not exists cv_skills_prompt_dismissed_at timestamptz;

comment on column public.candidate_profiles.cv_skills_prompt_seen_at is
  'First time ConfirmCvSkillsPrompt actually rendered for this candidate. Written once and never overwritten, so it stays a stable fact rather than a last-seen clock. NULL means it has never been on their screen — which, before this column existed, was indistinguishable from having been dismissed.';

comment on column public.candidate_profiles.cv_skills_prompt_dismissed_at is
  'When the candidate dismissed the prompt. Replaces a localStorage key that was per-device and unreadable by us. Pre-existing localStorage dismissals are deliberately NOT migrated: the record cannot be read server-side, and stamping a timestamp for it would be a guess presented as data.';
