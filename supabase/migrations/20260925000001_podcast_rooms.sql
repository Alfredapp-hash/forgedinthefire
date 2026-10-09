-- Multi-guest rooms (panel shows): one SFU room per episode once a second
-- guest is invited. A single guest keeps the free P2P path (room_id NULL).
-- Server (service role) writes only; admins may read via RLS.

CREATE TABLE IF NOT EXISTS public.podcast_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'livekit' CHECK (provider IN ('livekit')),
  room_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_podcast_rooms_episode_open
  ON public.podcast_rooms(episode_id, created_at DESC)
  WHERE ended_at IS NULL;

ALTER TABLE public.podcast_guest_invites
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.podcast_rooms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_podcast_guest_invites_room
  ON public.podcast_guest_invites(room_id)
  WHERE room_id IS NOT NULL;

ALTER TABLE public.podcast_rooms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.podcast_rooms FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_rooms TO service_role;
GRANT SELECT ON public.podcast_rooms TO authenticated;

-- Admin read policy needs public.is_admin() from 20260923000003_podcast_security.sql.
-- Without it the table stays service-role only (the admin API uses the service role anyway).
DROP POLICY IF EXISTS podcast_rooms_admin_read ON public.podcast_rooms;
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY podcast_rooms_admin_read ON public.podcast_rooms
      FOR SELECT TO authenticated
      USING (public.is_admin())';
  END IF;
END $$;

COMMENT ON TABLE public.podcast_rooms IS
  'SFU rooms for episodes with 2+ remote guests. room_name is the provider room; API keys never live here.';
COMMENT ON COLUMN public.podcast_guest_invites.room_id IS
  'NULL = one-guest P2P call. Set when the invite joins the episode room (panel show).';
