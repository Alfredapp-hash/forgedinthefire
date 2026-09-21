-- Paid ad campaigns, spend, and attributed return for FITF.
-- Competitor landscape lives in application code (public research, not a table).

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'meta'
    CHECK (platform IN ('meta', 'google_search', 'google_grants', 'pmax', 'youtube', 'display', 'tiktok', 'other')),
  objective TEXT NOT NULL DEFAULT 'fundraising'
    CHECK (objective IN ('fundraising', 'awareness', 'lead_gen')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  fundraising_campaign_id UUID REFERENCES fundraising_campaigns(id) ON DELETE SET NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  starts_on DATE,
  ends_on DATE,
  audience TEXT,
  creative_notes TEXT,
  landing_url TEXT,
  dignity_reviewed BOOLEAN NOT NULL DEFAULT false,
  graphic_detail_reviewed BOOLEAN NOT NULL DEFAULT false,
  identifying_info_reviewed BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_utm ON ad_campaigns(utm_campaign);

CREATE TABLE IF NOT EXISTS ad_spend_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  spend_cents INTEGER NOT NULL CHECK (spend_cents >= 0),
  impressions INTEGER,
  clicks INTEGER,
  reach INTEGER,
  platform_results INTEGER,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_campaign ON ad_spend_entries(campaign_id, period_start DESC);

CREATE TABLE IF NOT EXISTS ad_return_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  attributed_cents INTEGER NOT NULL CHECK (attributed_cents >= 0),
  gift_count INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'manual'
    CHECK (method IN ('manual', 'utm', 'platform')),
  gift_id UUID,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_return_campaign ON ad_return_entries(campaign_id, period_start DESC);

ALTER TABLE fundraising_gifts
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT;

CREATE INDEX IF NOT EXISTS idx_fundraising_gifts_utm ON fundraising_gifts(utm_campaign);

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_return_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin ad campaigns" ON ad_campaigns;
CREATE POLICY "Admin ad campaigns"
  ON ad_campaigns FOR ALL
  TO authenticated
  USING (public.is_fitf_admin())
  WITH CHECK (public.is_fitf_admin());

DROP POLICY IF EXISTS "Admin ad spend" ON ad_spend_entries;
CREATE POLICY "Admin ad spend"
  ON ad_spend_entries FOR ALL
  TO authenticated
  USING (public.is_fitf_admin())
  WITH CHECK (public.is_fitf_admin());

DROP POLICY IF EXISTS "Admin ad return" ON ad_return_entries;
CREATE POLICY "Admin ad return"
  ON ad_return_entries FOR ALL
  TO authenticated
  USING (public.is_fitf_admin())
  WITH CHECK (public.is_fitf_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON ad_campaigns TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ad_spend_entries TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ad_return_entries TO authenticated, service_role;

COMMENT ON TABLE ad_campaigns IS 'FITF paid media campaigns with UTM and dignity gates';
COMMENT ON TABLE ad_spend_entries IS 'Invoices / platform spend by date range';
COMMENT ON TABLE ad_return_entries IS 'Gifts attributed to ads (manual, UTM, or platform)';
