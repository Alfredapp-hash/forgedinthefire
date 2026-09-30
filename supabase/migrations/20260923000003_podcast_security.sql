-- Podcast guest booth + admin RLS hardening.
-- Apply after 20260922_podcast_guest_invites.sql and 20260922_podcast_guest_camera_backup.sql.
-- Idempotent: safe to run more than once.

-- ============================================================
-- 1. Admin helpers: SECURITY DEFINER, fixed search_path, no recursion
-- ============================================================

-- Normalize stored admin emails once (skip rows whose lowercase form already exists).
UPDATE public.admin_users a
SET email = lower(trim(a.email))
WHERE a.email <> lower(trim(a.email))
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_users b WHERE b.email = lower(trim(a.email)) AND b.id <> a.id
  );

CREATE OR REPLACE FUNCTION public.admin_users_normalize_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_users_normalize_email ON public.admin_users;
CREATE TRIGGER admin_users_normalize_email
  BEFORE INSERT OR UPDATE OF email ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.admin_users_normalize_email();

-- is_admin(): is the CURRENT signed-in user an admin/owner?
-- SECURITY DEFINER so policies on admin_users can call it without re-entering RLS.
CREATE OR REPLACE FUNCTION public.is_admin()
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
      AND a.role IN ('admin', 'owner')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- Legacy is_admin(email) was SECURITY DEFINER with no search_path and callable by anon:
-- an oracle for "is this address an admin?". Pin search_path and restrict to service_role.
CREATE OR REPLACE FUNCTION public.is_admin(user_email TEXT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email = lower(trim(coalesce(user_email, '')))
      AND role IN ('admin', 'owner')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.is_admin(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(TEXT) TO service_role;

-- ============================================================
-- 2. admin_users: a signed-in user sees only their own row
-- ============================================================

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public to check admin status" ON public.admin_users;
DROP POLICY IF EXISTS "Allow admin full access on admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow owner full access on admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow select for auth" ON public.admin_users;
DROP POLICY IF EXISTS "Allow owner modify" ON public.admin_users;
DROP POLICY IF EXISTS "Allow owners modify" ON public.admin_users;
DROP POLICY IF EXISTS "anon_can_read_admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "auth_can_read_admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_select_own" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_admin_manage" ON public.admin_users;

CREATE POLICY "admin_users_select_own" ON public.admin_users
  FOR SELECT TO authenticated
  USING (email = lower(trim(coalesce(auth.jwt() ->> 'email', ''))));

-- Admins manage the table (admin UI uses the service role; this keeps SQL-editor/JWT paths working).
CREATE POLICY "admin_users_admin_manage" ON public.admin_users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON public.admin_users FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

-- ============================================================
-- 3. Podcast/studio tables: "any signed-in user" -> admins only
--    (public read policies for published content are unchanged)
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.podcast_episodes') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admin podcast episodes" ON public.podcast_episodes;
    CREATE POLICY "Admin podcast episodes" ON public.podcast_episodes
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.podcast_shows') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admin podcast shows" ON public.podcast_shows;
    CREATE POLICY "Admin podcast shows" ON public.podcast_shows
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.podcast_distribution') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admin read podcast distribution" ON public.podcast_distribution;
    CREATE POLICY "Admin read podcast distribution" ON public.podcast_distribution
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;

  IF to_regclass('public.content_topics') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admin content topics" ON public.content_topics;
    CREATE POLICY "Admin content topics" ON public.content_topics
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.studio_clips') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admin studio clips" ON public.studio_clips;
    CREATE POLICY "Admin studio clips" ON public.studio_clips
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.studio_templates') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admin studio templates" ON public.studio_templates;
    CREATE POLICY "Admin studio templates" ON public.studio_templates
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.media_assets') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admin media assets" ON public.media_assets;
    CREATE POLICY "Admin media assets" ON public.media_assets
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ============================================================
-- 4. Guest invites: single device session, consent record
-- ============================================================

ALTER TABLE public.podcast_guest_invites
  ADD COLUMN IF NOT EXISTS guest_session_hash TEXT,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audio_only BOOLEAN;

COMMENT ON COLUMN public.podcast_guest_invites.guest_session_hash IS
  'sha256 of the booth device session minted at Join. One active device per invite.';
COMMENT ON COLUMN public.podcast_guest_invites.consent_at IS
  'When the guest accepted the recording notice (who records, may be published, can leave).';
COMMENT ON COLUMN public.podcast_guest_invites.audio_only IS
  'Guest chose audio only on the consent step.';

-- Still service-role only (re-assert in case grants drifted).
REVOKE ALL ON public.podcast_guest_invites FROM anon, authenticated;
REVOKE ALL ON public.podcast_guest_signals FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_podcast_guest_signals_created
  ON public.podcast_guest_signals(created_at);

-- ============================================================
-- 5. Signal TTL / cleanup (SDP + ICE rows carry IP candidates)
-- ============================================================

CREATE OR REPLACE FUNCTION public.podcast_guest_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.podcast_guest_signals
  WHERE created_at < now() - interval '6 hours';

  DELETE FROM public.podcast_guest_signals s
  USING public.podcast_guest_invites i
  WHERE s.invite_id = i.id
    AND (i.revoked_at IS NOT NULL OR i.expires_at < now());

  UPDATE public.podcast_guest_invites
  SET guest_session_hash = NULL
  WHERE guest_session_hash IS NOT NULL
    AND (revoked_at IS NOT NULL OR expires_at < now());

  DELETE FROM public.api_rate_limits
  WHERE window_start < now() - interval '1 day';
END;
$$;

-- ============================================================
-- 6. Rate limiting for public token routes (fixed window, hashed keys only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.api_rate_limit_hit(p_bucket TEXT, p_window_seconds INTEGER, p_max INTEGER)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  w TIMESTAMPTZ;
  n INTEGER;
BEGIN
  IF p_bucket IS NULL OR length(p_bucket) > 200 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RETURN false;
  END IF;
  w := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.api_rate_limits AS r (bucket, window_start, hits)
  VALUES (p_bucket, w, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING hits INTO n;
  IF random() < 0.005 THEN
    DELETE FROM public.api_rate_limits WHERE window_start < now() - interval '1 day';
  END IF;
  RETURN n <= p_max;
END;
$$;

-- podcast_guest_cleanup references api_rate_limits, so (re)create it now that the table exists.
REVOKE ALL ON FUNCTION public.podcast_guest_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.podcast_guest_cleanup() TO service_role;
REVOKE ALL ON FUNCTION public.api_rate_limit_hit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_rate_limit_hit(TEXT, INTEGER, INTEGER) TO service_role;

-- Hourly sweep when pg_cron is enabled (otherwise the invite API runs it opportunistically).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'podcast-guest-cleanup';
    PERFORM cron.schedule('podcast-guest-cleanup', '17 * * * *', 'SELECT public.podcast_guest_cleanup()');
  END IF;
END $$;

-- ============================================================
-- 7. Private bucket for guest backup takes
--    No storage.objects policies = no anon/authenticated access; the server
--    uses the service role to mint single-object signed upload/download URLs.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'podcast-guest-takes',
  'podcast-guest-takes',
  false,
  419430400,
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'video/webm', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
