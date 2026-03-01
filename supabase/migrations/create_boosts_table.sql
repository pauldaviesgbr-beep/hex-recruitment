-- =====================================================
-- SQL: Create the boosts table for job & profile boosting
-- Run this in Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS public.boosts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  boost_type TEXT NOT NULL CHECK (boost_type IN ('job', 'profile')),
  target_id UUID NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('7_days', '14_days', '30_days')),
  price_paid NUMERIC(10, 2) NOT NULL,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_boosts_user_id ON public.boosts(user_id);
CREATE INDEX IF NOT EXISTS idx_boosts_target_id ON public.boosts(target_id);
CREATE INDEX IF NOT EXISTS idx_boosts_type_active ON public.boosts(boost_type, is_active);
CREATE INDEX IF NOT EXISTS idx_boosts_expires_at ON public.boosts(expires_at);

-- Enable Row Level Security
ALTER TABLE public.boosts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own boosts (all, including expired)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own boosts' AND tablename = 'boosts') THEN
    CREATE POLICY "Users view own boosts" ON public.boosts
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Policy: Anyone can view active, non-expired boosts (needed for listing pages to sort boosted items first)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public view active boosts' AND tablename = 'boosts') THEN
    CREATE POLICY "Public view active boosts" ON public.boosts
      FOR SELECT USING (is_active = true AND expires_at > NOW());
  END IF;
END $$;

-- Policy: Users can insert their own boosts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users insert own boosts' AND tablename = 'boosts') THEN
    CREATE POLICY "Users insert own boosts" ON public.boosts
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Policy: Users can update their own boosts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users update own boosts' AND tablename = 'boosts') THEN
    CREATE POLICY "Users update own boosts" ON public.boosts
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
