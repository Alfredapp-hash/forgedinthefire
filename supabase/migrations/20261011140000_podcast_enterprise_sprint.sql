-- Enterprise sprint: re-check guest approval after release, private media bucket,
-- server-only analytics, staff audit log, safeguarding role, retention targets.
-- Idempotent. Does not re-open the wide policies from 20260918_podcast_enterprise.sql.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Guest approval stays pinned after the episode is scheduled or published
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.podcast_require_guest_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_guest BOOLEAN;
  withdrawn BOOLEAN := FALSE;
  sensitive_change BOOLEAN := FALSE;
BEGIN
  IF NEW.status NOT IN ('scheduled', 'published') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('scheduled', 'published') THEN
    sensitive_change :=
      OLD.audio_url IS DISTINCT FROM NEW.audio_url
      OR OLD.audio_sha256 IS DISTINCT FROM NEW.audio_sha256
      OR OLD.transcript IS DISTINCT FROM NEW.transcript
      OR OLD.guest_name IS DISTINCT FROM NEW.guest_name
      OR OLD.guest_review_required IS DISTINCT FROM NEW.guest_review_required
      OR OLD.guest_final_cut_approved IS DISTINCT FROM NEW.guest_final_cut_approved
      OR OLD.guest_final_cut_audio_url IS DISTINCT FROM NEW.guest_final_cut_audio_url
      OR OLD.guest_final_cut_audio_hash IS DISTINCT FROM NEW.guest_final_cut_audio_hash
      OR OLD.protected_words_reviewed_at IS DISTINCT FROM NEW.protected_words_reviewed_at
      OR OLD.transcript_reviewed_hash IS DISTINCT FROM NEW.transcript_reviewed_hash;
    IF NOT sensitive_change THEN
      RETURN NEW;
    END IF;
    -- A transcript edit has to record a new review in the same write.
    IF OLD.transcript IS DISTINCT FROM NEW.transcript
       AND coalesce(btrim(NEW.transcript), '') <> ''
       AND NEW.transcript_reviewed_hash IS NOT DISTINCT FROM OLD.transcript_reviewed_hash THEN
      RAISE EXCEPTION 'Transcript changed after review. Read it again and mark it reviewed before this version can stay scheduled or published.'
        USING ERRCODE = 'check_violation';
    END IF;
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
  BEFORE INSERT OR UPDATE ON public.podcast_episodes
  FOR EACH ROW EXECUTE FUNCTION public.podcast_require_guest_approval();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Safeguarding role (review sign-offs; not a producer and not an owner)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('owner', 'admin', 'safeguarding'));

CREATE OR REPLACE FUNCTION public.is_podcast_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users a
    WHERE a.email = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      AND a.role IN ('admin', 'owner', 'safeguarding')
  );
$$;

REVOKE ALL ON FUNCTION public.is_podcast_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_podcast_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_podcast_staff() TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Append-only audit log. Writes are service-role only.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.podcast_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email TEXT,
  action TEXT NOT NULL,
  episode_id UUID,
  summary TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_podcast_audit_log_occurred
  ON public.podcast_audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_audit_log_episode
  ON public.podcast_audit_log (episode_id, occurred_at DESC);

ALTER TABLE public.podcast_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.podcast_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.podcast_audit_log TO authenticated;
GRANT SELECT, INSERT ON public.podcast_audit_log TO service_role;

DROP POLICY IF EXISTS "Staff read podcast audit" ON public.podcast_audit_log;
CREATE POLICY "Staff read podcast audit" ON public.podcast_audit_log
  FOR SELECT TO authenticated
  USING (public.is_podcast_staff());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Analytics inserts are server-only. The summary is computed in SQL so the
--    desk is not capped at a few thousand rows.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Insert podcast analytics" ON public.podcast_analytics_events;
REVOKE INSERT ON public.podcast_analytics_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.podcast_analytics_summary(p_since TIMESTAMPTZ, p_show UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH events AS (
    SELECT *
    FROM public.podcast_analytics_events
    WHERE occurred_at >= p_since
      AND (p_show IS NULL OR show_id = p_show)
  ),
  by_day AS (
    SELECT to_char(occurred_at AT TIME ZONE 'utc', 'YYYY-MM-DD') AS date, count(*)::int AS count
    FROM events
    GROUP BY 1
    ORDER BY 1
  ),
  by_app AS (
    SELECT coalesce(nullif(app_name, ''), 'Unknown') AS name, count(*)::int AS count
    FROM events
    GROUP BY 1
    ORDER BY count(*) DESC, name
  ),
  by_country AS (
    SELECT coalesce(nullif(country, ''), 'Unknown') AS name, count(*)::int AS count
    FROM events
    GROUP BY 1
    ORDER BY count(*) DESC, name
  ),
  episode_compare AS (
    SELECT
      e.id,
      e.title,
      e.season,
      e.episode_number,
      e.published_at,
      (
        SELECT count(DISTINCT ev.listener_hash)::int
        FROM events ev
        WHERE ev.episode_id = e.id
          AND ev.event_type = 'download'
          AND ev.listener_hash IS NOT NULL
      ) AS downloads,
      (
        SELECT count(*)::int
        FROM events ev
        WHERE ev.episode_id = e.id
          AND ev.event_type IN ('play', 'embed_play')
      ) AS plays
    FROM public.podcast_episodes e
    WHERE p_show IS NULL OR e.show_id = p_show
    ORDER BY downloads DESC, e.published_at DESC NULLS LAST
    LIMIT 50
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM events),
    'downloads', (
      SELECT count(DISTINCT listener_hash)::int
      FROM events
      WHERE event_type = 'download' AND listener_hash IS NOT NULL
    ),
    'plays', (
      SELECT count(*)::int FROM events WHERE event_type IN ('play', 'embed_play')
    ),
    'by_day', coalesce((SELECT jsonb_agg(jsonb_build_object('date', date, 'count', count) ORDER BY date) FROM by_day), '[]'::jsonb),
    'by_app', coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'count', count) ORDER BY count DESC, name) FROM by_app), '[]'::jsonb),
    'by_country', coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'count', count) ORDER BY count DESC, name) FROM by_country), '[]'::jsonb),
    'episode_compare', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'title', title,
        'season', season,
        'episode_number', episode_number,
        'published_at', published_at,
        'downloads', downloads,
        'plays', plays
      ) ORDER BY downloads DESC, published_at DESC NULLS LAST)
      FROM episode_compare
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.podcast_analytics_summary(TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.podcast_analytics_summary(TIMESTAMPTZ, UUID) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Private episode files. No anon/authenticated policies: service role only.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'podcast-private',
  'podcast-private',
  FALSE,
  536870912,
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/webm', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. What the hourly job is allowed to delete.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.podcast_retention_targets()
RETURNS TABLE (kind TEXT, object_bucket TEXT, object_name TEXT, episode_id UUID, media_url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
  SELECT 'guest_take', o.bucket_id, o.name, NULL::uuid, NULL::text
  FROM storage.objects o
  JOIN public.podcast_guest_invites i
    ON o.name LIKE 'guest-takes/' || i.id::text || '/%'
  WHERE o.bucket_id = 'podcast-guest-takes'
    AND coalesce(i.revoked_at, i.expires_at) < now() - interval '14 days'
  UNION ALL
  SELECT 'previous_audio', NULL::text, NULL::text, e.id, e.audio_url_previous
  FROM public.podcast_episodes e
  WHERE e.audio_url_previous IS NOT NULL
    AND e.status = 'published'
    AND e.published_at IS NOT NULL
    AND e.published_at < now() - interval '14 days'
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.podcast_retention_targets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.podcast_retention_targets() TO service_role;
