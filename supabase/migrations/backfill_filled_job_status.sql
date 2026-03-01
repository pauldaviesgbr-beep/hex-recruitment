-- Backfill: set jobs to 'filled' where they have at least one hired application
-- but the job status is still 'active'. This fixes data created before the
-- handleConfirmHire function was updated to also set the job status.

UPDATE jobs
SET status = 'filled',
    updated_at = now()
WHERE status = 'active'
  AND id IN (
    SELECT DISTINCT job_id
    FROM job_applications
    WHERE status = 'hired'
  );
