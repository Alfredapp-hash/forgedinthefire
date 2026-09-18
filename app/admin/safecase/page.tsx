export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSafeCaseAccess } from '@/lib/safecase/access'
import { clientFullName, formatWhen } from '@/lib/safecase/types'
import { SafeCaseSearch } from '@/components/safecase/search-panel'
import { DashboardFollowup } from '@/components/safecase/dashboard-followup'
import { Button } from '@/components/ui/button'

function relatedName(client: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null | undefined) {
  const row = Array.isArray(client) ? client[0] : client
  return row ? ` · ${row.first_name} ${row.last_name}` : ''
}

export default async function SafeCaseDashboardPage() {
  await requireSafeCaseAccess()
  const admin = await createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date()
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  const fortnight = new Date()
  fortnight.setDate(fortnight.getDate() - 14)
  const weekOut = new Date()
  weekOut.setDate(weekOut.getDate() + 7)

  const [
    { count: activeClients },
    { count: newClients },
    { count: programs },
    { count: openTasks },
    { count: overdue },
    { count: highRisk },
    { count: flags },
    { count: openBeds },
    notesRes,
    flagRows,
    overdueRows,
    riskRows,
    todayAppts,
    weekTasks,
    staleRows,
  ] = await Promise.all([
    admin.from('safecase_clients').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('safecase_clients').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo.toISOString()),
    admin.from('safecase_programs').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('safecase_tasks').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
    admin.from('safecase_tasks').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']).lt('due_date', today),
    admin.from('safecase_clients').select('*', { count: 'exact', head: true }).in('risk_level', ['high', 'critical']),
    admin.from('safecase_safety_flags').select('*', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('safecase_houses').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    admin.from('safecase_notes').select('id, narrative, created_at, created_by, client_id').order('created_at', { ascending: false }).limit(6),
    admin.from('safecase_safety_flags').select('id, flag_type, severity, client_id, client:safecase_clients(first_name, last_name)').eq('is_active', true).order('created_at', { ascending: false }).limit(5),
    admin.from('safecase_tasks').select('id, task_name, due_date, client:safecase_clients(first_name, last_name)').in('status', ['pending', 'in_progress']).lt('due_date', today).order('due_date', { ascending: true }).limit(5),
    admin.from('safecase_clients').select('id, first_name, last_name, preferred_name, risk_level').in('risk_level', ['high', 'critical']).eq('status', 'active').order('last_name'),
    admin.from('safecase_appointments').select('id, title, starts_on, start_time, client:safecase_clients(first_name, last_name)').eq('starts_on', today).order('start_time'),
    admin.from('safecase_tasks').select('id, task_name, due_date, client_id, client:safecase_clients(first_name, last_name)').in('status', ['pending', 'in_progress']).gte('due_date', today).lte('due_date', weekOut.toISOString().slice(0, 10)).order('due_date'),
    admin.from('safecase_clients').select('id, first_name, last_name, preferred_name, last_contact_at, assigned_to').eq('status', 'active').order('last_contact_at', { ascending: true }).limit(40),
  ])

  const cards = [
    { label: 'Active clients', value: activeClients ?? 0, sub: `+${newClients ?? 0} this month`, href: '/admin/safecase/clients' },
    { label: 'Active programs', value: programs ?? 0, sub: `${openBeds ?? 0} houses open`, href: '/admin/safecase/programs' },
    { label: 'Open tasks', value: openTasks ?? 0, sub: `${overdue ?? 0} overdue`, href: '/admin/safecase/tasks' },
    { label: 'High risk', value: highRisk ?? 0, sub: `${flags ?? 0} active safety flags`, href: '/admin/safecase/safety' },
  ]

  const notes = notesRes.data ?? []
  const flagsList = flagRows.data ?? []
  const overdueList = overdueRows.data ?? []
  const riskList = riskRows.data ?? []
  const appts = todayAppts.data ?? []
  const upcoming = weekTasks.data ?? []
  const staleList = (staleRows.data ?? []).filter((c) => !c.last_contact_at || new Date(c.last_contact_at) < fortnight).slice(0, 8)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SafeCaseSearch />
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/safecase/triage"><Button variant="secondary">Triage</Button></Link>
          <Link href="/admin/safecase/clients/new"><Button>New client</Button></Link>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5 hover:border-[#53D6FF]/40">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">{c.label}</p>
            <p className="text-3xl font-bold text-[#F6FAFC]">{c.value}</p>
            <p className="text-xs text-[#A9B8C6] mt-1">{c.sub}</p>
          </Link>
        ))}
      </div>

      <section className={`rounded-2xl border p-5 ${overdueList.length || flagsList.length ? 'border-[#F6C98A]/30 bg-[#F6C98A]/5' : 'border-[#27313B] bg-[#151B22]'}`}>
        <h2 className="text-sm font-semibold text-[#F6FAFC] mb-3">Needs attention</h2>
        {overdueList.length === 0 && flagsList.length === 0 ? (
          <p className="text-sm text-[#A9B8C6]">No overdue tasks or open safety flags.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-[#A9B8C6] mb-2">Overdue tasks</p>
              {overdueList.length === 0 ? <p className="text-[#A9B8C6]">None</p> : overdueList.map((t) => (
                <p key={t.id} className="text-[#F6FAFC] mb-1">{t.task_name}{relatedName(t.client)} · {t.due_date}</p>
              ))}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-[#A9B8C6] mb-2">Open safety flags</p>
              {flagsList.length === 0 ? <p className="text-[#A9B8C6]">None</p> : flagsList.map((f) => (
                <p key={f.id} className="text-[#F6FAFC] mb-1">{f.flag_type} · {f.severity}{relatedName(f.client)}</p>
              ))}
            </div>
          </div>
        )}
      </section>

      <DashboardFollowup stale={staleList} />

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-[#F6FAFC] mb-3">Today</h2>
          {appts.length === 0 && upcoming.filter((t) => t.due_date === today).length === 0 ? (
            <p className="text-sm text-[#A9B8C6]">No appointments or tasks due today.</p>
          ) : (
            <>
              {appts.map((a) => (
                <p key={a.id} className="text-sm text-[#F6FAFC] mb-1">{a.start_time ? `${a.start_time} · ` : ''}{a.title}{relatedName(a.client)}</p>
              ))}
              {upcoming.filter((t) => t.due_date === today).map((t) => (
                <p key={t.id} className="text-sm text-[#A9B8C6] mb-1">Task · {t.task_name}{relatedName(t.client)}</p>
              ))}
            </>
          )}
        </section>
        <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-[#F6FAFC] mb-3">Due this week</h2>
          {upcoming.length === 0 ? <p className="text-sm text-[#A9B8C6]">Nothing scheduled this week.</p> : upcoming.map((t) => (
            <p key={t.id} className="text-sm text-[#F6FAFC] mb-1">{t.due_date} · {t.task_name}{relatedName(t.client)}</p>
          ))}
        </section>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-[#F6FAFC] mb-3">Recent notes</h2>
          {notes.length === 0 ? <p className="text-sm text-[#A9B8C6]">No notes yet.</p> : notes.map((n) => (
            <Link key={n.id} href={`/admin/safecase/clients/${n.client_id}`} className="block py-2 border-b border-[#27313B] last:border-0">
              <p className="text-sm text-[#F6FAFC] line-clamp-2">{n.narrative}</p>
              <p className="text-[11px] text-[#A9B8C6] mt-1">{n.created_by} · {formatWhen(n.created_at)}</p>
            </Link>
          ))}
        </section>
        <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-[#F6FAFC] mb-3">High-risk caseload</h2>
          {riskList.length === 0 ? <p className="text-sm text-[#A9B8C6]">No high-risk open files.</p> : riskList.map((c) => (
            <Link key={c.id} href={`/admin/safecase/clients/${c.id}`} className="flex justify-between py-2 border-b border-[#27313B] last:border-0 text-sm">
              <span className="text-[#F6FAFC]">{clientFullName(c)}</span>
              <span className="uppercase text-[11px] text-[#F6C98A]">{c.risk_level}</span>
            </Link>
          ))}
        </section>
      </div>
    </div>
  )
}
