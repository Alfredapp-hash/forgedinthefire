-- Content Studio: biweekly topics, podcast episodes, social canvases, templates

CREATE TABLE IF NOT EXISTS content_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT,
  talking_points TEXT[] NOT NULL DEFAULT '{}',
  scheduled_on DATE,
  status TEXT NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea', 'planned', 'in_production', 'published', 'archived')),
  blog_post_id UUID REFERENCES content(id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_topics_scheduled ON content_topics(scheduled_on);
CREATE INDEX IF NOT EXISTS idx_content_topics_status ON content_topics(status);

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES content_topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT,
  audio_url TEXT,
  audio_mime TEXT,
  duration_seconds INTEGER,
  file_size INTEGER,
  cover_url TEXT,
  transcript TEXT,
  season INTEGER NOT NULL DEFAULT 1,
  episode_number INTEGER,
  explicit BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published')),
  published_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_status ON podcast_episodes(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_topic ON podcast_episodes(topic_id);

CREATE TABLE IF NOT EXISTS studio_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES content_topics(id) ON DELETE CASCADE,
  platform TEXT NOT NULL
    CHECK (platform IN ('tiktok', 'instagram', 'youtube_shorts', 'facebook', 'linkedin')),
  format TEXT NOT NULL DEFAULT '9:16',
  hook TEXT,
  script TEXT,
  caption TEXT,
  cta TEXT,
  media_url TEXT,
  duration_seconds INTEGER,
  canvas JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_clips_topic ON studio_clips(topic_id);

CREATE TABLE IF NOT EXISTS studio_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('blog', 'social', 'podcast_cover')),
  format TEXT,
  canvas JSONB NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE content
  ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES content_topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_topic ON content(topic_id);

-- TikTok is a first-class social account for caption drafts (no auto-post this sprint)
ALTER TABLE social_accounts DROP CONSTRAINT IF EXISTS social_accounts_platform_check;
ALTER TABLE social_accounts ADD CONSTRAINT social_accounts_platform_check
  CHECK (platform IN ('facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'mock'));

INSERT INTO social_accounts (platform, account_name)
SELECT 'tiktok', 'TikTok'
WHERE NOT EXISTS (SELECT 1 FROM social_accounts WHERE platform = 'tiktok');

ALTER TABLE content_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin content topics" ON content_topics;
CREATE POLICY "Admin content topics" ON content_topics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin podcast episodes" ON podcast_episodes;
CREATE POLICY "Admin podcast episodes" ON podcast_episodes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public published podcasts" ON podcast_episodes;
CREATE POLICY "Public published podcasts" ON podcast_episodes
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "Admin studio clips" ON studio_clips;
CREATE POLICY "Admin studio clips" ON studio_clips
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin studio templates" ON studio_templates;
CREATE POLICY "Admin studio templates" ON studio_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public studio templates" ON studio_templates;
CREATE POLICY "Public studio templates" ON studio_templates
  FOR SELECT USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON content_topics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_episodes TO authenticated;
GRANT SELECT ON podcast_episodes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_clips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_templates TO authenticated;
GRANT SELECT ON studio_templates TO anon;

-- Survivor-safe starter canvases (no graphic imagery)
INSERT INTO studio_templates (name, kind, format, canvas)
SELECT * FROM (VALUES
  (
    'Quote card',
    'social',
    '1:1',
    '{
      "format":"1:1",
      "background":{"kind":"gradient","color":"#05070A","color2":"#151B22"},
      "headline":{"text":"Dignity is not earned. It is already yours.","color":"#F6FAFC","size":72},
      "body":{"text":"Survivor-centered support in Lorain County.","color":"#8DEBFF","size":32},
      "logo":{"visible":true},
      "cta":{"visible":true,"text":"forgedinthefireohio.org"}
    }'::jsonb
  ),
  (
    'Episode promo',
    'social',
    '9:16',
    '{
      "format":"9:16",
      "background":{"kind":"gradient","color":"#05070A","color2":"#0C141C"},
      "headline":{"text":"New episode","color":"#8DEBFF","size":40},
      "body":{"text":"Listen: stories of healing, not spectacle.","color":"#F6FAFC","size":56},
      "logo":{"visible":true},
      "cta":{"visible":true,"text":"Listen on forgedinthefireohio.org/podcast"}
    }'::jsonb
  ),
  (
    'Resource tip',
    'social',
    '4:5',
    '{
      "format":"4:5",
      "background":{"kind":"color","color":"#151B22"},
      "headline":{"text":"If you need help today","color":"#F6FAFC","size":64},
      "body":{"text":"Call or text. You do not have to explain everything to be believed.","color":"#B8C4CF","size":36},
      "logo":{"visible":true},
      "cta":{"visible":true,"text":"Get help → forgedinthefireohio.org/get-help"}
    }'::jsonb
  ),
  (
    'Event',
    'social',
    '1:1',
    '{
      "format":"1:1",
      "background":{"kind":"gradient","color":"#0C141C","color2":"#05070A"},
      "headline":{"text":"Community gathering","color":"#53D6FF","size":40},
      "body":{"text":"Join us in Lorain County. All are welcome.","color":"#F6FAFC","size":56},
      "logo":{"visible":true},
      "cta":{"visible":true,"text":"Details on the blog"}
    }'::jsonb
  ),
  (
    'Donate',
    'social',
    '9:16',
    '{
      "format":"9:16",
      "background":{"kind":"gradient","color":"#05070A","color2":"#151B22"},
      "headline":{"text":"Keep the house lights on","color":"#F6FAFC","size":68},
      "body":{"text":"Your gift funds safe housing and trauma-informed care.","color":"#8DEBFF","size":34},
      "logo":{"visible":true},
      "cta":{"visible":true,"text":"Donate → forgedinthefireohio.org/donate"}
    }'::jsonb
  ),
  (
    'Podcast cover',
    'podcast_cover',
    '1:1',
    '{
      "format":"1:1",
      "background":{"kind":"gradient","color":"#05070A","color2":"#151B22"},
      "headline":{"text":"Forged in the Fire","color":"#8DEBFF","size":56},
      "body":{"text":"A conversation about healing, housing, and hope.","color":"#F6FAFC","size":36},
      "logo":{"visible":true},
      "cta":{"visible":false,"text":""}
    }'::jsonb
  )
) AS seed(name, kind, format, canvas)
WHERE NOT EXISTS (SELECT 1 FROM studio_templates t WHERE t.name = seed.name);
