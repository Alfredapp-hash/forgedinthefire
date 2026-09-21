-- SafeCase phone 2FA scaffold (enrollment fields only — gate not live until SAFECASE_2FA_LIVE)

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dob_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS safecase_2fa_enrolled_at TIMESTAMPTZ;

COMMENT ON COLUMN admin_users.phone_e164 IS 'E.164 phone for SafeCase SMS OTP (e.g. +12165551212)';
COMMENT ON COLUMN admin_users.dob_hash IS 'Salted hash of YYYY-MM-DD DOB — never store raw DOB';
COMMENT ON COLUMN admin_users.pin_hash IS 'Salted hash of 6-digit SafeCase PIN — never store raw PIN';

CREATE TABLE IF NOT EXISTS safecase_2fa_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  -- Opaque challenge id returned to client after DOB+PIN verify
  challenge_token TEXT NOT NULL UNIQUE,
  -- Hashed SMS OTP (never store plaintext code)
  otp_hash TEXT NOT NULL,
  phone_e164_snapshot TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safecase_2fa_challenges_token
  ON safecase_2fa_challenges(challenge_token)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_safecase_2fa_challenges_admin
  ON safecase_2fa_challenges(admin_user_id, created_at DESC);

-- Audit trail (no secrets)
CREATE TABLE IF NOT EXISTS safecase_2fa_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'enroll_started', 'enroll_saved', 'challenge_started', 'otp_sent',
      'otp_verified', 'otp_failed', 'otp_expired', 'disabled_stub'
    )),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safecase_2fa_events_created
  ON safecase_2fa_events(created_at DESC);

ALTER TABLE safecase_2fa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_2fa_events ENABLE ROW LEVEL SECURITY;

-- Service role / server routes only — no anon access to challenges
DROP POLICY IF EXISTS "Admin read own 2fa events" ON safecase_2fa_events;
CREATE POLICY "Admin read own 2fa events" ON safecase_2fa_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = safecase_2fa_events.admin_user_id
        AND lower(au.email) = lower(auth.jwt() ->> 'email')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safecase_2fa_challenges TO authenticated;
GRANT SELECT, INSERT ON safecase_2fa_events TO authenticated;
