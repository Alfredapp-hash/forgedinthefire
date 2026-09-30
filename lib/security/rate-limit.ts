import 'server-only'
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fixed-window limiter backed by Postgres (public.api_rate_limit_hit, see
 * supabase/migrations/20260923000003_podcast_security.sql). Netlify functions are
 * stateless, so an in-memory counter would reset on every cold start.
 *
 * Buckets never hold raw IPs or tokens: callers pass already-hashed keys via
 * hashedKey(). If the function is missing (migration not applied yet) the
 * limiter fails open and logs once, so the booth keeps working; any other
 * limiter error fails closed.
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

/**
 * Does this Supabase/PostgREST error mean `api_rate_limit_hit` is not installed?
 * PGRST202 = function not found in the schema cache; 42883 = undefined_function.
 */
export function isMissingLimiterError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null
  const code = typeof e?.code === 'string' ? e.code : ''
  const message = typeof e?.message === 'string' ? e.message : ''
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /could not find the function/i.test(message) ||
    /function .*api_rate_limit_hit.* does not exist/i.test(message)
  )
}

/**
 * true = allowed (under the limit, or the limiter function is not installed yet);
 * false = over the limit, or the limiter errored for any other reason (fail closed).
 */
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
    if (isMissingLimiterError(err)) {
      if (!warned) {
        warned = true
        console.warn('[rate-limit] api_rate_limit_hit not installed, failing open:', err instanceof Error ? err.message : err)
      }
      return true
    }
    console.error('[rate-limit] limiter error, failing closed:', err instanceof Error ? err.message : err)
    return false
  }
}
