'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Banner, EmptyState, Field, PageHeader, StatusPill, downloadCsv, inputClass, riskClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'
import { safecaseFetch } from '@/lib/safecase/client'
import { FLAG_TYPES } from '@/lib/safecase/constants'
import type { RiskLevel, SafeCaseClient, SafeCaseSafetyFlag } from '@/lib/safecase/types'
import { clientFullName } from '@/lib/safecase/types'

export default function SafeCaseSafetyPage() {
  const [flags, setFlags] = useState<SafeCaseSafetyFlag[]>([])
  const [clients, setClients] = useState<SafeCaseClient[]>([])
  const [clientId, setClientId] = useState('')
  const [flagType, setFlagType] = useState('Restraining order')
  const [desc, setDesc] = useState('')
  const [severity, setSeverity] = useState<RiskLevel>('high')
  const [activeOnly, setActiveOnly] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    fetch(`/api/admin/safecase/safety${activeOnly ? '?active=1' : ''}`).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setFlags(d) })
    fetch('/api/admin/safecase/clients').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setClients(d) })
  }
  useEffect(() => { load() }, [activeOnly])

  return (
    <div className="space-y-5">
      <PageHeader title="Safety flags" sub={`${flags.length} ${activeOnly ? 'open' : 'total'} flags`}>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => downloadCsv('safety')}>Export CSV</Button>
          <Button variant="secondary" onClick={() => setActiveOnly((v) => !v)}>{activeOnly ? 'Show resolved' : 'Show open only'}</Button>
        </div>
      </PageHeader>
      <Banner error={error} />
      <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await safecaseFetch('/api/admin/safecase/safety', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, flag_type: flagType, description_text: desc, severity }),
          })
          setDesc(''); load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not add flag')
        }
      }}>
        <Field label="Client">
          <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">Select client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{clientFullName(c)}</option>)}
          </select>
        </Field>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Flag type">
            <select className={inputClass} value={flagType} onChange={(e) => setFlagType(e.target.value)}>
              {FLAG_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Severity">
            <select className={inputClass} value={severity} onChange={(e) => setSeverity(e.target.value as RiskLevel)}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </select>
          </Field>
        </div>
        <textarea className={inputClass} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What staff need to know" required />
        <Button type="submit">Add flag</Button>
      </form>
      {flags.length === 0 ? <EmptyState title="No flags" body="Safety flags stay on the dashboard until they are resolved." /> : flags.map((f) => (
        <div key={f.id} className={`bg-[#151B22] border rounded-2xl p-4 flex justify-between gap-3 ${riskClass(f.severity)}`}>
          <div>
            <p className="font-semibold text-[#F6FAFC]">{f.flag_type}</p>
            <p className="text-sm text-[#A9B8C6]">{f.description_text}</p>
            {f.client && <Link href={`/admin/safecase/clients/${f.client_id}`} className="text-xs text-[#8DEBFF]">{f.client.first_name} {f.client.last_name}</Link>}
          </div>
          {f.is_active ? (
            <Button variant="secondary" onClick={async () => {
              await safecaseFetch('/api/admin/safecase/safety', { method: 'PATCH', body: JSON.stringify({ id: f.id, is_active: false }) })
              load()
            }}>Resolve</Button>
          ) : (
            <Button variant="secondary" onClick={async () => {
              await safecaseFetch('/api/admin/safecase/safety', { method: 'PATCH', body: JSON.stringify({ id: f.id, is_active: true }) })
              load()
            }}>Reopen</Button>
          )}
        </div>
      ))}
    </div>
  )
}
