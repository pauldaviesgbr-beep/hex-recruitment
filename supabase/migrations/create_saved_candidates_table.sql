-- =====================================================
-- CREATE saved_candidates TABLE
-- For employers to bookmark/save candidate profiles
-- =====================================================

CREATE TABLE IF NOT EXISTS saved_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes TEXT,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employer_id, candidate_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_candidates_employer_id ON saved_candidates(employer_id);
CREATE INDEX IF NOT EXISTS idx_saved_candidates_candidate_id ON saved_candidates(candidate_id);

-- Enable RLS
ALTER TABLE saved_candidates ENABLE ROW LEVEL SECURITY;

-- Employers can only see their own saved candidates
CREATE POLICY "Employers can view own saved candidates"
  ON saved_candidates FOR SELECT
  USING (auth.uid() = employer_id);

CREATE POLICY "Employers can save candidates"
  ON saved_candidates FOR INSERT
  WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "Employers can update their saved candidate notes"
  ON saved_candidates FOR UPDATE
  USING (auth.uid() = employer_id)
  WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "Employers can unsave candidates"
  ON saved_candidates FOR DELETE
  USING (auth.uid() = employer_id);
