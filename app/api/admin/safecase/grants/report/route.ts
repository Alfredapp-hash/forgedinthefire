import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'
import { buildGrantPacket, grantNarrativeFromPacket } from '@/lib/safecase/grants'
import type { SafeCaseGrant } from '@/lib/safecase/types'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const { searchParams } = new URL(request.url)
    const grantId = searchParams.get('grant_id')
    let grant: SafeCaseGrant | null = null
    if (grantId) {
      const { data, error } = await admin.from('safecase_grants').select('*').eq('id', grantId).single()
      if (error) throw error
      grant = data as SafeCaseGrant
    }
    const from = searchParams.get('from') || grant?.period_start
    const to = searchParams.get('to') || grant?.period_end
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to dates are required' }, { status: 400 })
    }
    const packet = await buildGrantPacket(admin, from, to, grant)
    return NextResponse.json({
      packet,
      narrative: grant?.narrative || grantNarrativeFromPacket(packet),
    })
  } catch (err) {
    return safecaseError(err)
  }
}
