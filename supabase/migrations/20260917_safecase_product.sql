-- SafeCase product pass: staff can run a full case day without 2FA.

ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS case_number TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS pronouns TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS intake_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE safecase_programs ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE safecase_referrals ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE safecase_referrals ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE safecase_referrals ADD COLUMN IF NOT EXISTS follow_up_date DATE;

ALTER TABLE safecase_volunteers ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_safecase_clients_case_number
  ON safecase_clients(case_number) WHERE case_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS safecase_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES safecase_clients(id) ON DELETE CASCADE,
  house_id UUID NOT NULL REFERENCES safecase_houses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exited')),
  moved_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moved_out_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_safecase_one_active_placement
  ON safecase_placements(client_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_safecase_placements_house ON safecase_placements(house_id, status);

CREATE TABLE IF NOT EXISTS safecase_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES safecase_clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  starts_on DATE NOT NULL,
  start_time TEXT,
  location TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safecase_appointments_day ON safecase_appointments(starts_on);

ALTER TABLE safecase_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safecase_admin_all ON safecase_placements;
DROP POLICY IF EXISTS safecase_admin_all ON safecase_appointments;
CREATE POLICY safecase_admin_all ON safecase_placements FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY safecase_admin_all ON safecase_appointments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON safecase_placements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON safecase_appointments TO authenticated;
