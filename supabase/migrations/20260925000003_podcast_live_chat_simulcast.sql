-- Live show sprint 2: viewer chat / Q&A + simulcast destinations.
--
-- Chat: podcast_live_messages (public read of visible messages on live shows via RLS;
-- every INSERT/UPDATE goes through server routes with the service role). Viewer identity is a
-- salted hash of a per-browser id — never an IP, never the raw id. Bans are per show + viewer hash.
-- Simulcast: podcast_live_destinations holds RTMP(S)/WHIP targets encrypted at rest
-- (AES-256-GCM, key derived server-side); the anon/authenticated roles have no access at all.

-- ============================================================
-- 1. Chat settings on the session (chat is OFF until the host turns it on)
-- ============================================================

ALTER TABLE podcast_live_sessions
  ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_mode TEXT NOT NULL DEFAULT 'all'
    CHECK (chat_mode IN ('all', 'questions')),
  ADD COLUMN IF NOT EXISTS chat_slow_mode_sec INTEGER NOT NULL DEFAULT 0
    CHECK (chat_slow_mode_sec BETWEEN 0 AND 600),
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID;

GRANT SELECT (chat_enabled, chat_mode, chat_slow_mode_sec, pinned_message_id)
  ON podcast_live_sessions TO anon, authenticated;

-- ============================================================
-- 2. Messages
-- ============================================================

CREATE TABLE IF NOT EXISTS podcast_live_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES podcast_live_sessions(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 24),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
  kind TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'question')),
  -- sha256 of the per-browser viewer id with a server salt (hex, 32 chars). Never exposed publicly.
  viewer_hash TEXT NOT NULL CHECK (char_length(viewer_hash) BETWEEN 8 AND 64),
  hidden BOOLEAN NOT NULL DEFAULT false,
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_podcast_live_messages_session_created
  ON podcast_live_messages(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_live_messages_viewer
  ON podcast_live_messages(session_id, viewer_hash);

ALTER TABLE podcast_live_sessions
  DROP CONSTRAINT IF EXISTS podcast_live_sessions_pinned_message_fk;
ALTER TABLE podcast_live_sessions
  ADD CONSTRAINT podcast_live_sessions_pinned_message_fk
  FOREIGN KEY (pinned_message_id) REFERENCES podcast_live_messages(id) ON DELETE SET NULL;

ALTER TABLE podcast_live_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON podcast_live_messages FROM anon, authenticated;
-- Public columns only: no viewer_hash, no flag details.
GRANT SELECT (id, session_id, display_name, body, kind, hidden, created_at)
  ON podcast_live_messages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_live_messages TO service_role;

DROP POLICY IF EXISTS "Public visible messages on live shows" ON podcast_live_messages;
CREATE POLICY "Public visible messages on live shows" ON podcast_live_messages
  FOR SELECT TO anon, authenticated
  USING (
    hidden = false
    AND EXISTS (
      SELECT 1 FROM podcast_live_sessions s
      WHERE s.id = podcast_live_messages.session_id AND s.status = 'live'
    )
  );

-- Realtime: viewers subscribe to INSERTs (RLS above applies to the subscriber);
-- moderation events (hide / pin / settings) are sent as broadcasts by the server.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'podcast_live_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.podcast_live_messages;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE podcast_live_messages IS
  'Live show chat / Q&A. Inserted only by the server route (filtered + rate limited). viewer_hash is a salted hash of a per-browser id.';

-- ============================================================
-- 3. Bans (per show, per viewer hash; server-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS podcast_live_bans (
  session_id UUID NOT NULL REFERENCES podcast_live_sessions(id) ON DELETE CASCADE,
  viewer_hash TEXT NOT NULL,
  reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, viewer_hash)
);

ALTER TABLE podcast_live_bans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON podcast_live_bans FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_live_bans TO service_role;

-- ============================================================
-- 4. Simulcast destinations (encrypted at rest, server-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS podcast_live_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('youtube', 'facebook', 'custom')),
  protocol TEXT NOT NULL DEFAULT 'rtmps' CHECK (protocol IN ('rtmp', 'rtmps', 'whip')),
  -- AES-256-GCM sealed (base64url iv|tag|ciphertext). The URL can itself carry a key (WHIP), so both are sealed.
  url_enc TEXT NOT NULL,
  key_enc TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- Provider-side restream handle (Cloudflare Live Output uid) while a show is on air.
  provider_output_id TEXT,
  state TEXT NOT NULL DEFAULT 'idle'
    CHECK (state IN ('idle', 'queued', 'live', 'failed', 'disabled', 'unsupported')),
  state_detail TEXT,
  last_checked_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE podcast_live_destinations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON podcast_live_destinations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_live_destinations TO service_role;

COMMENT ON TABLE podcast_live_destinations IS
  'Simulcast targets (YouTube / Facebook / custom RTMP(S) or WHIP). url_enc/key_enc are AES-GCM sealed with LIVE_DESTINATION_SECRET; the browser only ever gets masked values.';

-- ============================================================
-- 5. Chat retention: messages are for the show, not a record. Purge after 30 days.
-- ============================================================

CREATE OR REPLACE FUNCTION public.podcast_live_chat_purge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.podcast_live_messages WHERE created_at < now() - interval '30 days';
  DELETE FROM public.podcast_live_bans WHERE created_at < now() - interval '30 days';
END;
$$;

REVOKE ALL ON FUNCTION public.podcast_live_chat_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.podcast_live_chat_purge() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'podcast-live-chat-purge';
    PERFORM cron.schedule('podcast-live-chat-purge', '23 3 * * *', 'SELECT public.podcast_live_chat_purge()');
  END IF;
END $$;
