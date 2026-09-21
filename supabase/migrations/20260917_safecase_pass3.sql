-- SafeCase pass 3: intake checklist, waitlist, seed house

ALTER TABLE safecase_clients ADD COLUMN IF NOT EXISTS intake JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE safecase_enrollments DROP CONSTRAINT IF EXISTS safecase_enrollments_status_check;
ALTER TABLE safecase_enrollments ADD CONSTRAINT safecase_enrollments_status_check
  CHECK (status IN ('active', 'completed', 'withdrawn', 'waitlist'));

INSERT INTO safecase_houses (name, capacity, notes, status)
SELECT 'Confidential House A', 4, 'Staff-only. Do not publish the address.', 'open'
WHERE NOT EXISTS (SELECT 1 FROM safecase_houses LIMIT 1);
