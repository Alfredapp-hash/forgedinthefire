-- Blog studio hardening: ensure consent column exists for impact stories
ALTER TABLE content
  ADD COLUMN IF NOT EXISTS consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE content
  ADD COLUMN IF NOT EXISTS topic_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_topic_id_fkey'
  ) THEN
    ALTER TABLE content
      ADD CONSTRAINT content_topic_id_fkey
      FOREIGN KEY (topic_id) REFERENCES content_topics(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- content_topics may not exist yet in some environments
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_topic_id ON content(topic_id);
