import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

type Resource = 'programs' | 'referrals' | 'volunteers' | 'houses' | 'phone'

const tables: Record<Exclude<Resource, 'phone'>, string> = {
  programs: 'safecase_programs',
  referrals: 'safecase_referrals',
  volunteers: 'safecase_volunteers',
  houses: 'safecase_houses',
}

export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params
    const { user, admin } = await withSafeCaseAdmin()
    if (resource === 'phone') {
      const { data, error } = await admin.from('admin_users').select('mfa_phone').eq('email', user.email).single()
      if (error) throw error
      return NextResponse.json({ mfa_phone: data?.mfa_phone ?? '' })
    }
    const table = tables[resource as Exclude<Resource, 'phone'>]
    if (!table) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 })
    const select = resource === 'referrals'
      ? '*, client:safecase_clients(first_name, last_name)'
      : '*'
    const { data, error } = await admin.from(table).select(select).order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return safecaseError(err)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params
    const { user, admin } = await withSafeCaseAdmin()
    const body = await request.json() as Record<string, unknown>
    if (resource === 'phone') {
      const mfa_phone = String(body.mfa_phone || '').trim()
      const { data, error } = await admin
        .from('admin_users')
        .update({ mfa_phone, updated_at: new Date().toISOString() })
        .eq('email', user.email)
        .select('mfa_phone')
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }
    const table = tables[resource as Exclude<Resource, 'phone'>]
    if (!table) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 })
    const payload = { ...body, created_by: resource === 'volunteers' || resource === 'houses' || resource === 'programs' ? undefined : user.email }
    if (resource === 'programs' || resource === 'volunteers' || resource === 'houses') {
      delete payload.created_by
    } else {
      payload.created_by = user.email
    }
    const { data, error } = await admin.from(table).insert(payload).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return safecaseError(err)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params
    const { admin } = await withSafeCaseAdmin()
    const table = tables[resource as Exclude<Resource, 'phone'>]
    if (!table) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 })
    const body = await request.json() as Record<string, unknown>
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { id: _id, ...patch } = body
    const { data, error } = await admin.from(table).update(patch).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return safecaseError(err)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params
    const { admin } = await withSafeCaseAdmin()
    const table = tables[resource as Exclude<Resource, 'phone'>]
    if (!table) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await admin.from(table).delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return safecaseError(err)
  }
}
