-- Survivor-safety / content-advisory fields for podcast episodes.
-- Blog advisories live in content.seo jsonb (no schema change).

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS content_warning TEXT,
  ADD COLUMN IF NOT EXISTS graphic_detail_reviewed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identifying_info_reviewed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_public_advisory BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN podcast_episodes.content_warning IS 'Public trauma/content advisory shown on the episode page when show_public_advisory is true';
