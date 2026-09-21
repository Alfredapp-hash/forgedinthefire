-- Fundraising campaigns: owned pages, gift ledger, advocate (P2P) pages.
-- Public reads for live campaigns; writes gated by is_fitf_admin().

CREATE OR REPLACE FUNCTION public.is_fitf_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      AND role IN ('admin', 'owner')
  );
$$;

REVOKE ALL ON FUNCTION public.is_fitf_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_fitf_admin() TO authenticated, anon, service_role;

CREATE TABLE IF NOT EXISTS fundraising_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT,
  story TEXT,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'live', 'paused', 'ended', 'archived')),
  campaign_type TEXT NOT NULL DEFAULT 'annual'
    CHECK (campaign_type IN ('annual', 'emergency', 'program', 'matching', 'giving_day', 'p2p')),
  goal_cents INTEGER NOT NULL DEFAULT 0 CHECK (goal_cents >= 0),
  stretch_goal_cents INTEGER CHECK (stretch_goal_cents IS NULL OR stretch_goal_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  restricted_fund TEXT NOT NULL DEFAULT 'general'
    CHECK (restricted_fund IN ('general', 'housing', 'advocacy', 'workforce', 'emergency')),
  matching_enabled BOOLEAN NOT NULL DEFAULT false,
  matching_cap_cents INTEGER,
  matching_ratio NUMERIC NOT NULL DEFAULT 1,
  matching_sponsor TEXT,
  zeffy_url TEXT,
  honor_gifts_enabled BOOLEAN NOT NULL DEFAULT true,
  show_donor_wall BOOLEAN NOT NULL DEFAULT true,
  show_thermometer BOOLEAN NOT NULL DEFAULT true,
  show_live_feed BOOLEAN NOT NULL DEFAULT true,
  suggested_amounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  share_caption TEXT,
  utm_campaign TEXT,
  topic_id UUID,
  preview_token UUID NOT NULL DEFAULT gen_random_uuid(),
  consent_confirmed BOOLEAN NOT NULL DEFAULT false,
  identity_protection TEXT NOT NULL DEFAULT 'anonymous'
    CHECK (identity_protection IN ('anonymous', 'pseudonym', 'first_name', 'real_name')),
  content_warning TEXT,
  show_public_advisory BOOLEAN NOT NULL DEFAULT false,
  graphic_detail_reviewed BOOLEAN NOT NULL DEFAULT false,
  identifying_info_reviewed BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fundraising_campaigns_preview
  ON fundraising_campaigns(preview_token);
CREATE INDEX IF NOT EXISTS idx_fundraising_campaigns_status
  ON fundraising_campaigns(status, published_at DESC);

CREATE TABLE IF NOT EXISTS fundraising_fundraisers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES fundraising_campaigns(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  slug TEXT NOT NULL,
  email TEXT,
  story TEXT,
  goal_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, slug)
);

CREATE TABLE IF NOT EXISTS fundraising_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES fundraising_campaigns(id) ON DELETE CASCADE,
  fundraiser_id UUID REFERENCES fundraising_fundraisers(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  source TEXT NOT NULL DEFAULT 'zeffy'
    CHECK (source IN ('zeffy', 'stripe', 'check', 'cash', 'ach', 'in_kind', 'other')),
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'refunded', 'void')),
  donor_display_name TEXT,
  donor_email TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  honor_of TEXT,
  memory_of TEXT,
  message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  external_id TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fundraising_gifts_campaign
  ON fundraising_gifts(campaign_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_fundraising_gifts_status
  ON fundraising_gifts(campaign_id, status);

ALTER TABLE fundraising_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundraising_fundraisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundraising_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read live fundraising campaigns" ON fundraising_campaigns;
CREATE POLICY "Public read live fundraising campaigns"
  ON fundraising_campaigns FOR SELECT
  TO anon, authenticated
  USING (status = 'live');

DROP POLICY IF EXISTS "Admin fundraising campaigns" ON fundraising_campaigns;
CREATE POLICY "Admin fundraising campaigns"
  ON fundraising_campaigns FOR ALL
  TO authenticated
  USING (public.is_fitf_admin())
  WITH CHECK (public.is_fitf_admin());

DROP POLICY IF EXISTS "Public read active fundraisers" ON fundraising_fundraisers;
CREATE POLICY "Public read active fundraisers"
  ON fundraising_fundraisers FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM fundraising_campaigns c
      WHERE c.id = campaign_id AND c.status = 'live'
    )
  );

DROP POLICY IF EXISTS "Admin fundraising fundraisers" ON fundraising_fundraisers;
CREATE POLICY "Admin fundraising fundraisers"
  ON fundraising_fundraisers FOR ALL
  TO authenticated
  USING (public.is_fitf_admin())
  WITH CHECK (public.is_fitf_admin());

DROP POLICY IF EXISTS "Public read completed gifts" ON fundraising_gifts;
CREATE POLICY "Public read completed gifts"
  ON fundraising_gifts FOR SELECT
  TO anon, authenticated
  USING (
    status = 'completed'
    AND EXISTS (
      SELECT 1 FROM fundraising_campaigns c
      WHERE c.id = campaign_id AND c.status = 'live'
    )
  );

DROP POLICY IF EXISTS "Public insert pending gifts" ON fundraising_gifts;
CREATE POLICY "Public insert pending gifts"
  ON fundraising_gifts FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM fundraising_campaigns c
      WHERE c.id = campaign_id AND c.status = 'live'
    )
  );

DROP POLICY IF EXISTS "Admin fundraising gifts" ON fundraising_gifts;
CREATE POLICY "Admin fundraising gifts"
  ON fundraising_gifts FOR ALL
  TO authenticated
  USING (public.is_fitf_admin())
  WITH CHECK (public.is_fitf_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON fundraising_campaigns TO authenticated, service_role;
GRANT SELECT ON fundraising_campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON fundraising_fundraisers TO authenticated, service_role;
GRANT SELECT ON fundraising_fundraisers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON fundraising_gifts TO authenticated, service_role;
GRANT SELECT, INSERT ON fundraising_gifts TO anon;

COMMENT ON TABLE fundraising_campaigns IS 'Owned fundraising campaigns (not social_campaigns)';
COMMENT ON TABLE fundraising_gifts IS 'Mixed-money ledger: Zeffy, offline, pending self-reports';
