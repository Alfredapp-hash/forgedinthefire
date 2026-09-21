import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { admin } = await withSafeCaseAdmin()
    const { data, error } = await admin.from('safecase_clients').select('*').eq('id', id).single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return safecaseError(err)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { admin } = await withSafeCaseAdmin()
    const body = await request.json() as Record<string, unknown>
    const allowed = [
      'first_name', 'last_name', 'preferred_name', 'contact_email', 'contact_phone',
      'status', 'risk_level', 'veteran_status', 'confidential_address', 'date_of_birth',
      'case_number', 'pronouns', 'assigned_to', 'emergency_contact_name', 'emergency_contact_phone',
      'intake_date', 'intake',
      'biography', 'gender', 'ethnicity', 'housing_status', 'employment_status', 'transportation_status',
      'address_line1', 'address_line2', 'city', 'state', 'zip',
      'legal_needs', 'medical_needs', 'mental_health_needs', 'recovery_needs', 'safety_concerns',
      'safe_contact_rules', 'household_members', 'dependents',
    ] as const
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (body[key] !== undefined) {
        patch[key] = body[key] === '' ? null : body[key]
      }
    }
    const { data, error } = await admin
      .from('safecase_clients')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return safecaseError(err)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { admin } = await withSafeCaseAdmin()
    const { error } = await admin.from('safecase_clients').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return safecaseError(err)
  }
}
