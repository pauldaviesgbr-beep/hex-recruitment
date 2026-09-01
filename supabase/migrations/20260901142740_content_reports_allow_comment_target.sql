-- SHIFT COMMENTS ARE REPORTABLE TOO.
--
-- WHY THIS WAS MISSED FIRST TIME ROUND. The 1.2 build was scoped to "what can
-- be filmed", and a shift comment could not be — there has never been one, and
-- the single live shift post belongs to a real employer. So the surface was
-- left out.
--
-- THAT WAS WRONG, AND OUR OWN PAPERWORK SAYS SO. On 27 Aug 2026 we answered
-- Apple's age-rating questionnaire with user-generated content = YES, listing
-- shift comments explicitly. A reviewer holding both documents would have seen
-- us declare user content in one and deny it in the other.
--
-- AND THE SURFACE IS REAL, not theoretical. temp_post_comments' INSERT policy
-- is `user_id = auth.uid() AND length(btrim(body)) > 0` — NO ROLE GATE. Posting
-- a shift requires role = 'employer'; COMMENTING on one does not. A candidate's
-- comment renders publicly on /temp-work under their own name, with a link to
-- their profile. It has simply never happened yet.
alter table public.content_reports
  drop constraint if exists content_reports_target_type_check;

alter table public.content_reports
  add constraint content_reports_target_type_check
  check (target_type in ('job', 'message', 'comment'));

notify pgrst, 'reload schema';
