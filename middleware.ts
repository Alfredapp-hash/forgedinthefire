import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function normalizeEmail(email: string | undefined): string {
  return (email || '').trim().toLowerCase()
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  
  const { pathname } = request.nextUrl
  // Dev/QA harness (app/dev/*): a real 404 in production. The pages call notFound() too, but the
  // root loading.tsx streams the response first, so that alone would answer 200 with a not-found body.
  if (pathname === '/dev' || pathname.startsWith('/dev/')) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } })
    }
    return NextResponse.next()
  }
  // Guest booth is public. Matcher includes /studio so the root layout can hide marketing chrome.
  if (pathname.startsWith('/studio/')) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-fitf-pathname', pathname)
    const res = NextResponse.next({ request: { headers: requestHeaders } })
    // Invite tokens live in this path: never send it as a Referer, never index or cache it.
    res.headers.set('Referrer-Policy', 'no-referrer')
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    res.headers.set('Cache-Control', 'no-store, private, max-age=0')
    return res
  }
  
  // Check if Supabase env vars are available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  // If Supabase is not configured, allow access to login page but block admin
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase not configured - auth features disabled')
    
    // Allow login page to show "not configured" message
    if (pathname.startsWith('/admin')) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — MUST call getUser() per Supabase SSR docs
  const { data: { user } } = await supabase.auth.getUser()

  // Protect admin and internal research previews
  if (pathname.startsWith('/admin') || pathname.startsWith('/preview/ad-research')) {
    // First check if user is authenticated
    if (!user) {
      const next = `${pathname}${request.nextUrl.search || ''}`
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = ''
      url.searchParams.set('redirect', next)
      return NextResponse.redirect(url)
    }
    
    // Then check if user is in admin_users table (with normalized email)
    const normalizedUserEmail = normalizeEmail(user.email)
    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('email, role')
      .eq('email', normalizedUserEmail)
      .single()
    
    // If not an admin, redirect to unauthorized page
    if (adminError || !adminUser || (adminUser.role !== 'admin' && adminUser.role !== 'owner')) {
      console.warn(`Non-admin user attempted access: ${user.email} (normalized: ${normalizedUserEmail})`)
      const url = request.nextUrl.clone()
      url.pathname = '/unauthorized'
      return NextResponse.redirect(url)
    }
  }

  // If already logged in and is admin, redirect /login → /admin
  if (pathname === '/login' && user) {
    // Check if user is an admin before redirecting (with normalized email)
    const normalizedUserEmail = normalizeEmail(user.email)
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('email', normalizedUserEmail)
      .single()
    
    if (adminUser && (adminUser.role === 'admin' || adminUser.role === 'owner')) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      return NextResponse.redirect(url)
    }
    // If not an admin, let them stay on login page to see error
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/preview/ad-research',
    '/login',
    '/unauthorized',
    '/studio/:path*',
    '/dev',
    '/dev/:path*',
  ],
}
