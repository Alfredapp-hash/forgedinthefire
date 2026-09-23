import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const q = (new URL(request.url).searchParams.get('q') || '').trim().replace(/[,()%]/g, '')
    if (q.length < 2) return NextResponse.json({ clients: [], tasks: [], flags: [], notes: [] })
    const [clients, tasks, flags, notes] = await Promise.all([
      admin.from('safecase_clients').select('id, first_name, last_name, preferred_name, case_number, status, risk_level')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,preferred_name.ilike.%${q}%,case_number.ilike.%${q}%,contact_email.ilike.%${q}%,contact_phone.ilike.%${q}%`)
        .limit(8),
      admin.from('safecase_tasks').select('id, task_name, status, due_date, client_id').ilike('task_name', `%${q}%`).limit(6),
      admin.from('safecase_safety_flags').select('id, flag_type, severity, client_id, is_active').ilike('flag_type', `%${q}%`).limit(6),
      admin.from('safecase_notes').select('id, narrative, client_id, created_at').ilike('narrative', `%${q}%`).limit(6),
    ])
    return NextResponse.json({
      clients: clients.data ?? [],
      tasks: tasks.data ?? [],
      flags: flags.data ?? [],
      notes: notes.data ?? [],
    })
  } catch (err) {
    return safecaseError(err)
  }
}
