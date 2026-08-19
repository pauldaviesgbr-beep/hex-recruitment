-- PHASE 1 OF CV PARSING: somewhere to put the result. NOTHING READS THESE YET.
--
-- WHY THIS EXISTS AT ALL. Of 62 real candidates, 26 have uploaded a CV and only
-- 8 have filled in skills — the biggest single component of the match score, at
-- 35 of ~130 points. 19 people gave us a CV and no structured data whatsoever,
-- so the richest description of their experience is worth exactly zero to the
-- algorithm that decides which jobs they see.
--
-- NO cv_text COLUMN, DELIBERATELY. An earlier draft of this migration stored
-- the extracted text. It was dropped: a searchable copy of 26 people's full CVs
-- sitting in the database is a materially bigger thing than a file an employer
-- can already open one at a time, and re-parsing costs pennies. We keep the
-- DERIVED fields and not the source.
--
-- cv_parse_status SEPARATES FOUR STATES THAT LOOK ALIKE FROM THE OUTSIDE:
--   null          never attempted — the column has only just been added
--   'ok'          parsed, and something came back
--   'empty'       parsed fine, no usable content. A CV that is a PHOTOGRAPH of a
--                 page is the common case here. THIS IS NOT A BUG and must
--                 never be recorded as one, or the next person reads a wall of
--                 'failed' and concludes the parser is broken.
--   'unsupported' a file type we do not read (.pages, .odt, images)
--   'failed'      we tried and something went wrong — missing file, unreadable
--                 bytes, or a model response that did not fit the schema.
--
-- cv_derived IS ONE JSONB RATHER THAN FIVE COLUMNS, matching the existing
-- candidate_cvs.cv_data precedent. Shape:
--   { skills: [], titles: [], recentTitle, recentEndDate, seniorityRank,
--     inferred: true }
--
-- `inferred: true` IS PERMANENT AND LOAD-BEARING. A CV is evidence of what
-- someone CAN do, never of what they WANT. Phase 3 will rank a declared
-- preference above anything in here, and that rule needs a flag to hang off —
-- the same reason signup_source_basis exists beside signup_source.

alter table candidate_profiles add column if not exists cv_parsed_at    timestamptz;
alter table candidate_profiles add column if not exists cv_parse_status text;
alter table candidate_profiles add column if not exists cv_derived      jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cv_parse_status_known') then
    alter table candidate_profiles add constraint cv_parse_status_known
      check (cv_parse_status is null or cv_parse_status in
             ('ok','empty','unsupported','failed'));
  end if;
end $$;

comment on column candidate_profiles.cv_parse_status is
  'null=never tried, ok, empty (parsed but no usable text — a scanned/photographed CV, NOT a failure), unsupported (file type we do not read), failed (missing file, unreadable, or a model response that did not fit the schema).';
comment on column candidate_profiles.cv_derived is
  'Inferred from the CV. {skills, titles, recentTitle, recentEndDate, seniorityRank, inferred:true}. Evidence of capability, never of intent — a declared preference always outranks it.';

notify pgrst, 'reload schema';
