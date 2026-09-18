-- SafeCase native substance parity (from ArkheVault SafeCase Core Data).
-- Keeps existing web-only columns (preferred_name, case_number, pronouns, intake, grants, volunteers).

-- Client profile (native Client entity)
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS biography TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS ethnicity TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS housing_status TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS employment_status TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS transportation_status TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS legal_needs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS medical_needs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS mental_health_needs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS recovery_needs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS safety_concerns JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS safe_contact_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS household_members JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS dependents JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Notes (native CaseNote)
ALTER TABLE safecase_notes ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE safecase_notes ADD COLUMN IF NOT EXISTS supervisor_review BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE safecase_notes ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE safecase_notes ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- Tasks (native Task)
ALTER TABLE safecase_tasks ADD COLUMN IF NOT EXISTS task_type TEXT;
ALTER TABLE safecase_tasks ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT false;

-- Appointments (native Appointment)
ALTER TABLE safecase_appointments ADD COLUMN IF NOT EXISTS appointment_type TEXT;
ALTER TABLE safecase_appointments ADD COLUMN IF NOT EXISTS end_time TEXT;
ALTER TABLE safecase_appointments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled';

-- Safe houses: code names (native SafeHouse.codeName) — keep `name` for web compat
ALTER TABLE safecase_houses ADD COLUMN IF NOT EXISTS code_name TEXT;
UPDATE safecase_houses SET code_name = name WHERE code_name IS NULL;
ALTER TABLE safecase_houses ADD COLUMN IF NOT EXISTS placement_restrictions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE safecase_houses ADD COLUMN IF NOT EXISTS safety_rules JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Placements (native SafeHousePlacement fields)
ALTER TABLE safecase_placements ADD COLUMN IF NOT EXISTS reason_for_placement TEXT;
ALTER TABLE safecase_placements ADD COLUMN IF NOT EXISTS exit_plan TEXT;
ALTER TABLE safecase_placements ADD COLUMN IF NOT EXISTS expected_exit_date DATE;

-- Referrals (native Referral consent)
ALTER TABLE safecase_referrals ADD COLUMN IF NOT EXISTS consent_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE safecase_referrals ADD COLUMN IF NOT EXISTS referral_source TEXT;
ALTER TABLE safecase_referrals ADD COLUMN IF NOT EXISTS outcome TEXT;

-- Communications log (native Communication)
CREATE TABLE IF NOT EXISTS safecase_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES safecase_clients(id) ON DELETE CASCADE,
  communication_type TEXT NOT NULL DEFAULT 'call',
  direction TEXT NOT NULL DEFAULT 'outbound',
  subject TEXT,
  content TEXT,
  duration_minutes INTEGER DEFAULT 0,
  outcome TEXT,
  safe_contact_respected BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safecase_comms_client
  ON safecase_communications(client_id, created_at DESC);

-- Program outcomes (native ProgramOutcome)
CREATE TABLE IF NOT EXISTS safecase_program_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES safecase_enrollments(id) ON DELETE CASCADE,
  outcome_type TEXT,
  outcome_value TEXT,
  measurement_date DATE,
  achieved BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safecase_outcomes_enrollment
  ON safecase_program_outcomes(enrollment_id, created_at DESC);

ALTER TABLE safecase_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_program_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safecase_admin_all ON safecase_communications;
DROP POLICY IF EXISTS safecase_admin_all ON safecase_program_outcomes;
CREATE POLICY safecase_admin_all ON safecase_communications
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY safecase_admin_all ON safecase_program_outcomes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON safecase_communications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON safecase_program_outcomes TO authenticated;
