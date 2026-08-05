-- Admin portal: site settings, social publishing, content extensions

-- Site settings (key/value store)
CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read site settings" ON site_settings;
CREATE POLICY "Public read site settings"
  ON site_settings FOR SELECT
  USING (key IN (
    'site_name', 'site_description', 'contact_email', 'contact_phone',
    'address', 'primary_city', 'service_area',
    'social_facebook', 'social_instagram', 'social_twitter',
    'google_analytics_id'
  ));

DROP POLICY IF EXISTS "Admin manage site settings" ON site_settings;
CREATE POLICY "Admin manage site settings"
  ON site_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Content extensions
ALTER TABLE content
  ADD COLUMN IF NOT EXISTS consent_confirmed BOOLEAN DEFAULT FALSE;

-- Allow scheduled status
ALTER TABLE content DROP CONSTRAINT IF EXISTS content_status_check;
ALTER TABLE content ADD CONSTRAINT content_status_check
  CHECK (status IN ('draft', 'scheduled', 'published', 'archived'));

-- Social accounts
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'linkedin', 'youtube', 'mock')),
  account_name TEXT NOT NULL DEFAULT '',
  account_id TEXT,
  connection_status TEXT NOT NULL DEFAULT 'not_connected'
    CHECK (connection_status IN ('connected', 'not_connected', 'expired', 'error', 'disabled')),
  enabled BOOLEAN DEFAULT TRUE,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social campaigns
CREATE TABLE IF NOT EXISTS social_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  campaign_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (campaign_status IN ('draft', 'ready', 'scheduled', 'partially_posted', 'posted', 'failed', 'archived')),
  source_type TEXT DEFAULT 'blog_post',
  source_id TEXT,
  utm_campaign TEXT DEFAULT 'forged-blog',
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social posts (per platform)
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES social_campaigns(id) ON DELETE CASCADE,
  account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  caption TEXT DEFAULT '',
  media_urls TEXT[] DEFAULT '{}',
  link_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'posted', 'mock_posted', 'failed')),
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  external_post_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media assets metadata
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  alt TEXT DEFAULT '',
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin social accounts" ON social_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin social campaigns" ON social_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin social posts" ON social_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin media assets" ON media_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public read media" ON media_assets FOR SELECT USING (true);

-- Default settings
INSERT INTO site_settings (key, value) VALUES
  ('site_name', 'Forged in the Fire'),
  ('site_description', 'Survivor-centered nonprofit supporting survivors of human trafficking in Lorain County, Ohio.'),
  ('contact_email', 'tracys@forgedinthefireohio.org'),
  ('contact_phone', '1 216-202-0786'),
  ('address', '15728 Lorain Ave, Unit 146, Lorain County, OH 44111-5542'),
  ('primary_city', 'Lorain County'),
  ('service_area', 'Lorain County and Northeast Ohio'),
  ('google_analytics_id', '')
ON CONFLICT (key) DO NOTHING;
