'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  GRANT_METRIC_KEYS,
  type GrantPacket,
  type SafeCaseGrant,
  type SafeCaseProgram,
} from '@/lib/safecase/types'
import { safecaseFetch } from '@/lib/safecase/client'
import { Banner, Field, StatusPill, inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'

function money(value: SafeCaseGrant['award_amount']) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (Number.isNaN(n)) return String(value)
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function actualFor(packet: GrantPacket, key: (typeof GRANT_METRIC_KEYS)[number]['key']) {
  return Number(packet[key])
}

export default function GrantPacketPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [grant, setGrant] = useState<SafeCaseGrant | null>(null)
  const [programs, setPrograms] = useState<SafeCaseProgram[]>([])
  const [packet, setPacket] = useState<GrantPacket | null>(null)
  const [narrative, setNarrative] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function loadGrant() {
    const [grantRes, programRows] = await Promise.all([
      fetch(`/api/admin/safecase/grants/${id}`).then((r) => r.json()),
      fetch('/api/admin/safecase/programs').then((r) => r.json()),
    ])
    if (Array.isArray(programRows)) setPrograms(programRows)
    const row = grantRes?.id ? grantRes as SafeCaseGrant : null
    if (row) {
      setGrant(row)
      setFrom(row.period_start)
      setTo(row.period_end)
      setNarrative(row.narrative || '')
    } else if (grantRes?.error) {
      setError(grantRes.error)
    }
  }

  async function loadPacket(start = from, end = to) {
    if (!id || !start || !end) return
    const data = await fetch(`/api/admin/safecase/grants/report?grant_id=${id}&from=${start}&to=${end}`).then((r) => r.json())
    if (data?.packet) setPacket(data.packet)
    if (typeof data?.narrative === 'string' && !narrative) setNarrative(data.narrative)
  }

  useEffect(() => { if (id) loadGrant() }, [id])
  useEffect(() => { if (id && from && to) loadPacket(from, to) }, [id, from, to])

  async function save(patch: Partial<SafeCaseGrant>, label = 'Saved') {
    if (!grant) return
    setSaving(true)
    setError(null)
    try {
      const next = await safecaseFetch<SafeCaseGrant>('/api/admin/safecase/grants', {
        method: 'PATCH',
        body: JSON.stringify({ id: grant.id, ...patch }),
      })
      setGrant(next)
      setOk(label)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!grant) return <p className="text-sm text-[#A9B8C6]">Loading grant file…</p>
  const targets = grant.targets || {}

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-[#8DEBFF]">{grant.funder}</p>
          <h2 className="text-2xl font-bold text-[#F6FAFC]">{grant.name}</h2>
          <p className="text-sm text-[#A9B8C6] mt-1">{money(grant.award_amount)} · {grant.period_start} to {grant.period_end}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={grant.status === 'submitted' ? 'ok' : grant.status === 'active' ? 'warn' : 'neutral'}>{grant.status}</StatusPill>
          <Button variant="secondary" onClick={() => window.print()}>Print packet</Button>
          <Button variant="secondary" onClick={() => { window.location.href = `/api/admin/safecase/export?resource=grant-report&grant_id=${grant.id}&from=${from}&to=${to}` }}>Export CSV</Button>
          <Link href="/admin/safecase/grants"><Button variant="secondary">All grants</Button></Link>
        </div>
      </div>
      <Banner error={error} ok={ok} />

      <form
        className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 grid md:grid-cols-2 gap-3 print:hidden"
        onSubmit={(e) => {
          e.preventDefault()
          save({
            name: grant.name,
            funder: grant.funder,
            award_amount: grant.award_amount,
            period_start: grant.period_start,
            period_end: grant.period_end,
            report_due_on: grant.report_due_on,
            status: grant.status,
            program_ids: grant.program_ids,
            targets: grant.targets,
            notes: grant.notes,
          })
        }}
      >
        <Field label="Grant name"><input className={inputClass} value={grant.name} onChange={(e) => setGrant({ ...grant, name: e.target.value })} /></Field>
        <Field label="Funder"><input className={inputClass} value={grant.funder} onChange={(e) => setGrant({ ...grant, funder: e.target.value })} /></Field>
        <Field label="Award"><input className={inputClass} type="number" value={grant.award_amount ?? ''} onChange={(e) => setGrant({ ...grant, award_amount: e.target.value })} /></Field>
        <Field label="Status">
          <select className={inputClass} value={grant.status} onChange={(e) => setGrant({ ...grant, status: e.target.value as SafeCaseGrant['status'] })}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="submitted">Submitted</option>
            <option value="closed">Closed</option>
          </select>
        </Field>
        <Field label="Period start"><input type="date" className={inputClass} value={grant.period_start} onChange={(e) => setGrant({ ...grant, period_start: e.target.value })} /></Field>
        <Field label="Period end"><input type="date" className={inputClass} value={grant.period_end} onChange={(e) => setGrant({ ...grant, period_end: e.target.value })} /></Field>
        <Field label="Report due"><input type="date" className={inputClass} value={grant.report_due_on ?? ''} onChange={(e) => setGrant({ ...grant, report_due_on: e.target.value })} /></Field>
        <Field label="Staff notes"><input className={inputClass} value={grant.notes ?? ''} onChange={(e) => setGrant({ ...grant, notes: e.target.value })} /></Field>
        <div className="md:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A9B8C6] mb-2">Funded programs</p>
          <div className="flex flex-wrap gap-2">
            {programs.map((p) => {
              const on = (grant.program_ids || []).includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setGrant({
                    ...grant,
                    program_ids: on ? grant.program_ids.filter((pid) => pid !== p.id) : [...(grant.program_ids || []), p.id],
                  })}
                  className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-[#53D6FF] text-[#8DEBFF] bg-[#53D6FF]/10' : 'border-[#27313B] text-[#A9B8C6]'}`}
                >
                  {p.name}
                </button>
              )
            })}
          </div>
        </div>
        {GRANT_METRIC_KEYS.map((m) => (
          <Field key={m.key} label={`${m.label} target`}>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={targets[m.key] ?? ''}
              onChange={(e) => setGrant({
                ...grant,
                targets: { ...targets, [m.key]: e.target.value === '' ? undefined : Number(e.target.value) },
              })}
            />
          </Field>
        ))}
        <div className="md:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save grant file'}</Button></div>
      </form>

      <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
          <h3 className="text-sm font-semibold text-[#F6FAFC]">Outcomes packet</h3>
          <div className="flex gap-2">
            <Field label="From"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        </div>
        <p className="text-xs text-[#A9B8C6]">Counts only. Client names stay in the case file and are not part of this packet.</p>
        {!packet ? <p className="text-sm text-[#A9B8C6]">Building packet…</p> : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ['Clients served', packet.clients_served, targets.clients_served],
                ['Completions', packet.program_completions, targets.program_completions],
                ['Bed nights', packet.bed_nights, targets.bed_nights],
                ['Completion rate', `${packet.completion_rate}%`, null],
              ].map(([label, value, target]) => (
                <div key={String(label)} className="rounded-xl border border-[#27313B] bg-[#0B1014] p-4">
                  <p className="text-[11px] uppercase tracking-widest text-[#A9B8C6]">{label}</p>
                  <p className="text-2xl font-bold text-[#F6FAFC] mt-1">{value}</p>
                  {target != null && <p className="text-xs text-[#8DEBFF] mt-1">Target {target}</p>}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {GRANT_METRIC_KEYS.map((m) => {
                const actual = actualFor(packet, m.key)
                const target = Number(targets[m.key] || 0)
                const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null
                return (
                  <div key={m.key} className="grid grid-cols-[1fr_auto_120px] gap-3 items-center">
                    <p className="text-sm text-[#F6FAFC]">{m.label}</p>
                    <p className="text-sm text-[#A9B8C6]">{actual}{target ? ` / ${target}` : ''}</p>
                    <div className="h-2 rounded-full bg-[#0B1014] overflow-hidden">
                      <div className="h-full bg-[#53D6FF]" style={{ width: `${pct ?? Math.min(100, actual)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="grid md:grid-cols-2 gap-4 pt-2">
              <div>
                <h4 className="text-xs uppercase tracking-widest text-[#A9B8C6] mb-2">Programs</h4>
                {packet.programs.map((p) => (
                  <p key={p.id} className="text-sm text-[#F6FAFC] mb-1">{p.name} · {p.enrollments} in / {p.completions} done{p.waitlist ? ` / ${p.waitlist} waitlist` : ''}</p>
                ))}
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-widest text-[#A9B8C6] mb-2">Referrals by service</h4>
                {packet.referrals_by_service.length === 0 ? <p className="text-sm text-[#A9B8C6]">None in this period.</p> : packet.referrals_by_service.map((r) => (
                  <p key={r.service} className="text-sm text-[#F6FAFC] mb-1">{r.service} · {r.count}</p>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[#F6FAFC]">Narrative</h3>
        <textarea className={inputClass} rows={6} value={narrative} onChange={(e) => setNarrative(e.target.value)} />
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button onClick={() => save({ narrative }, 'Narrative saved')}>Save narrative</Button>
          <Button variant="secondary" onClick={() => packet && setNarrative([
            `During ${packet.from} through ${packet.to}, Forged in the Fire served ${packet.clients_served} unique survivors in SafeCase.`,
            `Staff opened ${packet.new_intakes} new intakes, started ${packet.program_enrollments} program enrollments, and recorded ${packet.program_completions} completions (${packet.completion_rate}% completion rate).`,
            `${packet.veterans_served} veteran survivors were served, and ${packet.high_risk_served} files were high or critical risk.`,
            `Confidential housing covered ${packet.housed} placements and ${packet.bed_nights} bed nights.`,
            `Staff logged ${packet.contacts} contacts, made ${packet.referrals} partner referrals, completed ${packet.tasks_completed} tasks, and resolved ${packet.safety_resolved} safety flags.`,
          ].join(' '))}>Rebuild from numbers</Button>
          <Button variant="secondary" disabled={!packet} onClick={() => packet && save({
            narrative,
            snapshot: packet,
            snapshot_at: new Date().toISOString(),
            status: 'submitted',
          }, 'Snapshot saved')}>Save snapshot for submission</Button>
          <Button variant="secondary" onClick={async () => {
            if (!confirm('Delete this grant file?')) return
            await safecaseFetch(`/api/admin/safecase/grants?id=${grant.id}`, { method: 'DELETE' })
            router.push('/admin/safecase/grants')
          }}>Delete</Button>
        </div>
        {grant.snapshot_at && <p className="text-xs text-[#A9B8C6]">Last snapshot {new Date(grant.snapshot_at).toLocaleString()}</p>}
      </section>
    </div>
  )
}
