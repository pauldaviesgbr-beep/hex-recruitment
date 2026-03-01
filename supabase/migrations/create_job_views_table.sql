-- Track job views for analytics and recommendation algorithm
-- This table records which jobs users have viewed, enabling
-- browsing-pattern-based recommendations and employer analytics.

CREATE TABLE IF NOT EXISTS job_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT NULL,
  device_type TEXT DEFAULT NULL
);

-- Index for querying a viewer's view history
CREATE INDEX idx_job_views_viewer ON job_views(viewer_id, viewed_at DESC);

-- Index for querying view counts per job
CREATE INDEX idx_job_views_job ON job_views(job_id);

-- Composite index for checking if a viewer already viewed a specific job recently
CREATE INDEX idx_job_views_viewer_job ON job_views(viewer_id, job_id, viewed_at DESC);

-- RLS policies
ALTER TABLE job_views ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert views
CREATE POLICY "Authenticated users can insert views"
  ON job_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

-- Viewers can read their own views
CREATE POLICY "Users can read own views"
  ON job_views FOR SELECT
  USING (auth.uid() = viewer_id);

-- Employers can read views for their jobs (for analytics dashboard)
CREATE POLICY "Employers can read views for their jobs"
  ON job_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_views.job_id
      AND jobs.employer_id = auth.uid()
    )
  );
