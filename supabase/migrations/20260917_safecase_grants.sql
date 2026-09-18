-- SafeCase grant files and reporting packets

CREATE TABLE IF NOT EXISTS safecase_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  funder TEXT NOT NULL,
  award_amount NUMERIC(12, 2),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report_due_on DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'submitted', 'closed')),
  program_ids UUID[] NOT NULL DEFAULT '{}',
  targets JSONB NOT NULL DEFAULT '{}'::jsonb,
  narrative TEXT,
  notes TEXT,
  snapshot JSONB,
  snapshot_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safecase_grants_period ON safecase_grants(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_safecase_grants_status ON safecase_grants(status);

ALTER TABLE safecase_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safecase_admin_all ON safecase_grants;
CREATE POLICY safecase_admin_all ON safecase_grants
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON safecase_grants TO authenticated;
