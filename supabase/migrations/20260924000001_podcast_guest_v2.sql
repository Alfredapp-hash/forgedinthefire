-- Podcast guest v2: progressive (chunked) guest backups, consent record v2,
-- guest withdrawal flag. Apply after 20260923000003_podcast_security.sql.
-- Additive only: no existing column changes type, nothing is dropped.

-- ============================================================
-- 1. Guest backup bucket: accept WAV + allow chunked objects
--    Every guest backup is now a series of <= 50 MB objects (10 s MediaRecorder
--    slices, or 8 MB slices of a WAV fallback). The per-take total (2 GB) is
--    enforced by the take API, not the bucket.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'podcast-guest-takes',
  'podcast-guest-takes',
  false,
  52428800,
  ARRAY[
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a',
    'audio/wav', 'audio/x-wav', 'audio/wave',
    'video/webm', 'video/mp4'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- 2. Chunked guest takes (one row per record-on .. record-off, per kind)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.podcast_guest_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID NOT NULL REFERENCES public.podcast_guest_invites(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('audio', 'camera')),
  mime TEXT NOT NULL,
  ext TEXT NOT NULL CHECK (ext IN ('webm', 'ogg', 'm4a', 'mp4', 'wav')),
  status TEXT NOT NULL DEFAULT 'recording' CHECK (status IN ('recording', 'complete', 'abandoned')),
  -- Host session clock (seconds) sent with the record-on signal.
  session_sec DOUBLE PRECISION,
  -- Host wall clock (epoch ms) at session_sec.
  host_at_ms BIGINT,
  -- Where the first sample of this take sits on the host session clock.
  started_at_session_sec DOUBLE PRECISION,
  -- Guest recorder start converted to the host clock (epoch ms), and the RTT of that estimate.
  guest_start_host_ms BIGINT,
  clock_rtt_ms INTEGER,
  duration_sec DOUBLE PRECISION,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_podcast_guest_takes_invite
  ON public.podcast_guest_takes(invite_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_guest_takes_episode
  ON public.podcast_guest_takes(episode_id, created_at DESC);

ALTER TABLE public.podcast_guest_takes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.podcast_guest_takes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_guest_takes TO service_role;

COMMENT ON TABLE public.podcast_guest_takes IS
  'Guest backup takes uploaded progressively as chunk objects in podcast-guest-takes/guest-takes/<invite>/t-<take>/NNNNNN.<ext>. Service role only.';

-- ============================================================
-- 3. Consent record v2 (append-only; service role only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.podcast_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID REFERENCES public.podcast_guest_invites(id) ON DELETE SET NULL,
  episode_id UUID NOT NULL,
  consent_version TEXT NOT NULL,
  consent_text_hash TEXT NOT NULL,
  -- { audio_only, voice_altered, face_blurred, first_name_only, may_publish } (all boolean)
  choices JSONB NOT NULL DEFAULT '{}'::jsonb,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  withdraw_reason TEXT CHECK (withdraw_reason IS NULL OR char_length(withdraw_reason) <= 1000),
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_podcast_consents_episode
  ON public.podcast_consents(episode_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_consents_invite
  ON public.podcast_consents(invite_id, accepted_at DESC);

ALTER TABLE public.podcast_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.podcast_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.podcast_consents TO service_role;

COMMENT ON TABLE public.podcast_consents IS
  'Guest consent choices per booth join (v2). Never exposed to anon/authenticated; read via admin API or getEpisodeConsents().';

-- ============================================================
-- 4. Episode flag: a guest withdrew (or changed) consent -> needs review
-- ============================================================

ALTER TABLE public.podcast_episodes
  ADD COLUMN IF NOT EXISTS guest_review_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.podcast_episodes.guest_review_required IS
  'Set when a guest withdraws consent from the booth. Release checklist must block publishing until a human clears it.';
