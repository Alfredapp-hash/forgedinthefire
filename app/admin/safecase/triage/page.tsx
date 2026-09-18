export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSafeCaseAccess } from '@/lib/safecase/access'
import { clientFullName, formatWhen } from '@/lib/safecase/types'

type QueueItem = {
  id: string
  href: string
  title: string
  detail: string
  tone: 'danger' | 'warn' | 'neutral'
}

export default async function SafeCaseTriagePage() {
  await requireSafeCaseAccess()
  const admin = await createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const [
    pendingNotes,
    highRisk,
    activeFlags,
    overdueTasks,
    incompleteIntake,
  ] = await Promise.all([
    admin.from('safecase_notes').select('id, narrative, created_at, client_id, client:safecase_clients(first_name, last_name, preferred_name)').eq('supervisor_review', true).order('created_at', { ascending: false }).limit(20),
    admin.from('safecase_clients').select('id, first_name, last_name, preferred_name, risk_level, case_number').eq('status', 'active').in('risk_level', ['high', 'critical']).order('last_name').limit(20),
    admin.from('safecase_safety_flags').select('id, flag_type, severity, client_id, client:safecase_clients(first_name, last_name)').eq('is_active', true).order('created_at', { ascending: false }).limit(20),
    admin.from('safecase_tasks').select('id, task_name, due_date, client_id, client:safecase_clients(first_name, last_name)').in('status', ['pending', 'in_progress']).lt('due_date', today).order('due_date').limit(20),
    admin.from('safecase_clients').select('id, first_name, last_name, preferred_name, intake, intake_date, case_number').eq('status', 'active').order('intake_date', { ascending: true }).limit(40),
  ])

  const intakeQueue = (incompleteIntake.data ?? []).filter((c) => {
    const intake = (c.intake || {}) as Record<string, boolean>
    const done = ['consent_on_file', 'safety_screened', 'emergency_contact_complete'].filter((k) => intake[k]).length
    return done < 3
  }).slice(0, 15)

  const queues: { label: string; items: QueueItem[] }[] = [
    {
      label: 'Notes awaiting supervisor review',
      items: (pendingNotes.data ?? []).map((n) => {
        const client = Array.isArray(n.client) ? n.client[0] : n.client
        return {
          id: n.id,
          href: `/admin/safecase/clients/${n.client_id}`,
          title: client ? clientFullName(client) : 'Client',
          detail: `${formatWhen(n.created_at)} · ${n.narrative.slice(0, 120)}`,
          tone: 'warn' as const,
        }
      }),
    },
    {
      label: 'High / critical risk caseload',
      items: (highRisk.data ?? []).map((c) => ({
        id: c.id,
        href: `/admin/safecase/clients/${c.id}`,
        title: clientFullName(c),
        detail: `${c.case_number || 'No case #'} · ${c.risk_level} risk`,
        tone: 'danger' as const,
      })),
    },
    {
      label: 'Active safety flags',
      items: (activeFlags.data ?? []).map((f) => {
        const client = Array.isArray(f.client) ? f.client[0] : f.client
        return {
          id: f.id,
          href: `/admin/safecase/clients/${f.client_id}`,
          title: `${f.flag_type} · ${f.severity}`,
          detail: client ? `${client.first_name} ${client.last_name}` : 'Client',
          tone: 'danger' as const,
        }
      }),
    },
    {
      label: 'Overdue tasks',
      items: (overdueTasks.data ?? []).map((t) => {
        const client = Array.isArray(t.client) ? t.client[0] : t.client
        return {
          id: t.id,
          href: t.client_id ? `/admin/safecase/clients/${t.client_id}` : '/admin/safecase/tasks',
          title: t.task_name,
          detail: `Due ${t.due_date}${client ? ` · ${client.first_name} ${client.last_name}` : ''}`,
          tone: 'warn' as const,
        }
      }),
    },
    {
      label: 'Intake incomplete',
      items: intakeQueue.map((c) => ({
        id: c.id,
        href: `/admin/safecase/clients/${c.id}`,
        title: clientFullName(c),
        detail: `Intake ${c.intake_date || '—'} · missing core checklist items`,
        tone: 'neutral' as const,
      })),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#F6FAFC]">Supervisor triage</h2>
        <p className="text-sm text-[#A9B8C6] mt-1">
          Native SafeCase queues: pending note reviews, high-risk files, safety flags, overdue work, and incomplete intakes.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {queues.map((q) => (
          <section key={q.label} className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-[#F6FAFC]">{q.label}</h3>
              <span className="text-[11px] uppercase tracking-widest text-[#A9B8C6]">{q.items.length}</span>
            </div>
            {q.items.length === 0 ? (
              <p className="text-sm text-[#A9B8C6]">Clear.</p>
            ) : (
              <ul className="space-y-2">
                {q.items.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="block rounded-lg border border-[#27313B] px-3 py-2 hover:border-[#53D6FF]/40">
                      <p className={`text-sm font-medium ${item.tone === 'danger' ? 'text-[#F6A9A9]' : item.tone === 'warn' ? 'text-[#F6C98A]' : 'text-[#F6FAFC]'}`}>
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#A9B8C6] mt-0.5 line-clamp-2">{item.detail}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
