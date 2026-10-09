-- Podcast share clips / audiograms (Sprint 2). Additive and idempotent.
--
-- Clips are rendered in the browser (Publish → Share clips), uploaded to the public `media`
-- bucket and recorded here. The row is private production data (admin-only RLS); the public
-- episode page reads clips through `podcast_public_clips`, a view that only exposes clips of
-- released, public/unlisted episodes — and only the columns a visitor needs.

CREATE TABLE IF NOT EXISTS public.podcast_episode_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  -- Range on the episode timeline, in seconds.
  start_sec NUMERIC(10, 2) NOT NULL,
  end_sec NUMERIC(10, 2) NOT NULL,
  aspect TEXT NOT NULL DEFAULT '9:16',
  url TEXT NOT NULL,
  poster_url TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT podcast_episode_clips_aspect_check CHECK (aspect IN ('9:16', '1:1', '16:9')),
  CONSTRAINT podcast_episode_clips_range_check CHECK (start_sec >= 0 AND end_sec > start_sec AND end_sec - start_sec <= 90),
  CONSTRAINT podcast_episode_clips_url_check CHECK (url ~ '^https://'),
  CONSTRAINT podcast_episode_clips_poster_check CHECK (poster_url IS NULL OR poster_url ~ '^https://')
);

COMMENT ON TABLE public.podcast_episode_clips IS
  'Share clips / audiograms rendered from an episode (MP4/WebM + poster). Admin-only; the public page reads podcast_public_clips.';

CREATE INDEX IF NOT EXISTS podcast_episode_clips_episode_idx
  ON public.podcast_episode_clips (episode_id, created_at DESC);

ALTER TABLE public.podcast_episode_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin podcast episode clips" ON public.podcast_episode_clips;
CREATE POLICY "Admin podcast episode clips" ON public.podcast_episode_clips
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.podcast_episode_clips FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_episode_clips TO authenticated;
GRANT ALL ON public.podcast_episode_clips TO service_role;

-- Public read: only clips of released episodes, and only the columns the episode page shows.
-- security_invoker = false (the default) lets anon read through the view while the table stays
-- closed; the WHERE mirrors the "Public published podcasts" policy on podcast_episodes.
CREATE OR REPLACE VIEW public.podcast_public_clips
WITH (security_barrier = true) AS
  SELECT c.id, c.episode_id, c.title, c.start_sec, c.end_sec, c.aspect, c.url, c.poster_url, c.created_at
  FROM public.podcast_episode_clips c
  JOIN public.podcast_episodes e ON e.id = c.episode_id
  WHERE e.status = 'published'
    AND e.visibility IN ('public', 'unlisted')
    AND e.audio_url IS NOT NULL
    AND (e.published_at IS NULL OR e.published_at <= now());

COMMENT ON VIEW public.podcast_public_clips IS
  'Share clips of released public/unlisted episodes. The only public path to podcast_episode_clips.';

REVOKE ALL ON public.podcast_public_clips FROM PUBLIC;
GRANT SELECT ON public.podcast_public_clips TO anon, authenticated, service_role;
