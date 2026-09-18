'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  clientFullName,
  clientInitials,
  daysSince,
  formatWhen,
  type NoteType,
  type RiskLevel,
  type SafeCaseAppointment,
  type SafeCaseClient,
  type SafeCaseDocument,
  type SafeCaseEnrollment,
  type SafeCaseHouse,
  type SafeCaseNote,
  type SafeCasePlacement,
  type SafeCaseProgram,
  type SafeCaseReferral,
  type SafeCaseSafetyFlag,
  type SafeCaseTask,
} from '@/lib/safecase/types'
import { FLAG_TYPES, INTAKE_ITEMS, SERVICE_TYPES, COMM_TYPES, COMM_DIRECTIONS, OUTCOME_TYPES } from '@/lib/safecase/constants'
import { safecaseFetch, SafecaseRequestError } from '@/lib/safecase/client'
import { Banner, EmptyState, Field, StatusPill, Toggle, inputClass, riskClass } from '@/components/safecase/ui'
import { ClientSubstanceForms, SafeContactBanner } from '@/components/safecase/client-substance'
import { Button } from '@/components/ui/button'
import type { SafeCaseCommunication, SafeCaseProgramOutcome } from '@/lib/safecase/types'

const tabs = ['overview', 'timeline', 'notes', 'contact', 'tasks', 'safety', 'programs', 'housing', 'referrals', 'files'] as const
type Tab = (typeof tabs)[number]

type TimelineItem = { id: string; at: string; label: string; body: string }

export default function Client360Page() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [client, setClient] = useState<SafeCaseClient | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [notes, setNotes] = useState<SafeCaseNote[]>([])
  const [tasks, setTasks] = useState<SafeCaseTask[]>([])
  const [flags, setFlags] = useState<SafeCaseSafetyFlag[]>([])
  const [enrollments, setEnrollments] = useState<SafeCaseEnrollment[]>([])
  const [programs, setPrograms] = useState<SafeCaseProgram[]>([])
  const [docs, setDocs] = useState<SafeCaseDocument[]>([])
  const [houses, setHouses] = useState<SafeCaseHouse[]>([])
  const [placements, setPlacements] = useState<SafeCasePlacement[]>([])
  const [referrals, setReferrals] = useState<SafeCaseReferral[]>([])
  const [appts, setAppts] = useState<SafeCaseAppointment[]>([])
  const [comms, setComms] = useState<SafeCaseCommunication[]>([])
  const [outcomes, setOutcomes] = useState<SafeCaseProgramOutcome[]>([])
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState<NoteType>('progress')
  const [noteConfidential, setNoteConfidential] = useState(false)
  const [noteSupervisor, setNoteSupervisor] = useState(false)
  const [noteFollowUp, setNoteFollowUp] = useState('')
  const [noteFilter, setNoteFilter] = useState('all')
  const [commType, setCommType] = useState('call')
  const [commDir, setCommDir] = useState('outbound')
  const [commContent, setCommContent] = useState('')
  const [commSafe, setCommSafe] = useState(true)
  const [outcomeEnrollment, setOutcomeEnrollment] = useState('')
  const [outcomeType, setOutcomeType] = useState('safety_plan')
  const [outcomeValue, setOutcomeValue] = useState('')
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [editNarrative, setEditNarrative] = useState('')
  const [taskName, setTaskName] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [taskDetails, setTaskDetails] = useState('')
  const [flagType, setFlagType] = useState('Restraining order')
  const [flagDesc, setFlagDesc] = useState('')
  const [flagSeverity, setFlagSeverity] = useState<RiskLevel>('high')
  const [programId, setProgramId] = useState('')
  const [houseId, setHouseId] = useState('')
  const [partner, setPartner] = useState('')
  const [service, setService] = useState('Housing')
  const [contactText, setContactText] = useState('')
  const [apptTitle, setApptTitle] = useState('')
  const [apptDate, setApptDate] = useState('')
  const [apptTime, setApptTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function load() {
    const c = await fetch(`/api/admin/safecase/clients/${id}`).then((r) => r.json())
    if (c?.id) setClient(c)
    const [n, t, f, e, p, d, h, pl, r, a, cm] = await Promise.all([
      fetch(`/api/admin/safecase/notes?client_id=${id}`).then((r) => r.json()),
      fetch(`/api/admin/safecase/tasks?client_id=${id}`).then((r) => r.json()),
      fetch(`/api/admin/safecase/safety?client_id=${id}`).then((r) => r.json()),
      fetch(`/api/admin/safecase/enrollments?client_id=${id}`).then((r) => r.json()),
      fetch('/api/admin/safecase/programs').then((r) => r.json()),
      fetch(`/api/admin/safecase/documents?client_id=${id}`).then((r) => r.json()),
      fetch('/api/admin/safecase/houses').then((r) => r.json()),
      fetch(`/api/admin/safecase/placements?client_id=${id}`).then((r) => r.json()),
      fetch('/api/admin/safecase/referrals').then((r) => r.json()),
      fetch(`/api/admin/safecase/appointments?client_id=${id}`).then((r) => r.json()),
      fetch(`/api/admin/safecase/communications?client_id=${id}`).then((r) => r.json()),
    ])
    if (Array.isArray(n)) setNotes(n)
    if (Array.isArray(t)) setTasks(t)
    if (Array.isArray(f)) setFlags(f)
    if (Array.isArray(e)) {
      setEnrollments(e)
      const enrollIds = e.map((row: SafeCaseEnrollment) => row.id)
      if (enrollIds.length) {
        const allOutcomes: SafeCaseProgramOutcome[] = []
        await Promise.all(enrollIds.map(async (eid: string) => {
          const o = await fetch(`/api/admin/safecase/outcomes?enrollment_id=${eid}`).then((r) => r.json())
          if (Array.isArray(o)) allOutcomes.push(...o)
        }))
        setOutcomes(allOutcomes)
      } else setOutcomes([])
    }
    if (Array.isArray(p)) setPrograms(p)
    if (Array.isArray(d)) setDocs(d)
    if (Array.isArray(h)) setHouses(h)
    if (Array.isArray(pl)) setPlacements(pl)
    if (Array.isArray(r)) setReferrals(r.filter((row: SafeCaseReferral) => row.client_id === id))
    if (Array.isArray(a)) setAppts(a)
    if (Array.isArray(cm)) setComms(cm)
  }

  useEffect(() => { if (id) load() }, [id])

  const filteredNotes = useMemo(
    () => notes.filter((n) => noteFilter === 'all' || n.note_type === noteFilter),
    [notes, noteFilter],
  )

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...notes.map((n) => ({ id: `n-${n.id}`, at: n.created_at, label: `Note · ${n.note_type}`, body: n.narrative })),
      ...tasks.map((t) => ({ id: `t-${t.id}`, at: t.created_at, label: `Task · ${t.status}`, body: t.task_name })),
      ...flags.map((f) => ({ id: `f-${f.id}`, at: f.created_at, label: `Safety · ${f.flag_type}`, body: f.description_text })),
      ...enrollments.map((e) => ({ id: `e-${e.id}`, at: e.enrolled_at, label: `Program · ${e.status}`, body: e.program?.name || 'Program' })),
      ...placements.map((p) => ({ id: `p-${p.id}`, at: p.moved_in_at, label: `Housing · ${p.status}`, body: p.house?.name || 'House' })),
      ...appts.map((a) => ({ id: `a-${a.id}`, at: `${a.starts_on}T${a.start_time || '00:00'}`, label: 'Appointment', body: a.title })),
      ...docs.map((d) => ({ id: `d-${d.id}`, at: d.created_at, label: 'File', body: d.filename })),
      ...referrals.map((r) => ({ id: `r-${r.id}`, at: r.created_at, label: `Referral · ${r.status}`, body: r.partner_name })),
      ...comms.map((c) => ({ id: `c-${c.id}`, at: c.created_at, label: `Comm · ${c.communication_type}`, body: c.content || c.subject || '' })),
    ]
    return items.sort((a, b) => +new Date(b.at) - +new Date(a.at))
  }, [notes, tasks, flags, enrollments, placements, appts, docs, referrals, comms])

  async function run(label: string, fn: () => Promise<void>) {
    setError(null); setOk(null)
    try {
      await fn()
      setOk(label)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    }
  }

  if (!client) return <p className="text-sm text-[#A9B8C6]">Loading case file…</p>

  const staleDays = daysSince(client.last_contact_at)
  const intake = client.intake || {}
  const intakeDone = INTAKE_ITEMS.filter((item) => intake[item.key]).length

  async function saveClient(patch: Partial<SafeCaseClient>) {
    setSaving(true)
    setError(null)
    try {
      const next = await safecaseFetch<SafeCaseClient>(`/api/admin/safecase/clients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      setClient(next)
      setOk('Saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function enroll(waitlist = false) {
    await run(waitlist ? 'Added to waitlist' : 'Enrolled', async () => {
      try {
        await safecaseFetch('/api/admin/safecase/enrollments', {
          method: 'POST',
          body: JSON.stringify({ client_id: id, program_id: programId, waitlist }),
        })
        setProgramId('')
      } catch (err) {
        if (!waitlist && err instanceof SafecaseRequestError && err.payload.waitlist) {
          if (confirm(err.message)) {
            await safecaseFetch('/api/admin/safecase/enrollments', {
              method: 'POST',
              body: JSON.stringify({ client_id: id, program_id: programId, waitlist: true }),
            })
            setProgramId('')
            return
          }
        }
        throw err
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 ${riskClass(client.risk_level)}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-4">
            <div className="w-14 h-14 rounded-full bg-[#0B1014] text-[#8DEBFF] flex items-center justify-center font-bold shrink-0">
              {clientInitials(client)}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-[#8DEBFF]">{client.case_number || 'No case number'}</p>
              <h2 className="text-2xl font-bold text-[#F6FAFC]">{clientFullName(client)}</h2>
              <p className="text-sm text-[#A9B8C6] mt-1">{[client.pronouns, client.assigned_to, client.contact_email, client.contact_phone].filter(Boolean).join(' · ') || 'No contact listed'}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <StatusPill tone={client.status === 'active' ? 'ok' : 'neutral'}>{client.status}</StatusPill>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${riskClass(client.risk_level)}`}>{client.risk_level} risk</span>
                {client.veteran_status && <StatusPill>Veteran</StatusPill>}
                {client.confidential_address && <StatusPill tone="warn">Confidential address</StatusPill>}
                {flags.some((f) => f.is_active) && <StatusPill tone="danger">Active safety flag</StatusPill>}
                {staleDays === null || staleDays >= 14 ? <StatusPill tone="warn">No contact {staleDays === null ? 'logged' : `${staleDays}d`}</StatusPill> : null}
                <StatusPill>{intakeDone}/{INTAKE_ITEMS.length} intake</StatusPill>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/safecase/clients/${id}/print`}><Button variant="secondary">Print summary</Button></Link>
            {client.status === 'active' ? (
              <Button variant="secondary" onClick={() => { if (confirm('Close this case file?')) saveClient({ status: 'closed' }) }}>Close file</Button>
            ) : (
              <Button variant="secondary" onClick={() => saveClient({ status: 'active' })}>Reopen file</Button>
            )}
            <Button variant="secondary" onClick={() => router.push('/admin/safecase/clients')}>Back to list</Button>
          </div>
        </div>
      </div>
      <Banner error={error} ok={ok} />
      <SafeContactBanner rules={client.safe_contact_rules} />

      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase ${tab === t ? 'bg-[#53D6FF]/15 text-[#8DEBFF]' : 'text-[#A9B8C6]'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <form
            className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              await saveClient({
                first_name: client.first_name,
                last_name: client.last_name,
                preferred_name: client.preferred_name,
                pronouns: client.pronouns,
                contact_email: client.contact_email,
                contact_phone: client.contact_phone,
                status: client.status,
                risk_level: client.risk_level,
                veteran_status: client.veteran_status,
                confidential_address: client.confidential_address,
                date_of_birth: client.date_of_birth,
                assigned_to: client.assigned_to,
                emergency_contact_name: client.emergency_contact_name,
                emergency_contact_phone: client.emergency_contact_phone,
                intake_date: client.intake_date,
                case_number: client.case_number,
              })
            }}
          >
            <h3 className="text-sm font-semibold text-[#F6FAFC]">Case details</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First"><input className={inputClass} value={client.first_name} onChange={(e) => setClient({ ...client, first_name: e.target.value })} /></Field>
              <Field label="Last"><input className={inputClass} value={client.last_name} onChange={(e) => setClient({ ...client, last_name: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preferred"><input className={inputClass} value={client.preferred_name ?? ''} onChange={(e) => setClient({ ...client, preferred_name: e.target.value })} /></Field>
              <Field label="Pronouns"><input className={inputClass} value={client.pronouns ?? ''} onChange={(e) => setClient({ ...client, pronouns: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email"><input className={inputClass} value={client.contact_email ?? ''} onChange={(e) => setClient({ ...client, contact_email: e.target.value })} /></Field>
              <Field label="Phone"><input className={inputClass} value={client.contact_phone ?? ''} onChange={(e) => setClient({ ...client, contact_phone: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select className={inputClass} value={client.status} onChange={(e) => setClient({ ...client, status: e.target.value as SafeCaseClient['status'] })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="Risk">
                <select className={inputClass} value={client.risk_level} onChange={(e) => setClient({ ...client, risk_level: e.target.value as RiskLevel })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
            </div>
            <Field label="Assigned staff"><input className={inputClass} value={client.assigned_to ?? ''} onChange={(e) => setClient({ ...client, assigned_to: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Emergency contact"><input className={inputClass} value={client.emergency_contact_name ?? ''} onChange={(e) => setClient({ ...client, emergency_contact_name: e.target.value })} /></Field>
              <Field label="Emergency phone"><input className={inputClass} value={client.emergency_contact_phone ?? ''} onChange={(e) => setClient({ ...client, emergency_contact_phone: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Intake"><input type="date" className={inputClass} value={client.intake_date ?? ''} onChange={(e) => setClient({ ...client, intake_date: e.target.value })} /></Field>
              <Field label="Date of birth"><input type="date" className={inputClass} value={client.date_of_birth ?? ''} onChange={(e) => setClient({ ...client, date_of_birth: e.target.value })} /></Field>
            </div>
            <Toggle label="Veteran status" checked={client.veteran_status} onChange={(next) => setClient({ ...client, veteran_status: next })} />
            <Toggle label="Confidential address" checked={client.confidential_address} onChange={(next) => setClient({ ...client, confidential_address: next })} />
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</Button>
          </form>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4">
                <p className="text-xs uppercase tracking-widest text-[#A9B8C6]">Open tasks</p>
                <p className="text-2xl font-bold text-[#F6FAFC]">{tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length}</p>
              </div>
              <div className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4">
                <p className="text-xs uppercase tracking-widest text-[#A9B8C6]">Notes</p>
                <p className="text-2xl font-bold text-[#F6FAFC]">{notes.length}</p>
              </div>
              <div className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4">
                <p className="text-xs uppercase tracking-widest text-[#A9B8C6]">Last contact</p>
                <p className="text-sm text-[#F6FAFC] mt-1">{formatWhen(client.last_contact_at)}</p>
              </div>
            </div>
            <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-[#F6FAFC]">Intake checklist</h3>
              {INTAKE_ITEMS.map((item) => (
                <Toggle
                  key={item.key}
                  label={item.label}
                  checked={Boolean(intake[item.key])}
                  onChange={(next) => saveClient({ intake: { ...intake, [item.key]: next } })}
                />
              ))}
            </section>
            <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-2" onSubmit={(e) => {
              e.preventDefault()
              run('Contact logged', async () => {
                await safecaseFetch('/api/admin/safecase/notes', {
                  method: 'POST',
                  body: JSON.stringify({ client_id: id, note_type: 'contact', narrative: contactText }),
                })
                setContactText('')
              })
            }}>
              <h3 className="text-sm font-semibold text-[#F6FAFC]">Log contact</h3>
              <textarea className={inputClass} rows={3} placeholder="Call, text, or visit" value={contactText} onChange={(e) => setContactText(e.target.value)} required />
              <Button type="submit">Log contact</Button>
            </form>
            <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-2" onSubmit={(e) => {
              e.preventDefault()
              run('Appointment added', async () => {
                await safecaseFetch('/api/admin/safecase/appointments', {
                  method: 'POST',
                  body: JSON.stringify({ client_id: id, title: apptTitle, starts_on: apptDate, start_time: apptTime || null }),
                })
                setApptTitle(''); setApptDate(''); setApptTime('')
              })
            }}>
              <h3 className="text-sm font-semibold text-[#F6FAFC]">Upcoming</h3>
              {appts.length === 0 ? <p className="text-sm text-[#A9B8C6]">No appointments on file.</p> : appts.slice(0, 6).map((a) => (
                <p key={a.id} className="text-sm text-[#F6FAFC] mb-1">{a.starts_on} {a.start_time || ''} · {a.title}</p>
              ))}
              <Field label="Title"><input className={inputClass} value={apptTitle} onChange={(e) => setApptTitle(e.target.value)} required /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date"><input type="date" className={inputClass} value={apptDate} onChange={(e) => setApptDate(e.target.value)} required /></Field>
                <Field label="Time"><input type="time" className={inputClass} value={apptTime} onChange={(e) => setApptTime(e.target.value)} /></Field>
              </div>
              <Button type="submit">Add appointment</Button>
            </form>
          </div>
        </div>
        <ClientSubstanceForms client={client} setClient={setClient} onSave={saveClient} saving={saving} />
        </div>
      )}

      {tab === 'timeline' && (
        <div className="space-y-3">
          {timeline.length === 0 ? <EmptyState title="Empty timeline" body="Notes, tasks, programs, and files will appear here." /> : timeline.map((item) => (
            <article key={item.id} className="bg-[#151B22] border border-[#27313B] rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-widest text-[#8DEBFF]">{item.label} · {formatWhen(item.at)}</p>
              <p className="text-sm text-[#F6FAFC] mt-1 whitespace-pre-wrap">{item.body}</p>
            </article>
          ))}
        </div>
      )}

      {tab === 'notes' && (
        <div className="space-y-4">
          <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-3" onSubmit={(e) => {
            e.preventDefault()
            run('Note added', async () => {
              await safecaseFetch('/api/admin/safecase/notes', {
                method: 'POST',
                body: JSON.stringify({
                  client_id: id,
                  note_type: noteType,
                  narrative: noteText,
                  visibility_level: noteConfidential ? 'confidential' : 'standard',
                  supervisor_review: noteSupervisor,
                  follow_up_date: noteFollowUp || null,
                }),
              })
              setNoteText('')
              setNoteSupervisor(false)
              setNoteFollowUp('')
            })
          }}>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Note type">
                <select className={inputClass} value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)}>
                  <option value="progress">Progress</option>
                  <option value="intake">Intake</option>
                  <option value="safety">Safety</option>
                  <option value="contact">Contact</option>
                  <option value="supervision">Supervision</option>
                </select>
              </Field>
              <Field label="Follow-up date">
                <input type="date" className={inputClass} value={noteFollowUp} onChange={(e) => setNoteFollowUp(e.target.value)} />
              </Field>
              <Toggle label="Confidential note" checked={noteConfidential} onChange={setNoteConfidential} />
              <Toggle label="Needs supervisor review" checked={noteSupervisor} onChange={setNoteSupervisor} />
            </div>
            <textarea className={inputClass} rows={4} placeholder="Case narrative" value={noteText} onChange={(e) => setNoteText(e.target.value)} required />
            <Button type="submit">Add note</Button>
          </form>
          <select className={`${inputClass} max-w-[180px]`} value={noteFilter} onChange={(e) => setNoteFilter(e.target.value)}>
            <option value="all">All notes</option>
            <option value="progress">Progress</option>
            <option value="intake">Intake</option>
            <option value="safety">Safety</option>
            <option value="contact">Contact</option>
            <option value="supervision">Supervision</option>
          </select>
          {filteredNotes.length === 0 ? <EmptyState title="No notes" body="Add the first case narrative for this file." /> : filteredNotes.map((n) => (
            <article key={n.id} className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4">
              <div className="flex justify-between gap-3">
                <p className="text-[11px] uppercase tracking-widest text-[#8DEBFF]">
                  {n.note_type} · {n.visibility_level}
                  {n.supervisor_review ? ' · review needed' : ''}
                  {n.follow_up_date ? ` · follow-up ${n.follow_up_date}` : ''}
                  {' · '}{new Date(n.created_at).toLocaleString()} · {n.created_by}
                </p>
                <div className="flex gap-2">
                  {n.supervisor_review && (
                    <Button variant="secondary" onClick={() => run('Reviewed', async () => {
                      await safecaseFetch('/api/admin/safecase/notes', { method: 'PATCH', body: JSON.stringify({ id: n.id, mark_reviewed: true }) })
                    })}>Mark reviewed</Button>
                  )}
                  <Button variant="secondary" onClick={() => { setEditingNote(n.id); setEditNarrative(n.narrative) }}>Edit</Button>
                  <Button variant="secondary" onClick={() => { if (confirm('Delete this note?')) run('Note removed', async () => { await safecaseFetch(`/api/admin/safecase/notes?id=${n.id}`, { method: 'DELETE' }) }) }}>Delete</Button>
                </div>
              </div>
              {editingNote === n.id ? (
                <form className="mt-2 space-y-2" onSubmit={(e) => {
                  e.preventDefault()
                  run('Note updated', async () => {
                    await safecaseFetch('/api/admin/safecase/notes', { method: 'PATCH', body: JSON.stringify({ id: n.id, narrative: editNarrative }) })
                    setEditingNote(null)
                  })
                }}>
                  <textarea className={inputClass} rows={4} value={editNarrative} onChange={(e) => setEditNarrative(e.target.value)} required />
                  <div className="flex gap-2">
                    <Button type="submit">Save</Button>
                    <Button type="button" variant="secondary" onClick={() => setEditingNote(null)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-[#F6FAFC] mt-2 whitespace-pre-wrap">{n.narrative}</p>
              )}
            </article>
          ))}
        </div>
      )}

      {tab === 'contact' && (
        <div className="space-y-4">
          <SafeContactBanner rules={client.safe_contact_rules} />
          <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-3" onSubmit={(e) => {
            e.preventDefault()
            run('Communication logged', async () => {
              await safecaseFetch('/api/admin/safecase/communications', {
                method: 'POST',
                body: JSON.stringify({
                  client_id: id,
                  communication_type: commType,
                  direction: commDir,
                  content: commContent,
                  safe_contact_respected: commSafe,
                }),
              })
              setCommContent('')
            })
          }}>
            <h3 className="text-sm font-semibold text-[#F6FAFC]">Log communication</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Type">
                <select className={inputClass} value={commType} onChange={(e) => setCommType(e.target.value)}>
                  {COMM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Direction">
                <select className={inputClass} value={commDir} onChange={(e) => setCommDir(e.target.value)}>
                  {COMM_DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            </div>
            <textarea className={inputClass} rows={3} placeholder="What was said / outcome" value={commContent} onChange={(e) => setCommContent(e.target.value)} required />
            <Toggle label="Safe contact rules respected" checked={commSafe} onChange={setCommSafe} />
            <Button type="submit">Log communication</Button>
          </form>
          {comms.length === 0 ? (
            <EmptyState title="No communications" body="Calls, texts, and visits are logged here separately from case notes." />
          ) : comms.map((c) => (
            <article key={c.id} className="bg-[#151B22] border border-[#27313B] rounded-xl p-4">
              <div className="flex justify-between gap-2">
                <p className="text-[11px] uppercase tracking-widest text-[#8DEBFF]">
                  {c.direction} {c.communication_type}
                  {!c.safe_contact_respected ? ' · safe-contact warning' : ''}
                  {' · '}{formatWhen(c.created_at)} · {c.created_by}
                </p>
                <Button variant="secondary" onClick={() => {
                  if (confirm('Delete this log?')) run('Removed', async () => {
                    await safecaseFetch(`/api/admin/safecase/communications?id=${c.id}`, { method: 'DELETE' })
                  })
                }}>Delete</Button>
              </div>
              <p className="text-sm text-[#F6FAFC] mt-2 whitespace-pre-wrap">{c.content}</p>
            </article>
          ))}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="space-y-4">
          <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 grid md:grid-cols-2 gap-3" onSubmit={(e) => {
            e.preventDefault()
            run('Task added', async () => {
              await safecaseFetch('/api/admin/safecase/tasks', { method: 'POST', body: JSON.stringify({ client_id: id, task_name: taskName, due_date: taskDue || null, priority: taskPriority, details: taskDetails }) })
              setTaskName(''); setTaskDue(''); setTaskDetails('')
            })
          }}>
            <Field label="Task"><input className={inputClass} placeholder="New task" value={taskName} onChange={(e) => setTaskName(e.target.value)} required /></Field>
            <Field label="Due"><input type="date" className={inputClass} value={taskDue} onChange={(e) => setTaskDue(e.target.value)} /></Field>
            <Field label="Priority">
              <select className={inputClass} value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </Field>
            <Field label="Details"><input className={inputClass} value={taskDetails} onChange={(e) => setTaskDetails(e.target.value)} /></Field>
            <div className="md:col-span-2"><Button type="submit">Add task</Button></div>
          </form>
          {tasks.length === 0 ? <EmptyState title="No tasks" body="Add follow-up work for this case." /> : tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 bg-[#151B22] border border-[#27313B] rounded-xl p-3">
              <div className="flex-1">
                <p className="text-sm text-[#F6FAFC]">{t.task_name}</p>
                <p className="text-xs text-[#A9B8C6]">{t.priority}{t.due_date ? ` · due ${t.due_date}` : ''}{t.details ? ` · ${t.details}` : ''}</p>
              </div>
              <StatusPill tone={t.status === 'completed' ? 'ok' : t.priority === 'urgent' || t.priority === 'high' ? 'warn' : 'neutral'}>{t.status}</StatusPill>
              {t.status !== 'completed' && t.status !== 'cancelled' && (
                <>
                  <Button variant="secondary" onClick={() => run('Updated', async () => { await safecaseFetch('/api/admin/safecase/tasks', { method: 'PATCH', body: JSON.stringify({ id: t.id, status: 'in_progress' }) }) })}>Start</Button>
                  <Button variant="secondary" onClick={() => run('Completed', async () => { await safecaseFetch('/api/admin/safecase/tasks', { method: 'PATCH', body: JSON.stringify({ id: t.id, status: 'completed' }) }) })}>Complete</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'safety' && (
        <div className="space-y-4">
          <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-3" onSubmit={(e) => {
            e.preventDefault()
            run('Flag added', async () => {
              await safecaseFetch('/api/admin/safecase/safety', { method: 'POST', body: JSON.stringify({ client_id: id, flag_type: flagType, description_text: flagDesc, severity: flagSeverity }) })
              setFlagDesc('')
            })
          }}>
            <Field label="Flag type">
              <select className={inputClass} value={flagType} onChange={(e) => setFlagType(e.target.value)}>
                {FLAG_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Severity">
              <select className={inputClass} value={flagSeverity} onChange={(e) => setFlagSeverity(e.target.value as RiskLevel)}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </Field>
            <textarea className={inputClass} rows={3} placeholder="Safety description" value={flagDesc} onChange={(e) => setFlagDesc(e.target.value)} required />
            <Button type="submit">Add safety flag</Button>
          </form>
          {flags.length === 0 ? <EmptyState title="No safety flags" body="Record risk, location, or contact restrictions here." /> : flags.map((f) => (
            <div key={f.id} className={`bg-[#151B22] border rounded-2xl p-4 ${riskClass(f.severity)}`}>
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#F6FAFC]">{f.flag_type}</p>
                  <p className="text-sm text-[#A9B8C6] mt-1">{f.description_text}</p>
                </div>
                {f.is_active ? (
                  <Button variant="secondary" onClick={() => run('Resolved', async () => { await safecaseFetch('/api/admin/safecase/safety', { method: 'PATCH', body: JSON.stringify({ id: f.id, is_active: false }) }) })}>Resolve</Button>
                ) : (
                  <Button variant="secondary" onClick={() => run('Reopened', async () => { await safecaseFetch('/api/admin/safecase/safety', { method: 'PATCH', body: JSON.stringify({ id: f.id, is_active: true }) }) })}>Reopen</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'programs' && (
        <div className="space-y-4">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); enroll() }}>
            <select className={`${inputClass} max-w-xs`} value={programId} onChange={(e) => setProgramId(e.target.value)} required>
              <option value="">Enroll in program</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.current_enrollment}/{p.capacity}</option>)}
            </select>
            <Button type="submit">Enroll</Button>
            <Button type="button" variant="secondary" onClick={() => enroll(true)} disabled={!programId}>Waitlist</Button>
          </form>
          {enrollments.length === 0 ? <EmptyState title="No enrollments" body="Attach this client to an active program." /> : enrollments.map((e) => (
            <div key={e.id} className="bg-[#151B22] border border-[#27313B] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-[#F6FAFC]">{e.program?.name || 'Program'}</p>
                  <p className="text-xs text-[#A9B8C6]">{e.program?.program_type} · enrolled {formatWhen(e.enrolled_at)}</p>
                </div>
                <StatusPill tone={e.status === 'active' ? 'ok' : e.status === 'waitlist' ? 'warn' : 'neutral'}>{e.status}</StatusPill>
                {e.status === 'active' && (
                  <>
                    <Button variant="secondary" onClick={() => run('Completed', async () => { await safecaseFetch('/api/admin/safecase/enrollments', { method: 'PATCH', body: JSON.stringify({ id: e.id, status: 'completed' }) }) })}>Complete</Button>
                    <Button variant="secondary" onClick={() => run('Withdrawn', async () => { await safecaseFetch('/api/admin/safecase/enrollments', { method: 'PATCH', body: JSON.stringify({ id: e.id, status: 'withdrawn' }) }) })}>Withdraw</Button>
                  </>
                )}
                {e.status === 'waitlist' && (
                  <Button variant="secondary" onClick={() => run('Enrolled', async () => { await safecaseFetch('/api/admin/safecase/enrollments', { method: 'PATCH', body: JSON.stringify({ id: e.id, status: 'active' }) }) })}>Enroll now</Button>
                )}
              </div>
              <div className="border-t border-[#27313B] pt-2">
                <p className="text-[11px] uppercase tracking-widest text-[#A9B8C6] mb-1">Outcomes</p>
                {outcomes.filter((o) => o.enrollment_id === e.id).map((o) => (
                  <p key={o.id} className="text-xs text-[#F6FAFC] mb-1">
                    {o.achieved ? '✓' : '○'} {o.outcome_type}{o.outcome_value ? `: ${o.outcome_value}` : ''}
                  </p>
                ))}
              </div>
            </div>
          ))}
          <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 grid md:grid-cols-3 gap-3" onSubmit={(e) => {
            e.preventDefault()
            run('Outcome recorded', async () => {
              await safecaseFetch('/api/admin/safecase/outcomes', {
                method: 'POST',
                body: JSON.stringify({
                  enrollment_id: outcomeEnrollment,
                  outcome_type: outcomeType,
                  outcome_value: outcomeValue,
                  achieved: true,
                }),
              })
              setOutcomeValue('')
            })
          }}>
            <Field label="Enrollment">
              <select className={inputClass} value={outcomeEnrollment} onChange={(e) => setOutcomeEnrollment(e.target.value)} required>
                <option value="">Select enrollment</option>
                {enrollments.map((e) => (
                  <option key={e.id} value={e.id}>{e.program?.name || 'Program'} · {e.status}</option>
                ))}
              </select>
            </Field>
            <Field label="Outcome type">
              <select className={inputClass} value={outcomeType} onChange={(e) => setOutcomeType(e.target.value)}>
                {OUTCOME_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
            <Field label="Value / notes">
              <input className={inputClass} value={outcomeValue} onChange={(e) => setOutcomeValue(e.target.value)} />
            </Field>
            <div className="md:col-span-3"><Button type="submit">Record outcome</Button></div>
          </form>
        </div>
      )}

      {tab === 'housing' && (
        <div className="space-y-4">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => {
            e.preventDefault()
            run('Placed', async () => {
              await safecaseFetch('/api/admin/safecase/placements', { method: 'POST', body: JSON.stringify({ client_id: id, house_id: houseId }) })
              setHouseId('')
            })
          }}>
            <select className={`${inputClass} max-w-xs`} value={houseId} onChange={(e) => setHouseId(e.target.value)} required>
              <option value="">Place in house</option>
              {houses.map((h) => <option key={h.id} value={h.id}>{h.code_name || h.name} · {h.current_occupancy}/{h.capacity} · {h.status}</option>)}
            </select>
            <Button type="submit">Move in</Button>
          </form>
          {placements.length === 0 ? <EmptyState title="No housing placement" body="Move this client into a safe house from the list." /> : placements.map((p) => (
            <div key={p.id} className="flex items-center gap-3 bg-[#151B22] border border-[#27313B] rounded-xl p-4">
              <div className="flex-1">
                <p className="font-semibold text-[#F6FAFC]">{p.house?.name || 'House'}</p>
                <p className="text-xs text-[#A9B8C6]">In {formatWhen(p.moved_in_at)}{p.moved_out_at ? ` · out ${formatWhen(p.moved_out_at)}` : ''}</p>
              </div>
              <StatusPill tone={p.status === 'active' ? 'ok' : 'neutral'}>{p.status}</StatusPill>
              {p.status === 'active' && (
                <Button variant="secondary" onClick={() => run('Moved out', async () => { await safecaseFetch('/api/admin/safecase/placements', { method: 'PATCH', body: JSON.stringify({ id: p.id, status: 'exited' }) }) })}>Move out</Button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'referrals' && (
        <div className="space-y-4">
          <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 grid md:grid-cols-2 gap-3" onSubmit={(e) => {
            e.preventDefault()
            run('Referral added', async () => {
              await safecaseFetch('/api/admin/safecase/referrals', { method: 'POST', body: JSON.stringify({ client_id: id, partner_name: partner, service_type: service }) })
              setPartner('')
            })
          }}>
            <Field label="Partner"><input className={inputClass} value={partner} onChange={(e) => setPartner(e.target.value)} required /></Field>
            <Field label="Service">
              <select className={inputClass} value={service} onChange={(e) => setService(e.target.value)}>
                {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <div className="md:col-span-2"><Button type="submit">Add referral</Button></div>
          </form>
          {referrals.length === 0 ? <EmptyState title="No referrals" body="Track partner warm-handoffs on this file." /> : referrals.map((r) => (
            <div key={r.id} className="flex justify-between gap-3 bg-[#151B22] border border-[#27313B] rounded-xl p-4">
              <div>
                <p className="font-semibold text-[#F6FAFC]">{r.partner_name}</p>
                <p className="text-xs text-[#A9B8C6]">{r.service_type}</p>
              </div>
              <StatusPill>{r.status}</StatusPill>
            </div>
          ))}
        </div>
      )}

      {tab === 'files' && (
        <div className="space-y-4">
          <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4" onSubmit={(e) => {
            e.preventDefault()
            const input = (e.currentTarget.elements.namedItem('file') as HTMLInputElement)
            const file = input.files?.[0]
            if (!file) return
            run('Uploaded', async () => {
              const form = new FormData()
              form.set('client_id', String(id))
              form.set('file', file)
              await safecaseFetch('/api/admin/safecase/documents', { method: 'POST', body: form })
              input.value = ''
            })
          }}>
            <Field label="Upload document"><input name="file" type="file" className="text-sm text-[#A9B8C6]" required /></Field>
            <p className="text-xs text-[#A9B8C6] my-2">Treat uploads as confidential staff records.</p>
            <Button type="submit">Upload</Button>
          </form>
          {docs.length === 0 ? <EmptyState title="No documents" body="Upload intake packets, releases, or staff files." /> : docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 bg-[#151B22] border border-[#27313B] rounded-xl p-4">
              <div>
                <a href={d.url} target="_blank" rel="noreferrer" className="text-sm text-[#8DEBFF]">{d.filename}</a>
                <p className="text-xs text-[#A9B8C6]">{formatWhen(d.created_at)} · {d.created_by}</p>
              </div>
              <Button variant="secondary" onClick={() => run('Removed', async () => { await safecaseFetch(`/api/admin/safecase/documents?id=${d.id}`, { method: 'DELETE' }) })}>Remove</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
