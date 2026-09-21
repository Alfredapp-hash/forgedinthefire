'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Banner, EmptyState, Field, PageHeader, StatusPill, inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'
import { safecaseFetch } from '@/lib/safecase/client'
import { clientFullName, type SafeCaseClient, type SafeCaseHouse, type SafeCasePlacement } from '@/lib/safecase/types'

export default function SafeCaseHousesPage() {
  const [rows, setRows] = useState<SafeCaseHouse[]>([])
  const [clients, setClients] = useState<SafeCaseClient[]>([])
  const [residents, setResidents] = useState<Record<string, SafeCasePlacement[]>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [codeName, setCodeName] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [notes, setNotes] = useState('')
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState<string | null>(null)

  function load() {
    fetch('/api/admin/safecase/houses').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setRows(d) })
    fetch('/api/admin/safecase/clients').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setClients(d) })
  }
  useEffect(() => { load() }, [])

  async function openHouse(id: string) {
    const next = openId === id ? null : id
    setOpenId(next)
    if (!next) return
    const data = await fetch(`/api/admin/safecase/placements?house_id=${id}&active=1`).then((r) => r.json())
    if (Array.isArray(data)) setResidents((prev) => ({ ...prev, [id]: data }))
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Safe houses" sub={`${rows.filter((h) => h.status === 'open').length} open · code names only`} />
      <Banner error={error} />
      <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 grid md:grid-cols-3 gap-3" onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await safecaseFetch('/api/admin/safecase/houses', {
            method: 'POST',
            body: JSON.stringify({ name: name || codeName, code_name: codeName || name, capacity: Number(capacity), notes }),
          })
          setName(''); setCodeName(''); setNotes(''); load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not add house')
        }
      }}>
        <Field label="Code name">
          <input className={inputClass} placeholder="House Alpha" value={codeName} onChange={(e) => setCodeName(e.target.value)} required />
        </Field>
        <Field label="Internal label (optional)">
          <input className={inputClass} placeholder="Same as code name if blank" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Capacity"><input type="number" className={inputClass} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        <Field label="Notes"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="md:col-span-3"><Button type="submit">Add safe house</Button></div>
      </form>
      {rows.length === 0 ? <EmptyState title="No houses" body="Track confidential housing inventory by code name — never publish street addresses." /> : rows.map((h) => (
        <div key={h.id} className="bg-[#151B22] border border-[#27313B] rounded-xl p-4">
          <div className="flex justify-between gap-3">
            <div>
              <p className="font-semibold text-[#F6FAFC]">{h.code_name || h.name}</p>
              {h.code_name && h.name && h.code_name !== h.name && (
                <p className="text-[11px] text-[#A9B8C6]">Label: {h.name}</p>
              )}
              <p className="text-xs text-[#A9B8C6]">{h.current_occupancy}/{h.capacity} occupancy</p>
              {h.notes && <p className="text-sm text-[#A9B8C6] mt-1">{h.notes}</p>}
            </div>
            <StatusPill tone={h.status === 'open' ? 'ok' : h.status === 'full' ? 'warn' : 'neutral'}>{h.status}</StatusPill>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="secondary" onClick={() => openHouse(h.id)}>{openId === h.id ? 'Hide residents' : 'Residents'}</Button>
            {(['open', 'full', 'offline'] as const).filter((s) => s !== h.status).map((s) => (
              <Button key={s} variant="secondary" onClick={async () => {
                await safecaseFetch('/api/admin/safecase/houses', { method: 'PATCH', body: JSON.stringify({ id: h.id, status: s }) })
                load()
              }}>{s}</Button>
            ))}
          </div>
          {openId === h.id && (
            <div className="mt-3 border-t border-[#27313B] pt-3 space-y-2">
              {(residents[h.id] || []).length === 0 && <p className="text-xs text-[#A9B8C6]">No current residents.</p>}
              {(residents[h.id] || []).map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  {p.client ? <Link className="text-[#8DEBFF]" href={`/admin/safecase/clients/${p.client_id}`}>{p.client.first_name} {p.client.last_name}</Link> : <span>Unknown</span>}
                  <Button variant="secondary" onClick={async () => {
                    await safecaseFetch('/api/admin/safecase/placements', { method: 'PATCH', body: JSON.stringify({ id: p.id, status: 'exited' }) })
                    const data = await fetch(`/api/admin/safecase/placements?house_id=${h.id}&active=1`).then((r) => r.json())
                    if (Array.isArray(data)) setResidents((prev) => ({ ...prev, [h.id]: data }))
                    load()
                  }}>Move out</Button>
                </div>
              ))}
              <form className="flex gap-2" onSubmit={async (e) => {
                e.preventDefault()
                await safecaseFetch('/api/admin/safecase/placements', { method: 'POST', body: JSON.stringify({ client_id: clientId, house_id: h.id }) })
                setClientId('')
                const data = await fetch(`/api/admin/safecase/placements?house_id=${h.id}&active=1`).then((r) => r.json())
                if (Array.isArray(data)) setResidents((prev) => ({ ...prev, [h.id]: data }))
                load()
              }}>
                <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                  <option value="">Move in client</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{clientFullName(c)}</option>)}
                </select>
                <Button type="submit">Place</Button>
              </form>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
