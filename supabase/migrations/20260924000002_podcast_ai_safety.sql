-- Podcast post-production & survivor safety (Stream D). Additive only.
-- Apply after 20260923000003_podcast_security.sql.
--
-- Nothing here stores protected names: the list of words staff bleep lives only in the
-- editor's memory for the session. We record *that* a review happened, by whom, and when.

ALTER TABLE podcast_episodes
  -- Browser-Whisper word timings: [{ "w": "word", "s": 1.23, "e": 1.61 }, …] (seconds).
  -- Drives transcript.vtt / transcript.srt when `transcript` is plain text.
  ADD COLUMN IF NOT EXISTS transcript_words JSONB,
  -- One-click revert after "Clean-up & safety" re-renders the audio.
  ADD COLUMN IF NOT EXISTS audio_url_previous TEXT,
  -- Previous transcript / words / chapters / duration / size / mime for that revert.
  ADD COLUMN IF NOT EXISTS post_edit_snapshot JSONB,
  -- Protected identities (names, towns, schools, workplaces) review.
  ADD COLUMN IF NOT EXISTS protected_words_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS protected_words_reviewed_by TEXT,
  -- Manual guest consent confirmation until guest-consent records are wired in
  -- (TODO: replace with getEpisodeConsents(episodeId) from lib/podcast/guest-consent.ts).
  ADD COLUMN IF NOT EXISTS guest_consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guest_consent_confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS guest_consent_confirmed_at TIMESTAMPTZ,
  -- The guest heard and approved this exact cut (audio URL pinned at approval time).
  ADD COLUMN IF NOT EXISTS guest_final_cut_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guest_final_cut_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS guest_final_cut_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guest_final_cut_audio_url TEXT;

COMMENT ON COLUMN podcast_episodes.transcript_words IS
  'Word-level timings from in-browser Whisper: [{w, s, e}] in seconds. Audio never leaves the browser.';
COMMENT ON COLUMN podcast_episodes.audio_url_previous IS
  'Audio before the last Clean-up & safety render (one-click revert). The old file may contain unredacted names.';
COMMENT ON COLUMN podcast_episodes.guest_final_cut_audio_url IS
  'audio_url the guest approved; approval is stale once audio_url changes.';

-- Guard rails on shape (cheap, no table scan beyond the ALTER).
ALTER TABLE podcast_episodes
  DROP CONSTRAINT IF EXISTS podcast_episodes_transcript_words_array;
ALTER TABLE podcast_episodes
  ADD CONSTRAINT podcast_episodes_transcript_words_array
  CHECK (transcript_words IS NULL OR jsonb_typeof(transcript_words) = 'array');

-- No new grants: admin routes use the service role; public readers never see these fields
-- except transcript_words indirectly through the caption routes.
