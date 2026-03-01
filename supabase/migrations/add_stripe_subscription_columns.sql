-- Add Stripe subscription columns to auth.users metadata
-- These columns track subscription state synced from Stripe webhooks

-- Add subscription columns to a dedicated employer_subscriptions table
CREATE TABLE IF NOT EXISTS employer_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  subscription_tier TEXT CHECK (subscription_tier IN ('standard', 'professional')),
  trial_ends_at TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE employer_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own subscription
CREATE POLICY "Users can view own subscription"
  ON employer_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Only service role (webhook) can insert/update
-- In practice, these writes come from the Stripe webhook API route
-- using the Supabase service role key
CREATE POLICY "Service role can manage subscriptions"
  ON employer_subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_employer_subscriptions_updated_at
  BEFORE UPDATE ON employer_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_updated_at();

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_employer_subscriptions_user_id ON employer_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_employer_subscriptions_stripe_customer_id ON employer_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_employer_subscriptions_status ON employer_subscriptions(subscription_status);
