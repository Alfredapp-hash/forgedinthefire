-- SafeCase sprint: enrollments, documents, admin write policies

CREATE TABLE IF NOT EXISTS safecase_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES safecase_clients(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES safecase_programs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'withdrawn')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by TEXT,
  UNIQUE (client_id, program_id)
);

CREATE TABLE IF NOT EXISTS safecase_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES safecase_clients(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safecase_enrollments_client ON safecase_enrollments(client_id);
CREATE INDEX IF NOT EXISTS idx_safecase_documents_client ON safecase_documents(client_id, created_at DESC);

ALTER TABLE safecase_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE safecase_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safecase_admin_all ON safecase_enrollments;
DROP POLICY IF EXISTS safecase_admin_all ON safecase_documents;
CREATE POLICY safecase_admin_all ON safecase_enrollments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY safecase_admin_all ON safecase_documents FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin media write" ON storage.objects;
DROP POLICY IF EXISTS "Admin media update" ON storage.objects;
DROP POLICY IF EXISTS "Public media read" ON storage.objects;
CREATE POLICY "Admin media write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND public.is_admin());
CREATE POLICY "Admin media update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND public.is_admin());
CREATE POLICY "Public media read" ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

GRANT SELECT, INSERT, UPDATE, DELETE ON safecase_enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON safecase_documents TO authenticated;
