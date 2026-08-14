-- Size and MIME limits on all four buckets, previously null on every one.
-- A second line of defence behind the route/policy gates: nothing here is the
-- primary check, so the allowlists are deliberately generous to every writer
-- the code actually has (measured, not assumed):
--   profiles      CVs (pdf/doc/docx), signatures + signed-offer PDFs, and
--                 profile photos accepted as image/* with phone HEIC in play —
--                 hence the image/* wildcard rather than a named list.
--                 15MB because dashboard photo uploads have no client-side cap.
--   job-banners   route-processed webp plus the Goldenkeys importer's scraped
--                 jpg/png/webp. 5MB (largest live object is ~400KB).
--   temp-posts    route-processed webp only. 5MB.
--   company-logos route-processed webp only. 5MB.
update storage.buckets set
  file_size_limit = 15728640,
  allowed_mime_types = array['image/*','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
where id = 'profiles';

update storage.buckets set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/*']
where id in ('job-banners','temp-posts','company-logos');
