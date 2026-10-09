-- Podcast guest v2, part 2: resumable (TUS) backup uploads, 2 GB objects,
-- withdrawal contact. Apply after 20260924000001_podcast_guest_v2.sql.
-- Idempotent and additive: nothing is dropped, no column changes type.
--
-- Tables/columns this builds on (all created by 20260924000001):
--   storage.buckets 'podcast-guest-takes'   (private, per-object size cap, allowed MIME types)
--   public.podcast_guest_takes              (one row per progressive take; service role only)
--   public.podcast_consents                 (consent v2, append-only; withdrawn_at / withdraw_reason)
--   public.podcast_episodes.guest_review_required

-- ============================================================
-- 1. Guest bucket: per-object cap 2 GB, accept every WAV MIME spelling
--    The booth uploads one object per ~10 s slice (Opus/AAC) and 8 MB slices
--    of a WAV fallback; large slices (>= 6 MB) go through the resumable TUS
--    endpoint with a per-object signed token. The per-take total (2 GB) is
--    still enforced by /api/studio/guest/[token]/take/chunks at finish.
--    NOTE: the project-wide "Upload file size limit" (Dashboard -> Storage ->
--    Settings) also applies and must be >= the largest single object you expect
--    (2 GB for a long camera backup).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'podcast-guest-takes',
  'podcast-guest-takes',
  false,
  2147483648,
  ARRAY[
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a',
    'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
    'video/webm', 'video/mp4'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Still no storage.objects policies for this bucket: anon/authenticated cannot
-- read or write it. The server mints single-object signed upload tokens (PUT
-- URL or TUS x-signature) and short-lived signed download URLs; the service key
-- never reaches the browser.

-- ============================================================
-- 2. Withdrawal: how the guest asked to be reached (optional free text)
-- ============================================================

ALTER TABLE public.podcast_consents
  ADD COLUMN IF NOT EXISTS withdraw_contact TEXT
    CHECK (withdraw_contact IS NULL OR char_length(withdraw_contact) <= 200);

COMMENT ON COLUMN public.podcast_consents.withdraw_contact IS
  'Optional contact the guest left with their withdrawal (email, phone, or "do not contact me"). Set only by /api/studio/guest/[token]/withdraw.';

-- ============================================================
-- 3. Guest takes: index for the host's "newest takes for this episode" view
--    (already created by 20260924000001; repeated here so a partial apply is safe)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_podcast_guest_takes_episode
  ON public.podcast_guest_takes(episode_id, created_at DESC);
