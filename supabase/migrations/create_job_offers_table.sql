-- =====================================================
-- Create job_offers table
-- =====================================================

CREATE TABLE IF NOT EXISTS job_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Offer details
  salary TEXT NOT NULL,
  start_date DATE NOT NULL,
  contract_type TEXT NOT NULL CHECK (contract_type IN (
    'full-time', 'part-time', 'temporary', 'fixed-term', 'zero-hours', 'casual'
  )),
  additional_terms TEXT,

  -- Offer letter file
  offer_letter_url TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'declined', 'withdrawn'
  )),

  -- Candidate signature (populated on acceptance)
  signature_name TEXT,
  signature_timestamp TIMESTAMPTZ,

  -- Decline reason (populated on decline)
  decline_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_offers_application_id ON job_offers(application_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_job_id ON job_offers(job_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_employer_id ON job_offers(employer_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_candidate_id ON job_offers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_status ON job_offers(status);

-- Enable RLS
ALTER TABLE job_offers ENABLE ROW LEVEL SECURITY;

-- Employers can view offers they created
CREATE POLICY "Employers can view their own offers"
  ON job_offers FOR SELECT
  USING (auth.uid() = employer_id);

-- Employers can create offers
CREATE POLICY "Employers can create offers"
  ON job_offers FOR INSERT
  WITH CHECK (auth.uid() = employer_id);

-- Employers can update their own offers (withdraw)
CREATE POLICY "Employers can update their own offers"
  ON job_offers FOR UPDATE
  USING (auth.uid() = employer_id);

-- Candidates can view offers sent to them
CREATE POLICY "Candidates can view their offers"
  ON job_offers FOR SELECT
  USING (auth.uid() = candidate_id);

-- Candidates can update offer status (accept/decline)
CREATE POLICY "Candidates can respond to offers"
  ON job_offers FOR UPDATE
  USING (auth.uid() = candidate_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_job_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_offers_updated_at
  BEFORE UPDATE ON job_offers
  FOR EACH ROW
  EXECUTE FUNCTION update_job_offers_updated_at();

-- =====================================================
-- Update job_applications status constraint to add 'offered'
-- =====================================================
ALTER TABLE public.job_applications DROP CONSTRAINT IF EXISTS job_applications_status_check;
ALTER TABLE public.job_applications ADD CONSTRAINT job_applications_status_check
  CHECK (status IN (
    'pending', 'applied', 'reviewing', 'viewed', 'interviewing',
    'interview', 'shortlisted', 'hired', 'rejected', 'withdrawn', 'offered'
  ));
