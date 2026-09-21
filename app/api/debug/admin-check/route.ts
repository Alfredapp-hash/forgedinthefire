import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const debug: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
  }

  try {
    const supabase = await createClient()
    debug.hasClient = !!supabase
    if (!supabase) {
      return NextResponse.json({ error: 'No supabase client', debug }, { status: 503 })
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    debug.hasUser = !!user
    debug.userError = userError?.message
    debug.userEmail = user?.email || null

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated', debug }, { status: 401 })
    }

    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('email, role')
      .eq('email', user.email)
      .single()

    return NextResponse.json({
      authenticated: true,
      isAdmin: adminUser?.role === 'admin' || adminUser?.role === 'owner',
      user: user.email,
      role: adminUser?.role || null,
      adminError: adminError?.message || null,
      debug,
    })
  } catch (error: unknown) {
    debug.catchError = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Exception', debug }, { status: 500 })
  }
}
