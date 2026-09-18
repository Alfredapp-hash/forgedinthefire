export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSafeCaseAccess } from '@/lib/safecase/access'
import { clientFullName, daysSince, formatWhen } from '@/lib/safecase/types'
import { StatusPill, riskClass } from '@/components/safecase/ui'

export default async function SafeCaseCaseloadPage() {
  const user = await requireSafeCaseAccess()
  const admin = await createAdminClient()
  const email = user.email || ''

  const { data: clients } = await admin
    .from('safecase_clients')
    .select('*')
    .eq('status', 'active')
    .ilike('assigned_to', email)
    .order('last_name')

  const rows = clients ?? []
  const ids = rows.map((c) => c.id)
  let flagCount = new Map<string, number>()
  let taskCount = new Map<string, number>()
  if (ids.length) {
    const [{ data: flags }, { data: tasks }] = await Promise.all([
      admin.from('safecase_safety_flags').select('client_id').eq('is_active', true).in('client_id', ids),
      admin.from('safecase_tasks').select('client_id').in('status', ['pending', 'in_progress']).in('client_id', ids),
    ])
    for (const f of flags ?? []) flagCount.set(f.client_id, (flagCount.get(f.client_id) ?? 0) + 1)
    for (const t of tasks ?? []) {
      if (t.client_id) taskCount.set(t.client_id, (taskCount.get(t.client_id) ?? 0) + 1)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#F6FAFC]">My caseload</h2>
        <p className="text-sm text-[#A9B8C6] mt-1">
          Active files assigned to {email || 'you'} — mirrors SafeCase Companion / My Caseload.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[#A9B8C6] bg-[#151B22] border border-[#27313B] rounded-2xl p-5">
          No active clients assigned to your email. Assign staff on the client overview, or open{' '}
          <Link href="/admin/safecase/clients" className="text-[#8DEBFF] underline">all clients</Link>.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => {
            const stale = daysSince(c.last_contact_at)
            return (
              <Link
                key={c.id}
                href={`/admin/safecase/clients/${c.id}`}
                className={`block rounded-xl border px-4 py-3 hover:border-[#53D6FF]/40 ${riskClass(c.risk_level)}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-[#8DEBFF]">{c.case_number || 'No case #'}</p>
                    <p className="font-semibold text-[#F6FAFC]">{clientFullName(c)}</p>
                    <p className="text-xs text-[#A9B8C6] mt-1">
                      Last contact {formatWhen(c.last_contact_at)}
                      {stale !== null && stale >= 14 ? ` · ${stale}d stale` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${riskClass(c.risk_level)}`}>
                      {c.risk_level}
                    </span>
                    {(flagCount.get(c.id) ?? 0) > 0 && <StatusPill tone="danger">{flagCount.get(c.id)} flags</StatusPill>}
                    {(taskCount.get(c.id) ?? 0) > 0 && <StatusPill>{taskCount.get(c.id)} tasks</StatusPill>}
                    {c.confidential_address && <StatusPill tone="warn">Confidential</StatusPill>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
