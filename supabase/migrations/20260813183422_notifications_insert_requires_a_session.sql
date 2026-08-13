-- A notification may only be created by someone who is signed in.
--
-- WHAT WAS WRONG
--   policy      "System can insert notifications"
--   command     INSERT
--   role        public          -- i.e. anon as well
--   with check  true            -- i.e. nothing
--
-- The name says System. The rule said anybody, including a complete stranger.
-- Same mechanism as "Allow users to delete own profile files", which had no
-- "own" in it: someone reads the name, believes it, and never reads the rule.
--
-- AND SINCE THE PUSH WORK THIS TABLE IS NOT INERT. notifications_dispatch_push
-- fires on every insert and sends a Web Push to the user named in the row, with
-- the title, message and link taken from that row. So the row is not a record of
-- an event, it is a send.
--
-- VERIFIED BEFORE WRITING THIS, against a throwaway account holding its own
-- deliberately undeliverable device token, never a real user:
--   anon key, no session   -> HTTP 201, row landed, trigger fired, push_log
--                             recorded a send attempt that reached encryption
--   a signed-in stranger   -> HTTP 201, same
--
-- The first attempt at that test reported the insert as REFUSED, and was wrong.
-- It sent Prefer: return=representation, so PostgREST read the row back after
-- inserting, and reading needs the SELECT policy (auth.uid() = user_id), which
-- is false for anon. The refusal came from the read, not the write. A check that
-- cannot tell those two apart is worse than no check, because this one failed
-- SAFE — it said "secure" about a hole.
--
-- WHY THIS RULE AND NOT AN OWNERSHIP ONE
-- The obvious rule, auth.uid() = user_id, is exactly wrong here. The legitimate
-- pattern is a signed-in user creating a notification FOR SOMEBODY ELSE — a
-- candidate applies and the employer must hear about it. Inventoried all 35
-- insert sites: 22 run in the browser and every one of them notifies the OTHER
-- party, never the sender. app/jobs/page.tsx:752 (new_application) is the
-- busiest event we have and it writes the employer's id from the candidate's
-- browser. auth.uid() = user_id would forbid all 22.
--
-- A relationship rule — "you and the recipient share an application, offer or
-- interview" — covers most of them and still breaks app/talent-pool/page.tsx:140
-- and app/pipeline/page.tsx:355, where an employer contacts a candidate they
-- have no prior relationship with. That is the product working as designed, the
-- same shape as employers browsing CVs of candidates who never applied.
--
-- So there is NO clean expression that covers every legitimate case and also
-- meaningfully restricts. What this migration does is the part that is provably
-- safe and provably valuable: it removes the anonymous case entirely.
--
-- WHAT THIS DOES NOT DO, stated plainly so nobody reads the name too kindly:
-- a REGISTERED user can still create a notification for any other user. Closing
-- that means moving those 22 client-side inserts behind a server route that
-- authorises each event, which is a piece of work rather than a policy line.
-- Note also that anyone can register in a minute, so the practical gain is
-- attribution and rate-limiting, not a wall.
--
-- Service-role writes (13 sites: the offer routes, the calendar routes, the
-- expiry cron, job-alerts/match and the simulator) bypass RLS and are unaffected.

begin;

drop policy if exists "System can insert notifications" on public.notifications;

-- TO authenticated already excludes anon; the auth.uid() test is belt and braces
-- and makes the rule readable without knowing that.
create policy "notifications: only a signed-in user may create one"
  on public.notifications for insert
  to authenticated
  with check ( auth.uid() is not null );

commit;
