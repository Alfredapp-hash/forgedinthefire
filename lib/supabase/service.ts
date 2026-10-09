import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Pure service-role client with NO cookie session.
 *
 * `createAdminClient()` in ./server.ts wires request cookies into the client, so when
 * an admin is signed in, supabase-js sends the admin's access token instead of the
 * service key and every query runs as `authenticated` under RLS. Use this client for
 * tables that are service-role only (guest invites/signals, rate limits, private buckets).
 * Server-only. Gate every caller with requireAdmin() or a guest-token check first.
 */
let cached: SupabaseClient | null = null

export function createServiceClient(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Database not configured')
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return cached
}
