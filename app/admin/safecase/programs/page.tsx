'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Banner, EmptyState, Field, PageHeader, StatusPill, downloadCsv, inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'
import { safecaseFetch } from '@/lib/safecase/client'
import { PROGRAM_TYPES } from '@/lib/safecase/constants'
import { clientFullName, type SafeCaseEnrollment, type SafeCaseProgram } from '@/lib/safecase/types'

export default function SafeCaseProgramsPage() {
  const [rows, setRows] = useState<SafeCaseProgram[]>([])
  const [roster, setRoster] = useState<Record<string, SafeCaseEnrollment[]>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState('support')
  const [capacity, setCapacity] = useState('20')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  function load() {
    fetch('/api/admin/safecase/programs').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setRows(d) })
  }
  useEffect(() => { load() }, [])

  async function openRoster(id: string) {
    setOpenId(openId === id ? null : id)
    if (openId === id) return
    const data = await fetch(`/api/admin/safecase/enrollments?program_id=${id}`).then((r) => r.json())
    if (Array.isArray(data)) setRoster((prev) => ({ ...prev, [id]: data }))
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Programs" sub={`${rows.filter((r) => r.status === 'active').length} active`}>
        <Button variant="secondary" onClick={() => downloadCsv('enrollments')}>Export enrollments</Button>
      </PageHeader>
      <Banner error={error} />
      <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 grid md:grid-cols-2 gap-3" onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await safecaseFetch('/api/admin/safecase/programs', {
            method: 'POST',
            body: JSON.stringify({ name, program_type: type, capacity: Number(capacity), description }),
          })
          setName(''); setDescription(''); load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not add program')
        }
      }}>
        <Field label="Name"><input className={inputClass} placeholder="Program name" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Type">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            {PROGRAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Capacity"><input className={inputClass} type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        <Field label="Description"><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="md:col-span-2"><Button type="submit">Add program</Button></div>
      </form>
      {rows.length === 0 ? <EmptyState title="No programs" body="Create housing, counseling, or support groups." /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {rows.map((p) => (
            <div key={p.id} className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4">
              <div className="flex justify-between gap-2">
                <p className="font-semibold text-[#F6FAFC]">{p.name}</p>
                <StatusPill tone={p.status === 'active' ? 'ok' : 'neutral'}>{p.status}</StatusPill>
              </div>
              <p className="text-xs text-[#A9B8C6] mt-1">{p.program_type} · {p.current_enrollment}/{p.capacity} enrolled</p>
              {p.description && <p className="text-sm text-[#A9B8C6] mt-2">{p.description}</p>}
              <div className="h-2 rounded-full bg-[#0B1014] mt-3 overflow-hidden">
                <div className="h-full bg-[#53D6FF]" style={{ width: `${Math.min(100, (p.current_enrollment / Math.max(p.capacity, 1)) * 100)}%` }} />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button variant="secondary" onClick={() => openRoster(p.id)}>{openId === p.id ? 'Hide roster' : 'Roster'}</Button>
                {p.status === 'active' ? (
                  <Button variant="secondary" onClick={async () => {
                    await safecaseFetch('/api/admin/safecase/programs', { method: 'PATCH', body: JSON.stringify({ id: p.id, status: 'paused' }) })
                    load()
                  }}>Pause</Button>
                ) : (
                  <Button variant="secondary" onClick={async () => {
                    await safecaseFetch('/api/admin/safecase/programs', { method: 'PATCH', body: JSON.stringify({ id: p.id, status: 'active' }) })
                    load()
                  }}>Activate</Button>
                )}
              </div>
              {openId === p.id && (
                <div className="mt-3 border-t border-[#27313B] pt-3 space-y-1">
                  {(roster[p.id] || []).filter((e) => e.status === 'active').length === 0 && <p className="text-xs text-[#A9B8C6]">No active enrollments.</p>}
                  {(roster[p.id] || []).filter((e) => e.status === 'active').map((e) => (
                    <div key={e.id} className="flex justify-between text-sm">
                      {e.client ? (
                        <Link className="text-[#8DEBFF]" href={`/admin/safecase/clients/${e.client_id}`}>{clientFullName(e.client)}</Link>
                      ) : <span className="text-[#A9B8C6]">Unknown client</span>}
                      <span className="text-[#A9B8C6]">{e.status}</span>
                    </div>
                  ))}
                  {(roster[p.id] || []).some((e) => e.status === 'waitlist') && (
                    <div className="pt-2 mt-2 border-t border-[#27313B]">
                      <p className="text-[11px] uppercase tracking-widest text-[#F6C98A] mb-1">Waitlist</p>
                      {(roster[p.id] || []).filter((e) => e.status === 'waitlist').map((e) => (
                        <div key={e.id} className="flex justify-between text-sm">
                          {e.client ? (
                            <Link className="text-[#8DEBFF]" href={`/admin/safecase/clients/${e.client_id}`}>{clientFullName(e.client)}</Link>
                          ) : <span className="text-[#A9B8C6]">Unknown client</span>}
                          <Button variant="secondary" onClick={async () => {
                            await safecaseFetch('/api/admin/safecase/enrollments', { method: 'PATCH', body: JSON.stringify({ id: e.id, status: 'active' }) })
                            const data = await fetch(`/api/admin/safecase/enrollments?program_id=${p.id}`).then((r) => r.json())
                            if (Array.isArray(data)) setRoster((prev) => ({ ...prev, [p.id]: data }))
                            load()
                          }}>Enroll</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
