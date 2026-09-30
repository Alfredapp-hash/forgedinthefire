-- Podcast release path: loudness metadata, Podcasting 2.0 show fields, 3000px default art.
-- Additive only. Apply after 20260921_podcast_hardening.sql.
-- Chapters already live in podcast_episodes.chapters (JSONB: start_ms, title, url?, img?).

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS loudness_lufs REAL,
  ADD COLUMN IF NOT EXISTS loudness_peak_db REAL,
  ADD COLUMN IF NOT EXISTS audio_channels SMALLINT;

COMMENT ON COLUMN podcast_episodes.loudness_lufs IS
  'Integrated loudness of the hosted audio (target -16 LUFS stereo / -19 LUFS mono)';

ALTER TABLE podcast_shows
  ADD COLUMN IF NOT EXISTS podcast_guid TEXT,
  ADD COLUMN IF NOT EXISTS funding_url TEXT,
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN podcast_shows.podcast_guid IS
  'Optional <podcast:guid> override. Leave NULL to derive UUIDv5 from the feed URL.';

-- Feed + page queries filter on published episodes by release time
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_published_at
  ON podcast_episodes(published_at DESC)
  WHERE status = 'published';

-- The seeded show art was a 1024px JPEG named .png (Apple rejects < 1400px).
-- Point only that exact seed value at the 3000x3000 JPEG shipped in /public/podcast.
UPDATE podcast_shows
SET cover_url = 'https://forgedinthefireohio.org/podcast/cover-3000.jpg',
    updated_at = NOW()
WHERE cover_url = 'https://forgedinthefireohio.org/brand/fitf-lockup.png';

-- Public listings read these via the service role; nothing new granted to anon.
