import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'
import { toCsv } from '@/lib/safecase/csv'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const url = new URL(request.url)
    const resource = url.searchParams.get('resource') || 'clients'
    if (resource === 'clients') {
      const { data, error } = await admin.from('safecase_clients').select('*').order('last_name')
      if (error) throw error
      const csv = toCsv(data ?? [], [
        'case_number', 'first_name', 'last_name', 'preferred_name', 'status', 'risk_level',
        'assigned_to', 'contact_email', 'contact_phone', 'veteran_status', 'intake_date',
      ])
      return csvResponse('safecase-clients.csv', csv)
    }
    if (resource === 'tasks') {
      const { data, error } = await admin.from('safecase_tasks').select('task_name, status, priority, due_date, assigned_to, created_at').order('due_date')
      if (error) throw error
      return csvResponse('safecase-tasks.csv', toCsv(data ?? [], ['task_name', 'status', 'priority', 'due_date', 'assigned_to', 'created_at']))
    }
    if (resource === 'safety') {
      const { data, error } = await admin.from('safecase_safety_flags').select('flag_type, severity, is_active, created_at, resolved_at').order('created_at', { ascending: false })
      if (error) throw error
      return csvResponse('safecase-safety.csv', toCsv(data ?? [], ['flag_type', 'severity', 'is_active', 'created_at', 'resolved_at']))
    }
    if (resource === 'referrals') {
      const { data, error } = await admin.from('safecase_referrals').select('partner_name, service_type, status, contact_name, follow_up_date, created_at').order('created_at', { ascending: false })
      if (error) throw error
      return csvResponse('safecase-referrals.csv', toCsv(data ?? [], ['partner_name', 'service_type', 'status', 'contact_name', 'follow_up_date', 'created_at']))
    }
    if (resource === 'enrollments') {
      const { data, error } = await admin
        .from('safecase_enrollments')
        .select('status, enrolled_at, completed_at, client:safecase_clients(first_name, last_name), program:safecase_programs(name)')
      if (error) throw error
      const rows = (data ?? []).map((row) => {
        const client = Array.isArray(row.client) ? row.client[0] : row.client
        const program = Array.isArray(row.program) ? row.program[0] : row.program
        return {
          client: client ? `${client.first_name} ${client.last_name}` : '',
          program: program?.name ?? '',
          status: row.status,
          enrolled_at: row.enrolled_at,
          completed_at: row.completed_at,
        }
      })
      return csvResponse('safecase-enrollments.csv', toCsv(rows, ['client', 'program', 'status', 'enrolled_at', 'completed_at']))
    }
    if (resource === 'grant-report') {
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      const grantId = url.searchParams.get('grant_id')
      let grant = null
      if (grantId) {
        const { data, error } = await admin.from('safecase_grants').select('*').eq('id', grantId).single()
        if (error) throw error
        grant = data
      }
      const start = from || grant?.period_start
      const end = to || grant?.period_end
      if (!start || !end) return NextResponse.json({ error: 'from and to required' }, { status: 400 })
      const { buildGrantPacket, packetToCsvRows } = await import('@/lib/safecase/grants')
      const packet = await buildGrantPacket(admin, start, end, grant)
      const rows = packetToCsvRows(packet, grant?.targets || {})
      return csvResponse('safecase-grant-report.csv', toCsv(rows, ['metric', 'actual', 'target']))
    }
    return NextResponse.json({ error: 'Unknown export' }, { status: 400 })
  } catch (err) {
    return safecaseError(err)
  }
}

function csvResponse(filename: string, csv: string) {
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
