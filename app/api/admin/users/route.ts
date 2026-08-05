import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin, verifyAdminAccess } from '@/lib/admin/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    await requireAdmin()
    const admin = await createAdminClient()
    const { data, error } = await admin.from('admin_users').select('id, email, role, created_at').order('email')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await verifyAdminAccess()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const admin = await createAdminClient()
    const { data: me } = await admin.from('admin_users').select('role').eq('email', user.email).single()
    if (me?.role !== 'owner') {
      return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
    }

    const body = await request.json() as { email: string; role?: 'admin' | 'owner' }
    const email = body.email.trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const { data, error } = await admin
      .from('admin_users')
      .upsert({ email, role: body.role ?? 'admin', updated_at: new Date().toISOString() }, { onConflict: 'email' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to add user' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await verifyAdminAccess()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const admin = await createAdminClient()
    const { data: me } = await admin.from('admin_users').select('role').eq('email', user.email).single()
    if (me?.role !== 'owner') {
      return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { error } = await admin.from('admin_users').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to remove user' }, { status: 500 })
  }
}
