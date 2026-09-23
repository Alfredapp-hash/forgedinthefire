import type { SupabaseClient } from '@supabase/supabase-js'

export async function syncProgramEnrollment(admin: SupabaseClient, programId: string) {
  const { count } = await admin
    .from('safecase_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('program_id', programId)
    .eq('status', 'active')
  await admin.from('safecase_programs').update({ current_enrollment: count ?? 0 }).eq('id', programId)
}

export async function syncHouseOccupancy(admin: SupabaseClient, houseId: string) {
  const [{ count }, { data: house }] = await Promise.all([
    admin.from('safecase_placements').select('*', { count: 'exact', head: true }).eq('house_id', houseId).eq('status', 'active'),
    admin.from('safecase_houses').select('capacity, status').eq('id', houseId).single(),
  ])
  const occupancy = count ?? 0
  const capacity = house?.capacity ?? 0
  const patch: Record<string, unknown> = { current_occupancy: occupancy }
  if (house?.status !== 'offline') {
    patch.status = occupancy >= capacity && capacity > 0 ? 'full' : 'open'
  }
  await admin.from('safecase_houses').update(patch).eq('id', houseId)
}

export function nextCaseNumber(lastName: string) {
  const prefix = (lastName.replace(/[^a-z]/gi, '').slice(0, 3) || 'FIT').toUpperCase()
  return `SC-${prefix}-${Date.now().toString(36).toUpperCase().slice(-5)}`
}
