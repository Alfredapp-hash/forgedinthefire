-- Temporary guest-portal invites for the production room.
-- Raw token is never stored; APIs look up sha256(token). Service role only.

CREATE TABLE IF NOT EXISTS podcast_guest_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  guest_name TEXT,
  guest_joined_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  connection_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (connection_state IN ('pending', 'joined', 'connected', 'recording', 'left')),
  take_url TEXT,
  take_mime TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_podcast_guest_invites_episode
  ON podcast_guest_invites(episode_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_guest_invites_hash
  ON podcast_guest_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_podcast_guest_invites_expires
  ON podcast_guest_invites(expires_at);

CREATE TABLE IF NOT EXISTS podcast_guest_signals (
  id BIGSERIAL PRIMARY KEY,
  invite_id UUID NOT NULL REFERENCES podcast_guest_invites(id) ON DELETE CASCADE,
  from_role TEXT NOT NULL CHECK (from_role IN ('admin', 'guest')),
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_podcast_guest_signals_invite
  ON podcast_guest_signals(invite_id, id);

ALTER TABLE podcast_guest_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_guest_signals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON podcast_guest_invites FROM anon;
REVOKE ALL ON podcast_guest_invites FROM authenticated;
REVOKE ALL ON podcast_guest_signals FROM anon;
REVOKE ALL ON podcast_guest_signals FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_guest_invites TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_guest_signals TO service_role;
GRANT USAGE, SELECT ON SEQUENCE podcast_guest_signals_id_seq TO service_role;

COMMENT ON TABLE podcast_guest_invites IS 'Hashed, expiring guest-portal tokens. Raw link lives only with the admin who copied it.';
COMMENT ON TABLE podcast_guest_signals IS 'HTTP signaling for one admin↔guest WebRTC pair. Not a multi-guest SFU.';
