-- Video version of an episode: stored alongside the audio mix so the public
-- player can offer "watch", and a separate video RSS feed can carry it.
-- Additive + nullable: audio-only episodes are unaffected, and code that reads
-- these columns via select('*') simply sees NULL until an episode has video.
alter table public.podcast_episodes
  add column if not exists video_url text,
  add column if not exists video_mime text,
  add column if not exists video_size bigint,
  add column if not exists video_duration_seconds numeric;

comment on column public.podcast_episodes.video_url is 'Public URL of the exported program video (media bucket). NULL = audio-only episode.';
