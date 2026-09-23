export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSafeCaseAccess } from '@/lib/safecase/access'
import { ReportsExport } from './ReportsExport'
import { Button } from '@/components/ui/button'

export default async function SafeCaseReportsPage() {
  await requireSafeCaseAccess()
  const admin = await createAdminClient()
  const monthAgo = new Date()
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  const [
    { count: clients },
    { count: activeClients },
    { count: newClients },
    { count: notes },
    { count: tasks },
    { count: openTasks },
    { count: flags },
    { count: referrals },
    { count: enrollments },
    { count: veterans },
    { count: houses },
    { count: placements },
    { data: riskRows },
  ] = await Promise.all([
    admin.from('safecase_clients').select('*', { count: 'exact', head: true }),
    admin.from('safecase_clients').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('safecase_clients').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo.toISOString()),
    admin.from('safecase_notes').select('*', { count: 'exact', head: true }),
    admin.from('safecase_tasks').select('*', { count: 'exact', head: true }),
    admin.from('safecase_tasks').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
    admin.from('safecase_safety_flags').select('*', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('safecase_referrals').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    admin.from('safecase_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('safecase_clients').select('*', { count: 'exact', head: true }).eq('veteran_status', true),
    admin.from('safecase_houses').select('*', { count: 'exact', head: true }),
    admin.from('safecase_placements').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('safecase_clients').select('risk_level').eq('status', 'active'),
  ])

  const risk = { low: 0, medium: 0, high: 0, critical: 0 }
  for (const row of riskRows ?? []) {
    const key = row.risk_level as keyof typeof risk
    if (key in risk) risk[key] += 1
  }

  const rows = [
    ['All clients', clients ?? 0],
    ['Active clients', activeClients ?? 0],
    ['New this month', newClients ?? 0],
    ['Veteran clients', veterans ?? 0],
    ['Case notes', notes ?? 0],
    ['Open tasks', openTasks ?? 0],
    ['All tasks', tasks ?? 0],
    ['Active safety flags', flags ?? 0],
    ['Open referrals', referrals ?? 0],
    ['Active enrollments', enrollments ?? 0],
    ['Houses', houses ?? 0],
    ['Current placements', placements ?? 0],
    ['Low risk (active)', risk.low],
    ['Medium risk (active)', risk.medium],
    ['High risk (active)', risk.high],
    ['Critical risk (active)', risk.critical],
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#F6FAFC]">Reports</h2>
          <p className="text-sm text-[#A9B8C6]">Snapshot counts for grant and board reporting.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ReportsExport />
          <Link href="/admin/safecase/grants"><Button>Grant packets</Button></Link>
        </div>
      </div>
      <div className="bg-[#151B22] border border-[#27313B] rounded-2xl overflow-hidden">
        {rows.map(([label, value]) => (
          <div key={String(label)} className="flex justify-between px-5 py-3 border-b border-[#27313B] last:border-0">
            <span className="text-sm text-[#A9B8C6]">{label}</span>
            <span className="text-sm font-semibold text-[#F6FAFC]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
