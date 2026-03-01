-- =====================================================
-- FIX RLS POLICIES
-- Tighten publicly readable tables
-- =====================================================

-- =====================================================
-- 1. candidate_profiles: require authentication for reads
-- =====================================================

-- Drop overly permissive policies if they exist
DROP POLICY IF EXISTS "Allow public read access" ON candidate_profiles;
DROP POLICY IF EXISTS "Public read access" ON candidate_profiles;
DROP POLICY IF EXISTS "Anyone can view candidate profiles" ON candidate_profiles;

-- Ensure RLS is enabled
ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;

-- Keep existing policies (own profile CRUD + employer read) from schema
-- These are already correct:
--   "Users can view own candidate profile" (SELECT, own row)
--   "Users can insert own candidate profile" (INSERT, own row)
--   "Users can update own candidate profile" (UPDATE, own row)
--   "Employers can view all candidate profiles" (SELECT, employer role check)

-- Add policy for authenticated employees to view other candidate profiles
-- (needed for homepage stats, etc.)
CREATE POLICY IF NOT EXISTS "Authenticated users can view candidate profiles"
  ON candidate_profiles FOR SELECT
  USING (auth.role() = 'authenticated');


-- =====================================================
-- 2. employer_subscriptions: restrict to owner + admin
-- =====================================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow public read access" ON employer_subscriptions;
DROP POLICY IF EXISTS "Public read access" ON employer_subscriptions;
DROP POLICY IF EXISTS "Anyone can view subscriptions" ON employer_subscriptions;
DROP POLICY IF EXISTS "Allow all select" ON employer_subscriptions;

-- Ensure RLS is enabled
ALTER TABLE employer_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owner can read their own subscription
CREATE POLICY "Users can view own subscription"
  ON employer_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Owner can insert their subscription (for Stripe webhook setup)
CREATE POLICY "Users can insert own subscription"
  ON employer_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Owner can update their subscription
CREATE POLICY "Users can update own subscription"
  ON employer_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role (admin/webhook) bypasses RLS for all operations


-- =====================================================
-- 3. candidate_cvs: tighten the permissive employer policy
-- =====================================================

-- The existing "Employers can view primary CVs" policy allows ANY user to read
-- primary CVs because it only checks is_primary=true with no auth check.
-- Replace it with a proper employer-only policy.
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


-- =====================================================
-- 4. employees: restrict to authenticated users
-- =====================================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow public read access" ON employees;
DROP POLICY IF EXISTS "Public read access" ON employees;
DROP POLICY IF EXISTS "Anyone can view employees" ON employees;

-- Ensure RLS is enabled
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Keep existing own-profile policies from schema
-- Add authenticated-only read policy
CREATE POLICY IF NOT EXISTS "Authenticated users can view employees"
  ON employees FOR SELECT
  USING (auth.role() = 'authenticated');


-- =====================================================
-- 5. Ensure employer_profiles trigger exists
-- (May not have been applied to live database)
-- =====================================================

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
