import 'server-only'
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fixed-window limiter backed by Postgres (public.api_rate_limit_hit, see
 * supabase/migrations/20260923_podcast_security.sql). Netlify functions are
 * stateless, so an in-memory counter would reset on every cold start.
 *
 * Buckets never hold raw IPs or tokens: callers pass already-hashed keys via
 * hashedKey(). If the function is missing (migration not applied yet) the
 * limiter fails open and logs once, so the booth keeps working.
 */
let warned = false

export function hashedKey(prefix: string, value: string) {
  const digest = createHash('sha256').update(`fitf-rl:${value}`, 'utf8').digest('hex').slice(0, 32)
  return `${prefix}:${digest}`
}

export function clientIp(request: Request) {
  const h = request.headers
  return (
    h.get('x-nf-client-connection-ip') ||
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  )
}

export async function rateLimitHit(
  supabase: SupabaseClient,
  bucket: string,
  windowSeconds: number,
  max: number,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('api_rate_limit_hit', {
      p_bucket: bucket,
      p_window_seconds: windowSeconds,
      p_max: max,
    })
    if (error) throw error
    return data !== false
  } catch (err) {
    if (!warned) {
      warned = true
      console.warn('[rate-limit] limiter unavailable, failing open:', err instanceof Error ? err.message : err)
    }
    return true
  }
}
