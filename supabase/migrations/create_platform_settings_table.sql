-- =====================================================
-- CREATE platform_settings TABLE
-- Key-value store for admin platform configuration
-- =====================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default announcement settings
INSERT INTO platform_settings (key, value) VALUES
  ('announcement_text', ''),
  ('announcement_active', 'false')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Only authenticated admin users can read settings
-- (The admin API route uses the service role key, which bypasses RLS)
-- Allow public read for announcement banner display
CREATE POLICY "Anyone can read platform settings"
  ON platform_settings FOR SELECT
  USING (true);

-- Only service role (admin) can modify settings (no anon/user INSERT/UPDATE/DELETE policies)
-- Admin routes use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_platform_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_settings_updated_at();
