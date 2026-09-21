#!/usr/bin/env node
/**
 * Apply studio + podcast enterprise migrations to live FITF Supabase.
 * Usage: SUPABASE_DB_PASSWORD='…' node scripts/apply-podcast-enterprise.mjs
 */
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const ref = 'mxjsbhldmovwpjcotmsd'
const password = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD
if (!password) {
  console.error('Set SUPABASE_DB_PASSWORD, then re-run.')
  process.exit(1)
}

const files = [
  'supabase/migrations/20260917_studio.sql',
  'supabase/migrations/20260918_podcast_enterprise.sql',
  'supabase/migrations/20260918_content_topics_cover.sql',
  'supabase/migrations/20260921_podcast_hardening.sql',
  'supabase/migrations/20260921_blog_hardening.sql',
  'supabase/migrations/20260921_studio_p1.sql',
  'supabase/migrations/20260921_studio_p1_safety.sql',
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

console.log('Studio + podcast enterprise migrations applied.')
