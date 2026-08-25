-- AN ERASED AUTHOR'S COMMENT KEEPS ITS PLACE AND LOSES ITS AUTHOR.
--
-- Paul's decision, 25 Aug 2026: NULL, not a sentinel "deleted user" row.
--
-- WHY NOT A SENTINEL, because the reasoning outlives the choice: a "deleted
-- user" is A REAL ROW IN A TABLE OF REAL PEOPLE, and it leaks — into a
-- candidate count, an email send, a directory, a number quoted to an employer.
-- This platform already has that exact fault with four test-employer rows
-- sitting inside a placement count. NULL is also simply TRUE: there is no
-- author. A fake user says something false.
--
-- CHECKED BEFORE RELAXING THE CONSTRAINT — a NOT NULL usually exists because
-- something assumes presence. All four policies behave correctly with a null:
--   INSERT  user_id = auth.uid()          → NULL, refused. Nobody can CREATE
--                                            an author-less comment.
--   DELETE  … OR temp_post_is_owner(…)    → the post owner can still remove it.
--   UPDATE  temp_post_is_owner(…)         → does not read user_id at all.
--   SELECT  … OR user_id = auth.uid() …   → a public comment stays public; a
--                                            hidden one stays owner-only.
-- And both counting/notifying triggers are AFTER INSERT OR DELETE, so an
-- anonymising UPDATE cannot change a comment count or send an email.
alter table public.temp_post_comments
  alter column user_id drop not null;

comment on column public.temp_post_comments.user_id is
  'Null means the author erased their account. The comment stays so replies to it still make sense; author_name and author_avatar are cleared at the same time.';
