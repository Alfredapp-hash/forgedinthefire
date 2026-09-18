#!/usr/bin/env node
/**
 * Apply SafeCase native-substance migration to live FITF Supabase (mxjs…).
 * Bypasses broken Cursor Supabase MCP OAuth (Unrecognized client_id).
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='…' node scripts/apply-safecase-substance.mjs
 * Password: Supabase Dashboard → Project Settings → Database → Database password
 */
import { readFileSync } from 'fs'
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

const sqlPath = resolve(root, 'supabase/migrations/20260918_safecase_native_substance.sql')
const sql = readFileSync(sqlPath, 'utf8')
const dbUrl = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-us-east-2.pooler.supabase.com:6543/postgres`

const r = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
  encoding: 'utf8',
  maxBuffer: 10_000_000,
})
if (r.stdout) process.stdout.write(r.stdout)
if (r.stderr) process.stderr.write(r.stderr)
process.exit(r.status ?? 1)
