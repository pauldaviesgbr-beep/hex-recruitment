-- Create interviews table
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interview_date DATE NOT NULL,
  interview_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  interview_type TEXT NOT NULL CHECK (interview_type IN ('in-person', 'video', 'phone')),
  location_or_link TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_employer_id ON interviews(employer_id);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_id ON interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(status);

-- Enable RLS
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Employers can view/manage interviews they created
CREATE POLICY "Employers can view their own interviews"
  ON interviews
  FOR SELECT
  USING (auth.uid() = employer_id);

CREATE POLICY "Employers can create interviews"
  ON interviews
  FOR INSERT
  WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "Employers can update their own interviews"
  ON interviews
  FOR UPDATE
  USING (auth.uid() = employer_id);

CREATE POLICY "Employers can delete their own interviews"
  ON interviews
  FOR DELETE
  USING (auth.uid() = employer_id);

-- Candidates can view interviews they're invited to
CREATE POLICY "Candidates can view their interviews"
  ON interviews
  FOR SELECT
  USING (auth.uid() = candidate_id);

-- Candidates can update interview status (accept/reschedule)
CREATE POLICY "Candidates can update interview status"
  ON interviews
  FOR UPDATE
  USING (auth.uid() = candidate_id)
  WITH CHECK (auth.uid() = candidate_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_interviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER interviews_updated_at
  BEFORE UPDATE ON interviews
  FOR EACH ROW
  EXECUTE FUNCTION update_interviews_updated_at();
