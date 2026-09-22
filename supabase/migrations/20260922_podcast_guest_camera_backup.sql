-- Optional guest-local camera backup next to the existing audio take.
-- Live inbound video stays on the admin WebRTC peer; this is NAT-failure insurance.

ALTER TABLE podcast_guest_invites
  ADD COLUMN IF NOT EXISTS camera_url TEXT,
  ADD COLUMN IF NOT EXISTS camera_mime TEXT;

COMMENT ON COLUMN podcast_guest_invites.camera_url IS
  'Optional guest-local camera backup uploaded from the booth. Not the live WebRTC capture.';
