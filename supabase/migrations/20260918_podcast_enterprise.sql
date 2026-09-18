-- Enterprise Podcast: show settings, chapters, scheduling, private feeds, analytics, distribution

-- Widen episode pipeline beyond draft/scheduled/published
ALTER TABLE podcast_episodes DROP CONSTRAINT IF EXISTS podcast_episodes_status_check;
ALTER TABLE podcast_episodes ADD CONSTRAINT podcast_episodes_status_check
  CHECK (status IN (
    'draft', 'recording', 'editing', 'review', 'scheduled', 'published', 'archived'
  ));

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS show_notes TEXT,
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_bio TEXT,
  ADD COLUMN IF NOT EXISTS episode_type TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chapters JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS keywords TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ad_markers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_id UUID;

ALTER TABLE podcast_episodes DROP CONSTRAINT IF EXISTS podcast_episodes_episode_type_check;
ALTER TABLE podcast_episodes ADD CONSTRAINT podcast_episodes_episode_type_check
  CHECK (episode_type IN ('full', 'trailer', 'bonus'));

ALTER TABLE podcast_episodes DROP CONSTRAINT IF EXISTS podcast_episodes_visibility_check;
ALTER TABLE podcast_episodes ADD CONSTRAINT podcast_episodes_visibility_check
  CHECK (visibility IN ('public', 'unlisted', 'private'));

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_scheduled_for
  ON podcast_episodes(scheduled_for)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_visibility
  ON podcast_episodes(visibility, status);

-- Show-level settings (beats hardcoded meta; supports future multi-show)
CREATE TABLE IF NOT EXISTS podcast_shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL DEFAULT 'main',
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  email TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Society & Culture',
  subcategory TEXT,
  language TEXT NOT NULL DEFAULT 'en-us',
  explicit BOOLEAN NOT NULL DEFAULT FALSE,
  cover_url TEXT,
  website_url TEXT,
  copyright TEXT,
  itunes_type TEXT NOT NULL DEFAULT 'episodic'
    CHECK (itunes_type IN ('episodic', 'serial')),
  owner_name TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_shows_one_default
  ON podcast_shows(is_default)
  WHERE is_default = TRUE;

INSERT INTO podcast_shows (
  slug, title, author, email, description, category, cover_url, website_url,
  copyright, owner_name, is_default
)
SELECT
  'main',
  'Forged in the Fire',
  'Tracy / Forged in the Fire',
  'tracys@forgedinthefireohio.org',
  'A survivor-centered conversation about healing, housing, and hope from Forged in the Fire in Lorain County, Ohio. Dignity first. No spectacle.',
  'Society & Culture',
  'https://forgedinthefireohio.org/brand/fitf-lockup.png',
  'https://forgedinthefireohio.org',
  '© Forged in the Fire',
  'Forged in the Fire',
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM podcast_shows WHERE slug = 'main');

UPDATE podcast_episodes pe
SET show_id = s.id
FROM podcast_shows s
WHERE pe.show_id IS NULL AND s.is_default = TRUE;

ALTER TABLE podcast_episodes
  DROP CONSTRAINT IF EXISTS podcast_episodes_show_id_fkey;
ALTER TABLE podcast_episodes
  ADD CONSTRAINT podcast_episodes_show_id_fkey
  FOREIGN KEY (show_id) REFERENCES podcast_shows(id) ON DELETE SET NULL;

-- Directory / distribution checklist
CREATE TABLE IF NOT EXISTS podcast_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES podcast_shows(id) ON DELETE CASCADE,
  platform TEXT NOT NULL
    CHECK (platform IN (
      'apple', 'spotify', 'amazon', 'youtube', 'iheart', 'pocket_casts', 'overcast', 'rss'
    )),
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'submitted', 'in_review', 'live', 'blocked')),
  listing_url TEXT,
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  live_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (show_id, platform)
);

INSERT INTO podcast_distribution (show_id, platform, status)
SELECT s.id, p.platform, CASE WHEN p.platform = 'rss' THEN 'live' ELSE 'not_started' END
FROM podcast_shows s
CROSS JOIN (VALUES
  ('apple'), ('spotify'), ('amazon'), ('youtube'),
  ('iheart'), ('pocket_casts'), ('overcast'), ('rss')
) AS p(platform)
WHERE s.is_default = TRUE
ON CONFLICT (show_id, platform) DO NOTHING;

-- Private / members feed subscribers (unique token RSS — Transistor-class)
CREATE TABLE IF NOT EXISTS podcast_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES podcast_shows(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_access_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_podcast_subscribers_show
  ON podcast_subscribers(show_id, status);

-- Download / play events (IAB-shaped analytics without certification paperwork)
CREATE TABLE IF NOT EXISTS podcast_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES podcast_episodes(id) ON DELETE SET NULL,
  show_id UUID REFERENCES podcast_shows(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'download'
    CHECK (event_type IN ('download', 'play', 'embed_play', 'private_access')),
  listener_hash TEXT,
  user_agent TEXT,
  app_name TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_podcast_analytics_occurred
  ON podcast_analytics_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_analytics_episode
  ON podcast_analytics_events(episode_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_analytics_show
  ON podcast_analytics_events(show_id, occurred_at DESC);

-- RLS
ALTER TABLE podcast_shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin podcast shows" ON podcast_shows;
CREATE POLICY "Admin podcast shows" ON podcast_shows
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public podcast shows" ON podcast_shows;
CREATE POLICY "Public podcast shows" ON podcast_shows
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin podcast distribution" ON podcast_distribution;
CREATE POLICY "Admin podcast distribution" ON podcast_distribution
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin podcast subscribers" ON podcast_subscribers;
CREATE POLICY "Admin podcast subscribers" ON podcast_subscribers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin podcast analytics" ON podcast_analytics_events;
CREATE POLICY "Admin podcast analytics" ON podcast_analytics_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Insert podcast analytics" ON podcast_analytics_events;
CREATE POLICY "Insert podcast analytics" ON podcast_analytics_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Public published policy: public + unlisted (private stays token-feed only)
DROP POLICY IF EXISTS "Public published podcasts" ON podcast_episodes;
CREATE POLICY "Public published podcasts" ON podcast_episodes
  FOR SELECT USING (
    status = 'published'
    AND visibility IN ('public', 'unlisted')
    AND audio_url IS NOT NULL
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_shows TO authenticated;
GRANT SELECT ON podcast_shows TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_distribution TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_subscribers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_analytics_events TO authenticated;
GRANT INSERT ON podcast_analytics_events TO anon;
