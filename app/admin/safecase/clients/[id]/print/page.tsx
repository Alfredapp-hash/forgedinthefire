'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  clientFullName,
  formatWhen,
  type SafeCaseAppointment,
  type SafeCaseClient,
  type SafeCaseDocument,
  type SafeCaseEnrollment,
  type SafeCaseNote,
  type SafeCasePlacement,
  type SafeCaseReferral,
  type SafeCaseSafetyFlag,
  type SafeCaseTask,
} from '@/lib/safecase/types'
import { INTAKE_ITEMS } from '@/lib/safecase/constants'
import { Button } from '@/components/ui/button'

export default function PrintCasePage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<SafeCaseClient | null>(null)
  const [notes, setNotes] = useState<SafeCaseNote[]>([])
  const [tasks, setTasks] = useState<SafeCaseTask[]>([])
  const [flags, setFlags] = useState<SafeCaseSafetyFlag[]>([])
  const [enrollments, setEnrollments] = useState<SafeCaseEnrollment[]>([])
  const [placements, setPlacements] = useState<SafeCasePlacement[]>([])
  const [referrals, setReferrals] = useState<SafeCaseReferral[]>([])
  const [appts, setAppts] = useState<SafeCaseAppointment[]>([])
  const [docs, setDocs] = useState<SafeCaseDocument[]>([])

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetch(`/api/admin/safecase/clients/${id}`).then((r) => r.json()),
      fetch(`/api/admin/safecase/notes?client_id=${id}`).then((r) => r.json()),
      fetch(`/api/admin/safecase/tasks?client_id=${id}`).then((r) => r.json()),
      fetch(`/api/admin/safecase/safety?client_id=${id}`).then((r) => r.json()),
      fetch(`/api/admin/safecase/enrollments?client_id=${id}`).then((r) => r.json()),
      fetch(`/api/admin/safecase/placements?client_id=${id}`).then((r) => r.json()),
      fetch('/api/admin/safecase/referrals').then((r) => r.json()),
      fetch(`/api/admin/safecase/appointments?client_id=${id}`).then((r) => r.json()),
      fetch(`/api/admin/safecase/documents?client_id=${id}`).then((r) => r.json()),
    ]).then(([c, n, t, f, e, p, r, a, d]) => {
      if (c?.id) setClient(c)
      if (Array.isArray(n)) setNotes(n)
      if (Array.isArray(t)) setTasks(t)
      if (Array.isArray(f)) setFlags(f)
      if (Array.isArray(e)) setEnrollments(e)
      if (Array.isArray(p)) setPlacements(p)
      if (Array.isArray(r)) setReferrals(r.filter((row: SafeCaseReferral) => row.client_id === id))
      if (Array.isArray(a)) setAppts(a)
      if (Array.isArray(d)) setDocs(d)
    })
  }, [id])

  if (!client) return <p className="text-sm text-[#A9B8C6]">Loading summary…</p>

  const intake = client.intake || {}

  return (
    <div className="print-case max-w-3xl mx-auto space-y-6 bg-white text-black p-8 rounded-xl">
      <div className="flex justify-between items-start gap-3 print:hidden">
        <p className="text-sm text-[#A9B8C6]">Staff-only case summary. Do not leave printed copies unattended.</p>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <header className="border-b border-black/20 pb-4">
        <p className="text-xs uppercase tracking-widest">Forged in the Fire · SafeCase</p>
        <h1 className="text-3xl font-bold mt-1">{clientFullName(client)}</h1>
        <p className="text-sm mt-1">
          {[client.case_number, client.status, `${client.risk_level} risk`, client.assigned_to].filter(Boolean).join(' · ')}
        </p>
        <p className="text-sm mt-1">
          {[client.contact_phone, client.contact_email, client.pronouns].filter(Boolean).join(' · ') || 'No contact listed'}
        </p>
      </header>
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest mb-2">Intake</h2>
        <p className="text-sm">Intake date: {client.intake_date || '—'}</p>
        <p className="text-sm">Emergency: {[client.emergency_contact_name, client.emergency_contact_phone].filter(Boolean).join(' · ') || '—'}</p>
        <ul className="text-sm mt-2 columns-2">
          {INTAKE_ITEMS.map((item) => (
            <li key={item.key}>{intake[item.key] ? '☑' : '☐'} {item.label}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest mb-2">Safety</h2>
        {flags.filter((f) => f.is_active).length === 0 ? <p className="text-sm">No active flags.</p> : flags.filter((f) => f.is_active).map((f) => (
          <p key={f.id} className="text-sm mb-1">{f.flag_type} · {f.severity} — {f.description_text}</p>
        ))}
      </section>
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest mb-2">Programs & housing</h2>
        {enrollments.map((e) => (
          <p key={e.id} className="text-sm">{e.program?.name} · {e.status}</p>
        ))}
        {placements.filter((p) => p.status === 'active').map((p) => (
          <p key={p.id} className="text-sm">Housed: {p.house?.name} since {formatWhen(p.moved_in_at)}</p>
        ))}
      </section>
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest mb-2">Open work</h2>
        {tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').map((t) => (
          <p key={t.id} className="text-sm">{t.task_name}{t.due_date ? ` · due ${t.due_date}` : ''}</p>
        ))}
        {appts.slice(0, 8).map((a) => (
          <p key={a.id} className="text-sm">{a.starts_on} {a.start_time || ''} · {a.title}</p>
        ))}
        {referrals.filter((r) => r.status === 'open').map((r) => (
          <p key={r.id} className="text-sm">Referral · {r.partner_name} ({r.service_type})</p>
        ))}
      </section>
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest mb-2">Recent notes</h2>
        {notes.slice(0, 8).map((n) => (
          <article key={n.id} className="mb-3">
            <p className="text-xs uppercase">{n.note_type} · {formatWhen(n.created_at)} · {n.created_by}</p>
            <p className="text-sm whitespace-pre-wrap">{n.narrative}</p>
          </article>
        ))}
      </section>
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest mb-2">Documents on file</h2>
        {docs.length === 0 ? <p className="text-sm">None uploaded.</p> : docs.map((d) => (
          <p key={d.id} className="text-sm">{d.filename}</p>
        ))}
      </section>
    </div>
  )
}
