-- SafeCase: web port of Ark Vault client management for Forged in the Fire admin.
-- Access is admin-only (service role from API). Phone 2FA is a later gate.

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS mfa_phone TEXT;

CREATE TABLE IF NOT EXISTS safecase_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  veteran_status BOOLEAN NOT NULL DEFAULT false,
  confidential_address BOOLEAN NOT NULL DEFAULT false,
  date_of_birth DATE,
  last_contact_at TIMESTAMPTZ,
  notes_preview TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safecase_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES safecase_clients(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL DEFAULT 'progress' CHECK (note_type IN ('intake', 'progress', 'safety', 'contact', 'supervision')),
  narrative TEXT NOT NULL,
  visibility_level TEXT NOT NULL DEFAULT 'standard',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safecase_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES safecase_clients(id) ON DELETE SET NULL,
  task_name TEXT NOT NULL,
  details TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  due_date DATE,
  assigned_to TEXT,
  completed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safecase_safety_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES safecase_clients(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,
  description_text TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safecase_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  program_type TEXT NOT NULL DEFAULT 'support',
  capacity INTEGER NOT NULL DEFAULT 50,
  current_enrollment INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safecase_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES safecase_clients(id) ON DELETE SET NULL,
  partner_name TEXT NOT NULL,
  service_type TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'declined', 'closed')),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safecase_volunteers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  role TEXT DEFAULT 'volunteer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safecase_houses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  current_occupancy INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'offline')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safecase_clients_status ON safecase_clients(status);
CREATE INDEX IF NOT EXISTS idx_safecase_clients_risk ON safecase_clients(risk_level);
CREATE INDEX IF NOT EXISTS idx_safecase_clients_name ON safecase_clients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_safecase_notes_client ON safecase_notes(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safecase_tasks_status ON safecase_tasks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_safecase_flags_active ON safecase_safety_flags(is_active, client_id);

ALTER TABLE safecase_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_safety_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_houses ENABLE ROW LEVEL SECURITY;

-- Admin-only access via is_admin() (same session as the admin portal).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'safecase_clients',
    'safecase_notes',
    'safecase_tasks',
    'safecase_safety_flags',
    'safecase_programs',
    'safecase_referrals',
    'safecase_volunteers',
    'safecase_houses'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS safecase_admin_all ON %I', t);
    EXECUTE format(
      'CREATE POLICY safecase_admin_all ON %I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      t
    );
  END LOOP;
END $$;

INSERT INTO safecase_programs (name, program_type, capacity)
SELECT * FROM (VALUES
  ('Emergency Housing Support', 'housing', 12),
  ('Survivor Advocacy', 'advocacy', 40),
  ('Workforce Readiness', 'employment', 20)
) AS v(name, program_type, capacity)
WHERE NOT EXISTS (SELECT 1 FROM safecase_programs LIMIT 1);
