'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Banner, EmptyState, Field, PageHeader, StatusPill, downloadCsv, inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'
import { safecaseFetch } from '@/lib/safecase/client'
import { clientFullName, type SafeCaseClient, type SafeCaseTask } from '@/lib/safecase/types'

export default function SafeCaseTasksPage() {
  const [tasks, setTasks] = useState<SafeCaseTask[]>([])
  const [clients, setClients] = useState<SafeCaseClient[]>([])
  const [taskName, setTaskName] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState('medium')
  const [clientId, setClientId] = useState('')
  const [details, setDetails] = useState('')
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [error, setError] = useState<string | null>(null)

  function load() {
    fetch(`/api/admin/safecase/tasks${filter === 'open' ? '?open=1' : ''}`).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setTasks(d) })
    fetch('/api/admin/safecase/clients').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setClients(d) })
  }
  useEffect(() => { load() }, [filter])

  const overdue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return tasks.filter((t) => t.due_date && t.due_date < today && t.status !== 'completed' && t.status !== 'cancelled')
  }, [tasks])

  return (
    <div className="space-y-5">
      <PageHeader title="Task queue" sub={`${overdue.length} overdue · ${tasks.length} shown`}>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => downloadCsv('tasks')}>Export CSV</Button>
          <Button variant="secondary" onClick={() => setFilter((v) => v === 'open' ? 'all' : 'open')}>
            {filter === 'open' ? 'Show all' : 'Show open'}
          </Button>
        </div>
      </PageHeader>
      <Banner error={error} />
      <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 grid md:grid-cols-2 gap-3" onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await safecaseFetch('/api/admin/safecase/tasks', {
            method: 'POST',
            body: JSON.stringify({ task_name: taskName, due_date: due || null, priority, client_id: clientId || null, details }),
          })
          setTaskName(''); setDue(''); setDetails(''); load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not add task')
        }
      }}>
        <Field label="Task"><input className={inputClass} placeholder="Task name" value={taskName} onChange={(e) => setTaskName(e.target.value)} required /></Field>
        <Field label="Client">
          <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Unassigned</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{clientFullName(c)}</option>)}
          </select>
        </Field>
        <Field label="Due"><input type="date" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Priority">
          <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </Field>
        <div className="md:col-span-2"><Field label="Details"><input className={inputClass} value={details} onChange={(e) => setDetails(e.target.value)} /></Field></div>
        <div className="md:col-span-2"><Button type="submit">Add task</Button></div>
      </form>
      {tasks.length === 0 ? <EmptyState title="No tasks" body="Staff follow-ups and court dates land here." /> : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 bg-[#151B22] border border-[#27313B] rounded-xl p-3">
              <div className="flex-1">
                <p className="text-sm text-[#F6FAFC]">{t.task_name}</p>
                <p className="text-xs text-[#A9B8C6]">
                  {t.client ? <Link className="text-[#8DEBFF]" href={`/admin/safecase/clients/${t.client_id}`}>{t.client.first_name} {t.client.last_name}</Link> : 'Unassigned'}
                  {t.due_date ? ` · due ${t.due_date}` : ''} · {t.priority}{t.assigned_to ? ` · ${t.assigned_to}` : ''}
                </p>
              </div>
              <StatusPill tone={t.status === 'completed' ? 'ok' : overdue.some((o) => o.id === t.id) ? 'danger' : 'neutral'}>{t.status}</StatusPill>
              {t.status !== 'completed' && t.status !== 'cancelled' && (
                <>
                  {t.status !== 'in_progress' && (
                    <Button variant="secondary" onClick={async () => {
                      await safecaseFetch('/api/admin/safecase/tasks', { method: 'PATCH', body: JSON.stringify({ id: t.id, status: 'in_progress' }) })
                      load()
                    }}>Start</Button>
                  )}
                  <Button variant="secondary" onClick={async () => {
                    await safecaseFetch('/api/admin/safecase/tasks', { method: 'PATCH', body: JSON.stringify({ id: t.id, status: 'completed' }) })
                    load()
                  }}>Complete</Button>
                  <Button variant="secondary" onClick={async () => {
                    await safecaseFetch('/api/admin/safecase/tasks', { method: 'PATCH', body: JSON.stringify({ id: t.id, status: 'cancelled' }) })
                    load()
                  }}>Cancel</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
