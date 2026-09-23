-- Live shows (WHIP ingest from the browser control room).
-- Admin writes go through service-role API routes. Anon/authenticated may only
-- SELECT non-sensitive columns of scheduled or live rows (public viewer page).

CREATE TABLE IF NOT EXISTS podcast_live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES podcast_episodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  playback_hls_url TEXT,
  playback_whep_url TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_podcast_live_sessions_status
  ON podcast_live_sessions(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_podcast_live_sessions_episode
  ON podcast_live_sessions(episode_id);

-- At most one session may be live at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_podcast_live_sessions_one_live
  ON podcast_live_sessions((status)) WHERE status = 'live';

ALTER TABLE podcast_live_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON podcast_live_sessions FROM anon;
REVOKE ALL ON podcast_live_sessions FROM authenticated;

-- Column-level grant: episode_id, ended_at, created_by and timestamps stay private.
GRANT SELECT (
  id, title, description, status, scheduled_for, started_at,
  playback_hls_url, playback_whep_url, last_heartbeat_at
) ON podcast_live_sessions TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_live_sessions TO service_role;

DROP POLICY IF EXISTS "Public upcoming or live shows" ON podcast_live_sessions;
CREATE POLICY "Public upcoming or live shows" ON podcast_live_sessions
  FOR SELECT TO anon, authenticated
  USING (status IN ('scheduled', 'live'));

COMMENT ON TABLE podcast_live_sessions IS
  'Live show schedule + on-air state. Ingest is WHIP from the admin browser; playback URLs are public (HLS/WHEP). Service role writes only.';
