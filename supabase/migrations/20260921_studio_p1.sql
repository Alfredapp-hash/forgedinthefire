-- Studio P1: consent/identity, preview tokens, revisions, content RLS, loudness columns
-- Apply after 20260921_podcast_hardening.sql and 20260921_blog_hardening.sql

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

-- Content: identity protection + draft preview tokens
ALTER TABLE content
  ADD COLUMN IF NOT EXISTS identity_protection TEXT NOT NULL DEFAULT 'anonymous'
    CHECK (identity_protection IN ('anonymous', 'pseudonym', 'first_name', 'real_name'));

ALTER TABLE content
  ADD COLUMN IF NOT EXISTS preview_token UUID;

UPDATE content SET preview_token = gen_random_uuid() WHERE preview_token IS NULL;

ALTER TABLE content
  ALTER COLUMN preview_token SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_preview_token ON content(preview_token);

-- Podcast: consent, identity, preview, loudness
ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS identity_protection TEXT NOT NULL DEFAULT 'anonymous'
    CHECK (identity_protection IN ('anonymous', 'pseudonym', 'first_name', 'real_name'));

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS preview_token UUID;

UPDATE podcast_episodes SET preview_token = gen_random_uuid() WHERE preview_token IS NULL;

ALTER TABLE podcast_episodes
  ALTER COLUMN preview_token SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_preview_token ON podcast_episodes(preview_token);

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS lufs_integrated NUMERIC;

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS lufs_true_peak NUMERIC;

-- Revisions (snapshot-on-save)
CREATE TABLE IF NOT EXISTS content_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_revisions_content ON content_revisions(content_id, created_at DESC);

CREATE TABLE IF NOT EXISTS podcast_episode_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_podcast_episode_revisions_ep ON podcast_episode_revisions(episode_id, created_at DESC);

ALTER TABLE content_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_episode_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin content revisions" ON content_revisions;
CREATE POLICY "Admin content revisions" ON content_revisions
  FOR ALL TO authenticated
  USING (public.is_fitf_admin())
  WITH CHECK (public.is_fitf_admin());

DROP POLICY IF EXISTS "Admin episode revisions" ON podcast_episode_revisions;
CREATE POLICY "Admin episode revisions" ON podcast_episode_revisions
  FOR ALL TO authenticated
  USING (public.is_fitf_admin())
  WITH CHECK (public.is_fitf_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON content_revisions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_episode_revisions TO authenticated, service_role;

-- Tighten content writes: any authenticated user can no longer mutate CMS rows
DROP POLICY IF EXISTS "Allow admin full access on content" ON content;
DROP POLICY IF EXISTS "Allow admin full access" ON content;
DROP POLICY IF EXISTS "Allow authenticated users to read own drafts" ON content;

CREATE POLICY "Allow admin full access on content"
  ON content FOR ALL
  TO authenticated
  USING (public.is_fitf_admin())
  WITH CHECK (public.is_fitf_admin());

-- Keep published public reads
DROP POLICY IF EXISTS "Allow public read of published content" ON content;
CREATE POLICY "Allow public read of published content"
  ON content FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

COMMENT ON COLUMN content.identity_protection IS 'How a survivor is identified in this post';
COMMENT ON COLUMN podcast_episodes.consent_confirmed IS 'Required before publish; true also means no survivor identity in episode';
COMMENT ON COLUMN podcast_episodes.lufs_integrated IS 'Integrated loudness of mixdown (target −16 LUFS)';
