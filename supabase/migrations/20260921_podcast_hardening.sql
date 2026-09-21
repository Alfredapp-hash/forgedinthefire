-- Podcast hardening: stable GUID + tighter RLS on sensitive tables
-- Apply after 20260918_podcast_enterprise.sql

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS guid UUID;

UPDATE podcast_episodes
SET guid = gen_random_uuid()
WHERE guid IS NULL;

ALTER TABLE podcast_episodes
  ALTER COLUMN guid SET DEFAULT gen_random_uuid();

ALTER TABLE podcast_episodes
  ALTER COLUMN guid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_guid
  ON podcast_episodes(guid);

-- Drop wide-open authenticated ALL policies on sensitive tables
DROP POLICY IF EXISTS "Admin podcast subscribers" ON podcast_subscribers;
DROP POLICY IF EXISTS "Admin podcast distribution" ON podcast_distribution;
DROP POLICY IF EXISTS "Admin podcast analytics" ON podcast_analytics_events;

-- No direct client access to subscriber emails/tokens — service role / admin APIs only
REVOKE ALL ON podcast_subscribers FROM anon;
REVOKE ALL ON podcast_subscribers FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_subscribers TO service_role;

-- Distribution: authenticated read-only; writes via service role admin API
REVOKE ALL ON podcast_distribution FROM anon;
REVOKE INSERT, UPDATE, DELETE ON podcast_distribution FROM authenticated;
GRANT SELECT ON podcast_distribution TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_distribution TO service_role;

-- Analytics: anon/authenticated may INSERT events only; no SELECT of raw events for authenticated
DROP POLICY IF EXISTS "Insert podcast analytics" ON podcast_analytics_events;
CREATE POLICY "Insert podcast analytics" ON podcast_analytics_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

REVOKE SELECT, UPDATE, DELETE ON podcast_analytics_events FROM anon;
REVOKE SELECT, UPDATE, DELETE ON podcast_analytics_events FROM authenticated;
GRANT INSERT ON podcast_analytics_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON podcast_analytics_events TO service_role;

COMMENT ON COLUMN podcast_episodes.guid IS 'Immutable podcast GUID for RSS; never change after first publish';
