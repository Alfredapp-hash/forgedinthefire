'use client'

import { useEffect, useState } from 'react'
import { Banner, EmptyState, Field, PageHeader, StatusPill, inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'
import { safecaseFetch } from '@/lib/safecase/client'
import { VOLUNTEER_ROLES } from '@/lib/safecase/constants'
import type { SafeCaseVolunteer } from '@/lib/safecase/types'

export default function SafeCaseVolunteersPage() {
  const [rows, setRows] = useState<SafeCaseVolunteer[]>([])
  const [q, setQ] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('Case support')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function load() {
    fetch('/api/admin/safecase/volunteers').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setRows(d) })
  }
  useEffect(() => { load() }, [])

  const shown = rows.filter((v) => {
    const blob = `${v.first_name} ${v.last_name} ${v.email ?? ''} ${v.role ?? ''}`.toLowerCase()
    return blob.includes(q.toLowerCase())
  })

  return (
    <div className="space-y-5">
      <PageHeader title="Volunteers" sub={`${rows.filter((v) => v.status === 'active').length} active`} />
      <Banner error={error} />
      <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 grid md:grid-cols-2 gap-3" onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await safecaseFetch('/api/admin/safecase/volunteers', {
            method: 'POST',
            body: JSON.stringify({ first_name: first, last_name: last, email, phone, role, notes }),
          })
          setFirst(''); setLast(''); setEmail(''); setPhone(''); setNotes(''); load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not add volunteer')
        }
      }}>
        <Field label="First"><input className={inputClass} value={first} onChange={(e) => setFirst(e.target.value)} required /></Field>
        <Field label="Last"><input className={inputClass} value={last} onChange={(e) => setLast(e.target.value)} required /></Field>
        <Field label="Email"><input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Phone"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Role">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
            {VOLUNTEER_ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Notes"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="md:col-span-2"><Button type="submit">Add volunteer</Button></div>
      </form>
      <input className={`${inputClass} max-w-xs`} placeholder="Search roster" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? <EmptyState title="No volunteers" body="Keep a staff-side roster for SafeCase assignments." /> : shown.map((v) => (
        <div key={v.id} className="bg-[#151B22] border border-[#27313B] rounded-xl p-4 flex justify-between gap-3">
          <div>
            <p className="font-semibold text-[#F6FAFC]">{v.first_name} {v.last_name}</p>
            <p className="text-xs text-[#A9B8C6]">{[v.email, v.phone, v.role].filter(Boolean).join(' · ')}</p>
            {v.notes && <p className="text-sm text-[#A9B8C6] mt-1">{v.notes}</p>}
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={v.status === 'active' ? 'ok' : 'neutral'}>{v.status}</StatusPill>
            <Button variant="secondary" onClick={async () => {
              await safecaseFetch('/api/admin/safecase/volunteers', {
                method: 'PATCH',
                body: JSON.stringify({ id: v.id, status: v.status === 'active' ? 'inactive' : 'active' }),
              })
              load()
            }}>{v.status === 'active' ? 'Deactivate' : 'Activate'}</Button>
          </div>
        </div>
      ))}
    </div>
  )
}
