import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'
import { syncHouseOccupancy } from '@/lib/safecase/sync'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')
    const houseId = searchParams.get('house_id')
    const active = searchParams.get('active')
    let query = admin
      .from('safecase_placements')
      .select('*, client:safecase_clients(first_name, last_name), house:safecase_houses(name, status, capacity, current_occupancy)')
      .order('moved_in_at', { ascending: false })
    if (clientId) query = query.eq('client_id', clientId)
    if (houseId) query = query.eq('house_id', houseId)
    if (active === '1') query = query.eq('status', 'active')
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return safecaseError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { user, admin } = await withSafeCaseAdmin()
    const body = await request.json() as { client_id?: string; house_id?: string }
    if (!body.client_id || !body.house_id) {
      return NextResponse.json({ error: 'Client and house are required' }, { status: 400 })
    }
    const { data: house, error: houseError } = await admin
      .from('safecase_houses')
      .select('capacity, current_occupancy, status, name')
      .eq('id', body.house_id)
      .single()
    if (houseError) throw houseError
    if (house?.status === 'offline') {
      return NextResponse.json({ error: `${house.name} is offline` }, { status: 409 })
    }
    if ((house?.capacity ?? 0) > 0 && (house?.current_occupancy ?? 0) >= (house?.capacity ?? 0)) {
      return NextResponse.json({ error: `${house?.name || 'House'} is at capacity` }, { status: 409 })
    }
    const { data: open } = await admin
      .from('safecase_placements')
      .select('id, house_id')
      .eq('client_id', body.client_id)
      .eq('status', 'active')
      .maybeSingle()
    if (open?.id) {
      await admin.from('safecase_placements').update({
        status: 'exited',
        moved_out_at: new Date().toISOString(),
      }).eq('id', open.id)
      await syncHouseOccupancy(admin, open.house_id)
    }
    const { data, error } = await admin
      .from('safecase_placements')
      .insert({
        client_id: body.client_id,
        house_id: body.house_id,
        status: 'active',
        created_by: user.email,
      })
      .select('*, house:safecase_houses(name, status, capacity, current_occupancy)')
      .single()
    if (error) throw error
    await syncHouseOccupancy(admin, body.house_id)
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return safecaseError(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const body = await request.json() as { id?: string; status?: 'active' | 'exited' }
    if (!body.id || !body.status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
    const { data: existing, error: findError } = await admin.from('safecase_placements').select('house_id').eq('id', body.id).single()
    if (findError) throw findError
    const patch: Record<string, unknown> = { status: body.status }
    patch.moved_out_at = body.status === 'exited' ? new Date().toISOString() : null
    const { data, error } = await admin.from('safecase_placements').update(patch).eq('id', body.id).select().single()
    if (error) throw error
    if (existing?.house_id) await syncHouseOccupancy(admin, existing.house_id)
    return NextResponse.json(data)
  } catch (err) {
    return safecaseError(err)
  }
}
