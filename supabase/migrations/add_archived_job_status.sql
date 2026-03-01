-- Add 'archived' to the jobs status CHECK constraint
-- This allows employers to archive filled jobs to move them out of the Hired tab

-- Drop the existing constraint and recreate with 'archived' included
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('active', 'expired', 'filled', 'draft', 'archived'));
