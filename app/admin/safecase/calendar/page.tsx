'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Banner, EmptyState, Field, PageHeader, inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'
import { safecaseFetch } from '@/lib/safecase/client'
import { clientFullName, type SafeCaseAppointment, type SafeCaseClient, type SafeCaseTask } from '@/lib/safecase/types'

function monthDays(year: number, month: number) {
  const first = new Date(year, month, 1)
  const start = first.getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ date: string | null; day: number | null }> = []
  for (let i = 0; i < start; i++) cells.push({ date: null, day: null })
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ date: iso, day: d })
  }
  return cells
}

export default function SafeCaseCalendarPage() {
  const now = new Date()
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [selected, setSelected] = useState(now.toISOString().slice(0, 10))
  const [tasks, setTasks] = useState<SafeCaseTask[]>([])
  const [appts, setAppts] = useState<SafeCaseAppointment[]>([])
  const [clients, setClients] = useState<SafeCaseClient[]>([])
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`

  function load() {
    fetch('/api/admin/safecase/tasks?open=1').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setTasks(d) })
    fetch(`/api/admin/safecase/appointments?from=${from}&to=${to}`).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setAppts(d) })
    fetch('/api/admin/safecase/clients').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setClients(d) })
  }
  useEffect(() => { load() }, [from, to])

  const cells = useMemo(() => monthDays(year, month), [year, month])
  const marks = useMemo(() => {
    const set = new Set<string>()
    for (const t of tasks) if (t.due_date) set.add(t.due_date)
    for (const a of appts) set.add(a.starts_on)
    return set
  }, [tasks, appts])
  const dayTasks = tasks.filter((t) => t.due_date === selected)
  const dayAppts = appts.filter((a) => a.starts_on === selected)

  return (
    <div className="space-y-5">
      <PageHeader title="Calendar" sub={`${cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}`}>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCursor(new Date(year, month - 1, 1))}>Prev</Button>
          <Button variant="secondary" onClick={() => setCursor(new Date(year, month + 1, 1))}>Next</Button>
        </div>
      </PageHeader>
      <Banner error={error} />
      <div className="grid grid-cols-7 gap-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <p key={d} className="text-[11px] uppercase tracking-widest text-[#A9B8C6] text-center py-1">{d}</p>
        ))}
        {cells.map((c, i) => (
          <button
            key={i}
            type="button"
            disabled={!c.date}
            onClick={() => c.date && setSelected(c.date)}
            className={`min-h-[52px] rounded-lg border text-sm ${
              !c.date ? 'border-transparent' : selected === c.date ? 'border-[#53D6FF] bg-[#53D6FF]/15 text-[#F6FAFC]' : 'border-[#27313B] text-[#F6FAFC]'
            }`}
          >
            {c.day}
            {c.date && marks.has(c.date) && <span className="block mx-auto mt-1 w-1.5 h-1.5 rounded-full bg-[#8DEBFF]" />}
          </button>
        ))}
      </div>

      <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[#F6FAFC]">{selected}</h3>
        {dayAppts.length === 0 && dayTasks.length === 0 ? <EmptyState title="Nothing on this day" body="Add an appointment below or a dated task." /> : (
          <ul className="space-y-1">
            {dayAppts.map((a) => (
              <li key={a.id} className="text-sm text-[#F6FAFC] flex justify-between gap-2">
                <span>{a.start_time ? `${a.start_time} · ` : ''}{a.title}{a.client ? ` · ${a.client.first_name} ${a.client.last_name}` : ''}</span>
                <Button variant="secondary" onClick={async () => {
                  await safecaseFetch(`/api/admin/safecase/appointments?id=${a.id}`, { method: 'DELETE' })
                  load()
                }}>Remove</Button>
              </li>
            ))}
            {dayTasks.map((t) => (
              <li key={t.id} className="text-sm text-[#A9B8C6]">
                Task · {t.task_name}
                {t.client ? <> · <Link className="text-[#8DEBFF]" href={`/admin/safecase/clients/${t.client_id}`}>{t.client.first_name} {t.client.last_name}</Link></> : ''}
              </li>
            ))}
          </ul>
        )}
        <form className="grid md:grid-cols-4 gap-2 items-end" onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          try {
            await safecaseFetch('/api/admin/safecase/appointments', {
              method: 'POST',
              body: JSON.stringify({ title, starts_on: selected, start_time: time || null, client_id: clientId || null }),
            })
            setTitle(''); setTime(''); load()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not add appointment')
          }
        }}>
          <Field label="Appointment"><input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
          <Field label="Time"><input className={inputClass} placeholder="10:00" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Client">
            <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Unassigned</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{clientFullName(c)}</option>)}
            </select>
          </Field>
          <Button type="submit">Add</Button>
        </form>
      </section>
    </div>
  )
}
