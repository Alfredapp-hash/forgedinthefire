import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from './service'

/**
 * Create a standard server-side Supabase client
 * Uses ANON key for regular operations (protected by RLS)
 * Safe for use in Server Components and API routes
 * Returns null if environment variables are missing (for graceful degradation)
 */
export async function createClient() {
  const cookieStore = await cookies()
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    console.warn('Missing Supabase environment variables. Blog/Content features will be unavailable.')
    return null
  }

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookies can be set from middleware
          }
        },
      },
    }
  )
}

/**
 * Admin Supabase client with elevated privileges (SERVICE_ROLE_KEY, bypasses RLS).
 *
 * This client deliberately carries NO request cookies. When cookies were wired in,
 * a signed-in admin's access token replaced the service key and every "admin" query
 * silently ran as `authenticated` under RLS.
 * ⚠️ Server-only. Gate every caller with verifyAdminAccess()/requireAdmin() first.
 */
export async function createAdminClient() {
  return createServiceClient()
}
