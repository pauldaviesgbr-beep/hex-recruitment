-- Track candidate profile views by employers
-- Enables "Profile Views" widget on the candidate dashboard.

CREATE TABLE IF NOT EXISTS public.profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT NULL,
  device_type TEXT DEFAULT NULL
);

-- Index for querying view counts per profile (last 7/30 days)
CREATE INDEX IF NOT EXISTS idx_profile_views_profile
  ON profile_views(profile_id, viewed_at DESC);

-- Index for querying a viewer's history
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer
  ON profile_views(viewer_id, viewed_at DESC);

-- Composite index for de-duplication checks
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_profile
  ON profile_views(viewer_id, profile_id, viewed_at DESC);

-- RLS
ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;

-- Candidates can see how many views their own profile has
DO $$ BEGIN
  CREATE POLICY "Users can read own profile views"
    ON profile_views FOR SELECT
    USING (auth.uid() = profile_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Authenticated users can insert views (employer viewing a candidate)
DO $$ BEGIN
  CREATE POLICY "Authenticated users can insert profile views"
    ON profile_views FOR INSERT
    WITH CHECK (auth.uid() = viewer_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
