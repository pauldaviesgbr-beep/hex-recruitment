-- =============================================================
-- COMBINED MIGRATION — Run in Supabase SQL Editor
-- 1. Create platform_settings table
-- 2. Create saved_candidates table
-- 3. Fix RLS policies on 4 tables
-- 4. Re-create employer profile trigger
-- =============================================================


-- =============================================================
-- 1. PLATFORM_SETTINGS TABLE
-- Key-value store for admin platform configuration
-- =============================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO platform_settings (key, value) VALUES
  ('announcement_text', ''),
  ('announcement_active', 'false')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read platform settings"
  ON platform_settings FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION update_platform_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_settings_updated_at ON platform_settings;
CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_settings_updated_at();


-- =============================================================
-- 2. SAVED_CANDIDATES TABLE
-- For employers to bookmark/save candidate profiles
-- =============================================================

CREATE TABLE IF NOT EXISTS saved_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes TEXT,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employer_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_candidates_employer_id ON saved_candidates(employer_id);
CREATE INDEX IF NOT EXISTS idx_saved_candidates_candidate_id ON saved_candidates(candidate_id);

ALTER TABLE saved_candidates ENABLE ROW LEVEL SECURITY;

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


-- =============================================================
-- 3. FIX RLS — candidate_profiles
-- =============================================================

DROP POLICY IF EXISTS "Allow public read access" ON candidate_profiles;
DROP POLICY IF EXISTS "Public read access" ON candidate_profiles;
DROP POLICY IF EXISTS "Anyone can view candidate profiles" ON candidate_profiles;

ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'candidate_profiles'
    AND policyname = 'Authenticated users can view candidate profiles'
  ) THEN
    CREATE POLICY "Authenticated users can view candidate profiles"
      ON candidate_profiles FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;


-- =============================================================
-- 4. FIX RLS — employer_subscriptions
-- =============================================================

DROP POLICY IF EXISTS "Allow public read access" ON employer_subscriptions;
DROP POLICY IF EXISTS "Public read access" ON employer_subscriptions;
DROP POLICY IF EXISTS "Anyone can view subscriptions" ON employer_subscriptions;
DROP POLICY IF EXISTS "Allow all select" ON employer_subscriptions;

ALTER TABLE employer_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON employer_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
  ON employer_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON employer_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);


-- =============================================================
-- 5. FIX RLS — candidate_cvs
-- =============================================================

DROP POLICY IF EXISTS "Employers can view primary CVs" ON candidate_cvs;

CREATE POLICY "Employers can view primary CVs"
  ON candidate_cvs FOR SELECT
  USING (
    is_primary = true
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::text = 'employer'
    )
  );


-- =============================================================
-- 6. FIX RLS — employees
-- =============================================================

DROP POLICY IF EXISTS "Allow public read access" ON employees;
DROP POLICY IF EXISTS "Public read access" ON employees;
DROP POLICY IF EXISTS "Anyone can view employees" ON employees;

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'employees'
    AND policyname = 'Authenticated users can view employees'
  ) THEN
    CREATE POLICY "Authenticated users can view employees"
      ON employees FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;


-- =============================================================
-- 7. EMPLOYER PROFILE TRIGGER
-- Auto-creates employer_profiles row on signup
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_employer()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.raw_user_meta_data->>'role')::text = 'employer' THEN
    INSERT INTO public.employer_profiles (user_id, company_name, contact_name, email)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'company_name', 'Unknown Company'),
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
      NEW.email
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_employer ON auth.users;
CREATE TRIGGER on_auth_user_created_employer
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_employer();
