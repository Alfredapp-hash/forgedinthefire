import 'server-only'
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fixed-window limiter for the public live chat route.
 *
 * Backed by the Postgres function `public.api_rate_limit_hit(p_bucket, p_window_seconds, p_max)`
 * when it exists (Netlify functions are stateless, so an in-memory counter would reset on
 * every cold start). If the function is missing the limiter FAILS OPEN and logs once, so chat
 * keeps working; the per-viewer slow mode and bans in chat-server.ts still apply.
 *
 * Buckets never hold raw IPs or viewer ids: callers pass already-hashed keys via hashedKey().
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

/** true = allowed (under the limit, or limiter unavailable); false = over the limit. */
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
      console.warn('[live-chat rate-limit] limiter unavailable, failing open:', err instanceof Error ? err.message : err)
    }
    return true
  }
}
