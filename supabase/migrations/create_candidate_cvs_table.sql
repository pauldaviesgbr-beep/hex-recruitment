-- Create candidate_cvs table for storing CV builder data
CREATE TABLE IF NOT EXISTS candidate_cvs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cv_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  title TEXT NOT NULL DEFAULT 'My CV',
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_candidate_cvs_user_id ON candidate_cvs(user_id);

-- RLS
ALTER TABLE candidate_cvs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own CVs"
  ON candidate_cvs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own CVs"
  ON candidate_cvs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own CVs"
  ON candidate_cvs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own CVs"
  ON candidate_cvs FOR DELETE
  USING (auth.uid() = user_id);

-- Employers can view primary CVs of candidates (for viewing candidate profiles)
CREATE POLICY "Employers can view primary CVs"
  ON candidate_cvs FOR SELECT
  USING (is_primary = true);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_candidate_cvs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidate_cvs_updated_at
  BEFORE UPDATE ON candidate_cvs
  FOR EACH ROW
  EXECUTE FUNCTION update_candidate_cvs_updated_at();
