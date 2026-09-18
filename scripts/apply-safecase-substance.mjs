#!/usr/bin/env node
/**
 * Apply SafeCase native-substance migration to live FITF Supabase (mxjs…).
 * Bypasses broken Cursor Supabase MCP OAuth (Unrecognized client_id).
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='…' node scripts/apply-safecase-substance.mjs
 */
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const ref = 'mxjsbhldmovwpjcotmsd'
const password = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD
if (!password) {
  console.error('Set SUPABASE_DB_PASSWORD (Database settings password), then re-run.')
  process.exit(1)
}

const files = [
  'supabase/migrations/20260918_safecase_native_substance.sql',
  'supabase/migrations/20260918_safecase_2fa_scaffold.sql',
]
const dbUrl = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`

for (const rel of files) {
  const sqlPath = resolve(root, rel)
  console.log(`Applying ${rel}…`)
  const r = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath], {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: password },
    maxBuffer: 10_000_000,
  })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  if (r.status) process.exit(r.status)
}
console.log('SafeCase substance + 2FA scaffold migrations applied (2FA live gate still off).')
