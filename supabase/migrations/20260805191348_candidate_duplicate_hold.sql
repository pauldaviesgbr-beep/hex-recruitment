-- Detecting the same person signing up twice.
--
-- Two duplicate pairs exist on the board today and both were found by eye, in
-- a screenshot, side by side in the grid. A board of twenty-one that is really
-- nineteen. Email cannot find them: both pairs carry two different addresses,
-- and no two rows share even a local-part.
--
-- NULLABLE AND ADDITIVE. Every existing row keeps its exact behaviour, and a
-- row with no hold is a row that is visible — which is the fail-open default
-- expressed in the schema rather than only in code.
alter table candidate_profiles
  add column if not exists duplicate_hold jsonb;

comment on column candidate_profiles.duplicate_hold is
  'Possible-duplicate state. { heldAt, releasedAt, reviewedAt, verdict, matchedUserId }. '
  'heldAt set = a NEW signup held hidden for 7 days; it releases ITSELF if nobody reviews, '
  'because a real person hidden indefinitely is worse than a duplicate on the board. '
  'An existing visible profile is only ever FLAGGED, never hidden retroactively. '
  'Rules and transitions live in lib/duplicateHold.ts; proved by npm run hold:prove.';

notify pgrst, 'reload schema';
