-- WHY ?ref HAS NEVER LANDED ONCE IN 62 CANDIDATES, AND WHY MORE TAGGING
-- WOULD NOT HAVE FIXED IT.
--
-- The LinkedIn flow, in Paul's own description: post the link, let the job
-- card render, then EDIT THE POST AND DELETE THE LINK — because the link
-- sends people to a LinkedIn interstitial warning, while the card image keeps
-- working and goes straight through. So the thing people click is the image
-- of a card whose href was authored before any tag existed, and the tag is
-- removed from the post by the time anyone sees it. There is no URL for a
-- ?ref to be on. Mohammed came from LinkedIn, reacted there, signed up, and
-- recorded 'unknown'.
--
-- The only signal that survives that flow is the REFERRER the browser sends
-- on the first page load. So capture it — but never let it impersonate a tag.
--
--   referrer_host        the bare host, e.g. 'linkedin.com'. Host only: no
--                        path, no query, so nothing about which page they
--                        came from is stored, only which platform.
--   signup_source_basis  how we know: 'tag' (they arrived with ?ref/utm),
--                        'self-reported' (they told us in the dropdown),
--                        'referrer' (we inferred it), 'unknown'.
--
-- THE BASIS COLUMN IS THE POINT. signup_source alone would make an inference
-- and a declaration look identical, and the whole reason this data is being
-- built is to decide where to spend money. "LinkedIn, because they told us"
-- and "LinkedIn, because Chrome said so and the app may not have" are
-- different confidences, and a chart that merges them cannot be corrected
-- later — the distinction is unrecoverable once it is not written down.
--
-- A REFERRER IS ABSENT MORE OFTEN THAN IT IS WRONG. Native apps frequently
-- send none, and some platforms strip it. So null here means "not told",
-- never "direct traffic", and nothing in the product may render it as direct.

alter table candidate_profiles add column if not exists referrer_host       text;
alter table candidate_profiles add column if not exists signup_source_basis text;
alter table employer_profiles  add column if not exists referrer_host       text;
alter table employer_profiles  add column if not exists signup_source_basis text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'candidate_source_basis_known') then
    alter table candidate_profiles add constraint candidate_source_basis_known
      check (signup_source_basis is null
             or signup_source_basis in ('tag','self-reported','referrer','unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employer_source_basis_known') then
    alter table employer_profiles add constraint employer_source_basis_known
      check (signup_source_basis is null
             or signup_source_basis in ('tag','self-reported','referrer','unknown'));
  end if;
end $$;

-- BACKFILL ONLY WHAT IS ALREADY EVIDENCED, and leave the rest null. A row
-- with a real tag was demonstrably a tag; a row with only heard_from was
-- demonstrably self-reported. Everything else stays NULL rather than being
-- called 'unknown', because "we never asked this question of this row" is a
-- different fact from "we asked and could not tell".
update candidate_profiles set signup_source_basis = 'tag'
 where signup_source_basis is null
   and (signup_ref is not null or utm_source is not null or utm_medium is not null or utm_campaign is not null);
update candidate_profiles set signup_source_basis = 'self-reported'
 where signup_source_basis is null and heard_from is not null;
update employer_profiles set signup_source_basis = 'tag'
 where signup_source_basis is null
   and (signup_ref is not null or utm_source is not null or utm_medium is not null or utm_campaign is not null);
update employer_profiles set signup_source_basis = 'self-reported'
 where signup_source_basis is null and heard_from is not null;

comment on column candidate_profiles.referrer_host is
  'Bare host of document.referrer on the first page load, e.g. linkedin.com. Host only — no path, no query. NULL means the browser sent none (common from native apps), NOT that the visit was direct.';
comment on column candidate_profiles.signup_source_basis is
  'How signup_source was arrived at: tag | self-reported | referrer | unknown. Exists so an inference can never be read as a declaration.';

notify pgrst, 'reload schema';
