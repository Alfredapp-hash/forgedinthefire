-- Podcast post-production & survivor safety (Sprint 1, streams B + D reconciled). Additive and
-- idempotent: safe to run more than once. Apply after 20260924000001_podcast_guest_v2.sql.
--
-- Two kinds of data live here:
--   1. Sign-offs on podcast_episodes (who reviewed what, when, and for which audio file). These
--      carry no names — just that a review happened. Public routes never select them.
--   2. podcast_episode_safety — the working plan: the list of protected names/places, and every
--      accept/reject decision staff made. Private production data: RLS admin-only, no anon or
--      authenticated grants beyond admins, never joined by public routes or the feed.
--   3. A release gate trigger that mirrors the checklist so no path (API, SQL editor, another
--      admin screen) can move a guest episode into release without the guest's approval of
--      this exact audio file and a protected-terms review.

-- ────────────────────────────────────────────────────────────────────────────
-- 0. Prerequisites this file would otherwise inherit from sibling sprint migrations
--    (20260923000003_podcast_security.sql → is_admin(); 20260924000001_podcast_guest_v2.sql →
--    guest_review_required). Both are created only when missing, so applying those files
--    before or after this one is harmless.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    -- Is the CURRENT signed-in user an admin/owner? Mirrors the email-based is_admin(TEXT)
    -- from 20240528_admin_users_schema.sql for RLS policies.
    CREATE FUNCTION public.is_admin()
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
      SELECT EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          AND au.role IN ('admin', 'owner')
      )
    $fn$;
    REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
    GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
  END IF;
END
$$;

ALTER TABLE public.podcast_episodes
  ADD COLUMN IF NOT EXISTS guest_review_required BOOLEAN NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Episode columns
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.podcast_episodes
  -- Browser-Whisper word timings: [{ "w": "word", "s": 1.23, "e": 1.61 }, …] (seconds).
  -- Drives transcript.vtt / transcript.srt when `transcript` is plain text.
  ADD COLUMN IF NOT EXISTS transcript_words JSONB,
  -- One-click revert after "Clean-up & safety" re-renders the audio. The previous file may
  -- contain unredacted names: the editor offers to delete it once the safe version is in use.
  ADD COLUMN IF NOT EXISTS audio_url_previous TEXT,
  -- Previous transcript / words / chapters / duration / size / mime for that revert.
  ADD COLUMN IF NOT EXISTS post_edit_snapshot JSONB,
  -- SHA-256 of the current audio file, recorded when a guest approval is taken.
  ADD COLUMN IF NOT EXISTS audio_sha256 TEXT,
  -- Protected identities (names, towns, schools, workplaces) review.
  ADD COLUMN IF NOT EXISTS protected_words_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS protected_words_reviewed_by TEXT,
  -- Someone read the final transcript; hash of the text they read (any edit needs a re-read).
  ADD COLUMN IF NOT EXISTS transcript_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transcript_reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS transcript_reviewed_hash TEXT,
  -- Manual guest consent confirmation (paper release) — booth consent lives in podcast_consents.
  ADD COLUMN IF NOT EXISTS guest_consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guest_consent_confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS guest_consent_confirmed_at TIMESTAMPTZ,
  -- The guest heard and approved this exact cut: date, how they told us, and the file
  -- (URL + SHA-256) pinned at approval time. A new file needs a new approval.
  ADD COLUMN IF NOT EXISTS guest_final_cut_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guest_final_cut_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS guest_final_cut_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guest_final_cut_approved_on DATE,
  ADD COLUMN IF NOT EXISTS guest_final_cut_method TEXT,
  ADD COLUMN IF NOT EXISTS guest_final_cut_note TEXT,
  ADD COLUMN IF NOT EXISTS guest_final_cut_audio_url TEXT,
  ADD COLUMN IF NOT EXISTS guest_final_cut_audio_hash TEXT;

COMMENT ON COLUMN public.podcast_episodes.transcript_words IS
  'Word-level timings from in-browser Whisper: [{w, s, e}] in seconds. Audio never leaves the browser.';
COMMENT ON COLUMN public.podcast_episodes.audio_url_previous IS
  'Audio before the last Clean-up & safety render (one-click revert). May contain unredacted names; deletable from the editor.';
COMMENT ON COLUMN public.podcast_episodes.guest_final_cut_audio_url IS
  'audio_url the guest approved; approval is stale once audio_url changes.';
COMMENT ON COLUMN public.podcast_episodes.guest_final_cut_audio_hash IS
  'SHA-256 of the approved audio file, computed server-side when the approval was recorded.';
COMMENT ON COLUMN public.podcast_episodes.transcript_reviewed_hash IS
  'FNV-1a of the transcript text that was reviewed (lib/podcast/safety/record.ts textHash).';

ALTER TABLE public.podcast_episodes
  DROP CONSTRAINT IF EXISTS podcast_episodes_transcript_words_array;
ALTER TABLE public.podcast_episodes
  ADD CONSTRAINT podcast_episodes_transcript_words_array
  CHECK (transcript_words IS NULL OR jsonb_typeof(transcript_words) = 'array');

ALTER TABLE public.podcast_episodes
  DROP CONSTRAINT IF EXISTS podcast_episodes_guest_final_cut_method_check;
ALTER TABLE public.podcast_episodes
  ADD CONSTRAINT podcast_episodes_guest_final_cut_method_check
  CHECK (guest_final_cut_method IS NULL OR guest_final_cut_method IN
    ('listened_in_person', 'listened_remotely', 'sent_file', 'written', 'other'));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Working plan (protected terms + decisions) — private
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.podcast_episode_safety (
  episode_id UUID PRIMARY KEY REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  -- [{ text, kind: name|place|employer|street|number|other }]
  protected_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { "<term>@<startMs>": "accept" | "reject" }
  term_decisions JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { "<kind>@<startMs>": "accept" | "reject" }  (filler / repeat / pause suggestions)
  filler_decisions JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { mode, pad, manual: [{start,end}], disguise: [{start,end,preset}], filler_words, include_pauses }
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

COMMENT ON TABLE public.podcast_episode_safety IS
  'Per-episode Clean-up & safety working plan: protected names/places and staff decisions. Admin-only; never published.';
COMMENT ON COLUMN public.podcast_episode_safety.protected_terms IS
  'Names, places, employers, streets and other identifying details staff asked to find and cover. Never published.';

ALTER TABLE public.podcast_episode_safety ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin podcast episode safety" ON public.podcast_episode_safety;
CREATE POLICY "Admin podcast episode safety" ON public.podcast_episode_safety
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.podcast_episode_safety FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_episode_safety TO authenticated;
GRANT ALL ON public.podcast_episode_safety TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Release gate (mirrors lib/podcast/safety/checklist.ts)
-- ────────────────────────────────────────────────────────────────────────────
-- Fires when an episode moves INTO release (draft/review → scheduled/published). The cron's
-- scheduled → published step and edits to live episodes are not re-checked. A guest is on the
-- episode when it names one, is flagged for guest review, or has booth consent records.
CREATE OR REPLACE FUNCTION public.podcast_require_guest_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_guest BOOLEAN;
  withdrawn BOOLEAN := FALSE;
BEGIN
  IF NEW.status NOT IN ('scheduled', 'published') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('scheduled', 'published') THEN
    RETURN NEW;
  END IF;

  has_guest := COALESCE(btrim(NEW.guest_name), '') <> '' OR COALESCE(NEW.guest_review_required, FALSE);
  IF to_regclass('public.podcast_consents') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.podcast_consents WHERE episode_id = $1), '
         || 'EXISTS (SELECT 1 FROM public.podcast_consents WHERE episode_id = $1 AND withdrawn_at IS NOT NULL)'
      INTO has_guest, withdrawn USING NEW.id;
    has_guest := has_guest OR COALESCE(btrim(NEW.guest_name), '') <> '' OR COALESCE(NEW.guest_review_required, FALSE);
  END IF;

  IF NOT has_guest THEN
    RETURN NEW;
  END IF;

  IF withdrawn THEN
    RAISE EXCEPTION 'A guest withdrew consent. Do not release this episode — talk to the guest and your safeguarding lead first.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(NEW.guest_review_required, FALSE) THEN
    RAISE EXCEPTION 'This episode is flagged for guest review. Resolve it with the guest before release.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT COALESCE(NEW.guest_final_cut_approved, FALSE)
     OR NEW.guest_final_cut_approved_on IS NULL
     OR NEW.guest_final_cut_method IS NULL THEN
    RAISE EXCEPTION 'Guest approval required: record the date and how the guest approved the final cut before releasing.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.guest_final_cut_audio_url IS DISTINCT FROM NEW.audio_url THEN
    RAISE EXCEPTION 'Guest approval is for a different audio file. Play the guest the current version and record their approval again.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.guest_final_cut_audio_hash IS NOT NULL AND NEW.audio_sha256 IS NOT NULL
     AND NEW.guest_final_cut_audio_hash <> NEW.audio_sha256 THEN
    RAISE EXCEPTION 'Guest approval is for a different audio file (fingerprint changed). Record their approval again.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.protected_words_reviewed_at IS NULL THEN
    RAISE EXCEPTION 'Protected terms not reviewed: search the transcript for names and places and bleep every mention before releasing.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(btrim(NEW.transcript), '') <> ''
     AND NEW.transcript_reviewed_hash IS NULL THEN
    RAISE EXCEPTION 'Transcript not reviewed: read the transcript and press "Mark transcript reviewed" before releasing.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.podcast_require_guest_approval() FROM PUBLIC;

DROP TRIGGER IF EXISTS podcast_require_guest_approval ON public.podcast_episodes;
CREATE TRIGGER podcast_require_guest_approval
  BEFORE INSERT OR UPDATE OF status ON public.podcast_episodes
  FOR EACH ROW EXECUTE FUNCTION public.podcast_require_guest_approval();

-- No new grants on podcast_episodes: admin routes use the service role; public readers never
-- select these columns except transcript_words indirectly through the caption routes.
