'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { clientFullName, clientInitials, type SafeCaseClient } from '@/lib/safecase/types'
import { safecaseFetch, SafecaseRequestError } from '@/lib/safecase/client'
import { Banner, EmptyState, Field, PageHeader, StatusPill, Toggle, downloadCsv, inputClass, riskClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'

export default function SafeCaseClientsPage() {
  const [clients, setClients] = useState<SafeCaseClient[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [risk, setRisk] = useState('all')
  const [mine, setMine] = useState(false)
  const [loading, setLoading] = useState(true)

  function load() {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (status !== 'all') params.set('status', status)
    if (risk !== 'all') params.set('risk', risk)
    if (mine) params.set('assigned', 'me')
    setLoading(true)
    fetch(`/api/admin/safecase/clients?${params}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [q, status, risk, mine])

  return (
    <div className="space-y-5">
      <PageHeader title="Client files" sub={`${clients.length} records`}>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => downloadCsv('clients')}>Export CSV</Button>
          <Link href="/admin/safecase/clients/new"><Button>New client</Button></Link>
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <input className={`${inputClass} max-w-xs`} placeholder="Search name, phone, case #" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inputClass} max-w-[140px]`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="closed">Closed</option>
        </select>
        <select className={`${inputClass} max-w-[140px]`} value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="all">All risk</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <Button variant={mine ? 'default' : 'secondary'} onClick={() => setMine((v) => !v)}>
          {mine ? 'My caseload' : 'All caseloads'}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-[#A9B8C6]">Loading case files…</p>
      ) : clients.length === 0 ? (
        <EmptyState title="No clients yet" body="Open a new case file to begin intake." />
      ) : (
        <div className="space-y-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/admin/safecase/clients/${c.id}`} className="flex items-center gap-4 bg-[#151B22] border border-[#27313B] rounded-2xl p-4 hover:border-[#53D6FF]/40">
              <div className="w-12 h-12 rounded-full bg-[#53D6FF]/15 text-[#8DEBFF] flex items-center justify-center font-bold shrink-0">
                {clientInitials(c)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#F6FAFC]">{clientFullName(c)}</p>
                <p className="text-xs text-[#A9B8C6] truncate">
                  {[c.case_number, c.assigned_to, c.contact_phone, c.contact_email].filter(Boolean).join(' · ') || 'No contact on file'}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${riskClass(c.risk_level)}`}>{c.risk_level} risk</span>
                  <StatusPill tone={c.status === 'active' ? 'ok' : 'neutral'}>{c.status}</StatusPill>
                  {!!c.active_flags && <StatusPill tone="danger">{c.active_flags} flags</StatusPill>}
                  {!!c.open_tasks && <StatusPill tone="warn">{c.open_tasks} tasks</StatusPill>}
                  {c.veteran_status && <StatusPill>Veteran</StatusPill>}
                  {c.confidential_address && <StatusPill tone="warn">Confidential address</StatusPill>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function NewClientForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [matches, setMatches] = useState<Array<{ id: string; first_name: string; last_name: string; preferred_name?: string | null; case_number?: string | null; status?: string }>>([])
  const [form, setForm] = useState({
    first_name: '', last_name: '', preferred_name: '', pronouns: '', contact_email: '', contact_phone: '',
    risk_level: 'low', status: 'active', veteran_status: false, confidential_address: false, date_of_birth: '',
    assigned_to: '', emergency_contact_name: '', emergency_contact_phone: '', intake_date: new Date().toISOString().slice(0, 10),
  })

  async function submit(e: React.FormEvent, confirmDuplicate = false) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = await safecaseFetch<SafeCaseClient>('/api/admin/safecase/clients', {
        method: 'POST',
        body: JSON.stringify({ ...form, confirm_duplicate: confirmDuplicate }),
      })
      router.push(`/admin/safecase/clients/${data.id}`)
    } catch (err) {
      if (err instanceof SafecaseRequestError && err.payload.duplicate) {
        setMatches((err.payload.matches as typeof matches) || [])
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Could not create client')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => submit(e)} className="max-w-xl space-y-4 bg-[#151B22] border border-[#27313B] rounded-2xl p-6">
      <h2 className="text-xl font-bold text-[#F6FAFC]">Open a case file</h2>
      <Banner error={error} />
      {matches.length > 0 && (
        <div className="rounded-xl border border-[#F6C98A]/30 bg-[#F6C98A]/5 p-3 space-y-2">
          {matches.map((m) => (
            <Link key={m.id} href={`/admin/safecase/clients/${m.id}`} className="block text-sm text-[#8DEBFF]">
              {m.first_name} {m.last_name} · {m.case_number || 'no case #'} · {m.status}
            </Link>
          ))}
          <Button type="button" variant="secondary" onClick={(e) => submit(e, true)}>Create anyway</Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><input required className={inputClass} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
        <Field label="Last name"><input required className={inputClass} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Preferred name"><input className={inputClass} value={form.preferred_name} onChange={(e) => setForm({ ...form, preferred_name: e.target.value })} /></Field>
        <Field label="Pronouns"><input className={inputClass} value={form.pronouns} onChange={(e) => setForm({ ...form, pronouns: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email"><input type="email" className={inputClass} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Risk">
          <select className={inputClass} value={form.risk_level} onChange={(e) => setForm({ ...form, risk_level: e.target.value })}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
          </select>
        </Field>
        <Field label="Intake date"><input type="date" className={inputClass} value={form.intake_date} onChange={(e) => setForm({ ...form, intake_date: e.target.value })} /></Field>
      </div>
      <Field label="Assigned staff"><input className={inputClass} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} placeholder="Staff email" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Emergency contact"><input className={inputClass} value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></Field>
        <Field label="Emergency phone"><input className={inputClass} value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></Field>
      </div>
      <Field label="Date of birth"><input type="date" className={inputClass} value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
      <Toggle label="Veteran status" checked={form.veteran_status} onChange={(next) => setForm({ ...form, veteran_status: next })} />
      <Toggle label="Confidential address" checked={form.confidential_address} onChange={(next) => setForm({ ...form, confidential_address: next })} />
      <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create client'}</Button>
    </form>
  )
}
