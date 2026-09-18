export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSafeCaseAccess } from '@/lib/safecase/access'
import { INTAKE_ITEMS } from '@/lib/safecase/constants'
import { clientFullName, formatWhen } from '@/lib/safecase/types'
import { Button } from '@/components/ui/button'

export default async function SafeCaseIntakePage() {
  await requireSafeCaseAccess()
  const admin = await createAdminClient()

  const { data } = await admin
    .from('safecase_clients')
    .select('id, first_name, last_name, preferred_name, case_number, intake, intake_date, risk_level, created_at, status')
    .eq('status', 'active')
    .order('intake_date', { ascending: false })
    .limit(80)

  const rows = (data ?? []).map((c) => {
    const intake = (c.intake || {}) as Record<string, boolean>
    const done = INTAKE_ITEMS.filter((item) => intake[item.key]).length
    return { ...c, done, total: INTAKE_ITEMS.length, incomplete: done < INTAKE_ITEMS.length }
  })

  const pending = rows.filter((r) => r.incomplete)
  const complete = rows.filter((r) => !r.incomplete)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#F6FAFC]">Intake</h2>
          <p className="text-sm text-[#A9B8C6] mt-1">
            Crisis / new-file intake progress — checklist from SafeCase Intake System.
          </p>
        </div>
        <Link href="/admin/safecase/clients/new"><Button>New client intake</Button></Link>
      </div>

      <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-[#F6FAFC] mb-3">
          Incomplete ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-[#A9B8C6]">All active intakes have a full checklist.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/safecase/clients/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#27313B] px-3 py-2 hover:border-[#53D6FF]/40">
                  <div>
                    <p className="text-sm font-medium text-[#F6FAFC]">{clientFullName(c)}</p>
                    <p className="text-[11px] text-[#A9B8C6]">
                      {c.case_number || 'No case #'} · intake {formatWhen(c.intake_date)} · {c.risk_level} risk
                    </p>
                  </div>
                  <p className="text-xs text-[#F6C98A]">{c.done}/{c.total} checklist</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-[#F6FAFC] mb-3">
          Complete ({complete.length})
        </h3>
        {complete.length === 0 ? (
          <p className="text-sm text-[#A9B8C6]">None yet.</p>
        ) : (
          <ul className="space-y-1">
            {complete.slice(0, 20).map((c) => (
              <li key={c.id}>
                <Link href={`/admin/safecase/clients/${c.id}`} className="text-sm text-[#A9B8C6] hover:text-[#8DEBFF]">
                  {clientFullName(c)} · {c.case_number || 'No case #'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
