import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin, requireOwner } from '@/lib/admin/auth'
import { isStaffRole, type StaffRole } from '@/lib/admin/roles'
import { recordPodcastAudit } from '@/lib/podcast/audit-log'
import { NextResponse } from 'next/server'

function failed(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : ''
  if (
    message === 'Forbidden' ||
    message === 'Not authenticated' ||
    message === 'Admin access required' ||
    message === 'Not authorized as admin'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (message.toLowerCase().includes('not configured') || message.startsWith('Missing ')) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }
  console.error('[admin-users]', err)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

type AdminClient = NonNullable<Awaited<ReturnType<typeof createAdminClient>>>

async function ownerCount(admin: AdminClient) {
  const { count, error } = await admin.from('admin_users').select('id', { count: 'exact', head: true }).eq('role', 'owner')
  if (error) throw error
  return count ?? 0
}

export async function GET() {
  try {
    await requireAdmin()
    const admin = await createAdminClient()
    const { data, error } = await admin.from('admin_users').select('id, email, role, created_at').order('email')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return failed(err, 'Failed to load users')
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwner()
    const admin = await createAdminClient()

    const body = await request.json() as { email?: string; role?: string }
    const email = String(body.email || '').trim().toLowerCase()
    const role: StaffRole = body.role && isStaffRole(body.role) ? body.role : 'admin'
    if (!email || !email.includes('@')) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    if (body.role && !isStaffRole(body.role)) {
      return NextResponse.json({ error: 'Role must be owner, admin, or safeguarding' }, { status: 400 })
    }

    const { data: existing } = await admin.from('admin_users').select('id, role').eq('email', email).maybeSingle()
    if (existing?.role === 'owner' && role !== 'owner') {
      const owners = await ownerCount(admin)
      if (owners <= 1) {
        return NextResponse.json({ error: 'Keep at least one owner' }, { status: 409 })
      }
    }

    const { data, error } = await admin
      .from('admin_users')
      .upsert({ email, role, updated_at: new Date().toISOString() }, { onConflict: 'email' })
      .select()
      .single()

    if (error) throw error
    await recordPodcastAudit({
      actorEmail: owner.email,
      action: 'staff.upsert',
      summary: `Set ${email} to ${role}`,
      detail: { email, role },
    })
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return failed(err, 'Failed to add user')
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = await requireOwner()
    const admin = await createAdminClient()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { data: target, error: readError } = await admin.from('admin_users').select('id, email, role').eq('id', id).maybeSingle()
    if (readError) throw readError
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (target.role === 'owner') {
      const owners = await ownerCount(admin)
      if (owners <= 1) {
        return NextResponse.json({ error: 'Keep at least one owner' }, { status: 409 })
      }
    }

    const { error } = await admin.from('admin_users').delete().eq('id', id)
    if (error) throw error
    await recordPodcastAudit({
      actorEmail: owner.email,
      action: 'staff.remove',
      summary: `Removed ${target.email}`,
      detail: { email: target.email, role: target.role },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    return failed(err, 'Failed to remove user')
  }
}
