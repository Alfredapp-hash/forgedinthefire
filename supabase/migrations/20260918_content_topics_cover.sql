-- Topic-level branded cover art for Studio calendar / social share
ALTER TABLE content_topics
  ADD COLUMN IF NOT EXISTS cover_url TEXT;
