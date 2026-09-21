'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GRANT_METRIC_KEYS, type GrantTargets, type SafeCaseGrant, type SafeCaseProgram } from '@/lib/safecase/types'
import { safecaseFetch } from '@/lib/safecase/client'
import { Banner, EmptyState, Field, PageHeader, StatusPill, inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'

function emptyTargets(): GrantTargets {
  return Object.fromEntries(GRANT_METRIC_KEYS.map((m) => [m.key, ''])) as GrantTargets
}

export default function GrantsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<SafeCaseGrant[]>([])
  const [programs, setPrograms] = useState<SafeCaseProgram[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    funder: '',
    award_amount: '',
    period_start: `${new Date().getFullYear()}-01-01`,
    period_end: `${new Date().getFullYear()}-12-31`,
    report_due_on: '',
    notes: '',
    program_ids: [] as string[],
    targets: emptyTargets(),
  })

  function load() {
    fetch('/api/admin/safecase/grants').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setRows(d) })
    fetch('/api/admin/safecase/programs').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setPrograms(d) })
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-5">
      <PageHeader title="Grant reporting" sub="Track funder periods, targets, and de-identified outcome packets." />
      <Banner error={error} />
      <form
        className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          try {
            const targets = Object.fromEntries(
              GRANT_METRIC_KEYS.map((m) => {
                const raw = String((form.targets as Record<string, unknown>)[m.key] ?? '').trim()
                return [m.key, raw === '' ? undefined : Number(raw)]
              }).filter(([, v]) => v != null),
            )
            const created = await safecaseFetch<SafeCaseGrant>('/api/admin/safecase/grants', {
              method: 'POST',
              body: JSON.stringify({ ...form, award_amount: form.award_amount || null, targets }),
            })
            setForm({
              name: '', funder: '', award_amount: '', period_start: form.period_start, period_end: form.period_end,
              report_due_on: '', notes: '', program_ids: [], targets: emptyTargets(),
            })
            load()
            router.push(`/admin/safecase/grants/${created.id}`)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create grant')
          }
        }}
      >
        <h3 className="text-sm font-semibold text-[#F6FAFC]">New grant file</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Grant name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="OVW FY26 Advocacy" /></Field>
          <Field label="Funder"><input className={inputClass} value={form.funder} onChange={(e) => setForm({ ...form, funder: e.target.value })} required placeholder="Office on Violence Against Women" /></Field>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <Field label="Award $"><input className={inputClass} type="number" min="0" step="0.01" value={form.award_amount} onChange={(e) => setForm({ ...form, award_amount: e.target.value })} /></Field>
          <Field label="Period start"><input className={inputClass} type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} required /></Field>
          <Field label="Period end"><input className={inputClass} type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} required /></Field>
          <Field label="Report due"><input className={inputClass} type="date" value={form.report_due_on} onChange={(e) => setForm({ ...form, report_due_on: e.target.value })} /></Field>
        </div>
        <Field label="Funded programs">
          <div className="flex flex-wrap gap-2">
            {programs.map((p) => {
              const on = form.program_ids.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setForm({
                    ...form,
                    program_ids: on ? form.program_ids.filter((id) => id !== p.id) : [...form.program_ids, p.id],
                  })}
                  className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-[#53D6FF] text-[#8DEBFF] bg-[#53D6FF]/10' : 'border-[#27313B] text-[#A9B8C6]'}`}
                >
                  {p.name}
                </button>
              )
            })}
            {programs.length === 0 && <p className="text-sm text-[#A9B8C6]">Leave empty to count all programs.</p>}
          </div>
        </Field>
        <div className="grid md:grid-cols-3 gap-3">
          {GRANT_METRIC_KEYS.map((m) => (
            <Field key={m.key} label={m.label}>
              <input
                className={inputClass}
                type="number"
                min="0"
                placeholder="Target"
                value={(form.targets as Record<string, unknown>)[m.key] as string || ''}
                onChange={(e) => setForm({ ...form, targets: { ...form.targets, [m.key]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
        <Field label="Notes"><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <Button type="submit">Create grant file</Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No grant files" body="Create a funder period to generate an outcomes packet from live SafeCase data." />
      ) : (
        <div className="space-y-3">
          {rows.map((g) => (
            <Link key={g.id} href={`/admin/safecase/grants/${g.id}`} className="block bg-[#151B22] border border-[#27313B] rounded-2xl p-4 hover:border-[#53D6FF]/40">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#F6FAFC]">{g.name}</p>
                  <p className="text-xs text-[#A9B8C6] mt-1">{g.funder} · {g.period_start} to {g.period_end}{g.report_due_on ? ` · due ${g.report_due_on}` : ''}</p>
                </div>
                <StatusPill tone={g.status === 'submitted' ? 'ok' : g.status === 'active' ? 'warn' : 'neutral'}>{g.status}</StatusPill>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
