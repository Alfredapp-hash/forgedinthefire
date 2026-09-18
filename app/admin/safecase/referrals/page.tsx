'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Banner, EmptyState, Field, PageHeader, StatusPill, downloadCsv, inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'
import { safecaseFetch } from '@/lib/safecase/client'
import { SERVICE_TYPES } from '@/lib/safecase/constants'
import { clientFullName, type ReferralStatus, type SafeCaseClient, type SafeCaseReferral } from '@/lib/safecase/types'

const STATUSES: ReferralStatus[] = ['open', 'accepted', 'declined', 'closed']

export default function SafeCaseReferralsPage() {
  const [rows, setRows] = useState<SafeCaseReferral[]>([])
  const [clients, setClients] = useState<SafeCaseClient[]>([])
  const [partner, setPartner] = useState('')
  const [service, setService] = useState('Housing')
  const [clientId, setClientId] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [notes, setNotes] = useState('')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)

  function load() {
    fetch('/api/admin/safecase/referrals').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setRows(d) })
    fetch('/api/admin/safecase/clients').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setClients(d) })
  }
  useEffect(() => { load() }, [])

  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter)

  return (
    <div className="space-y-5">
      <PageHeader title="Referrals" sub={`${rows.filter((r) => r.status === 'open').length} open`}>
        <Button variant="secondary" onClick={() => downloadCsv('referrals')}>Export CSV</Button>
      </PageHeader>
      <Banner error={error} />
      <form className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 grid md:grid-cols-2 gap-3" onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await safecaseFetch('/api/admin/safecase/referrals', {
            method: 'POST',
            body: JSON.stringify({
              partner_name: partner, service_type: service, client_id: clientId || null,
              contact_name: contact, contact_phone: phone, follow_up_date: followUp || null, notes,
            }),
          })
          setPartner(''); setContact(''); setPhone(''); setNotes(''); setFollowUp(''); load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not add referral')
        }
      }}>
        <Field label="Partner"><input className={inputClass} value={partner} onChange={(e) => setPartner(e.target.value)} required /></Field>
        <Field label="Service">
          <select className={inputClass} value={service} onChange={(e) => setService(e.target.value)}>
            {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Client">
          <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Unassigned</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{clientFullName(c)}</option>)}
          </select>
        </Field>
        <Field label="Follow-up date"><input type="date" className={inputClass} value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></Field>
        <Field label="Contact"><input className={inputClass} value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
        <Field label="Phone"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="Notes"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
        <div className="md:col-span-2"><Button type="submit">Add referral</Button></div>
      </form>
      <select className={`${inputClass} max-w-[160px]`} value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="all">All statuses</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {shown.length === 0 ? <EmptyState title="No referrals" body="Track partner warm-handoffs from here." /> : shown.map((r) => (
        <div key={r.id} className="bg-[#151B22] border border-[#27313B] rounded-xl p-4 flex flex-wrap justify-between gap-3">
          <div>
            <p className="font-semibold text-[#F6FAFC]">{r.partner_name}</p>
            <p className="text-xs text-[#A9B8C6]">
              {r.service_type || 'General'}
              {r.client ? <> · <Link className="text-[#8DEBFF]" href={`/admin/safecase/clients/${r.client_id}`}>{r.client.first_name} {r.client.last_name}</Link></> : ''}
              {r.follow_up_date ? ` · follow up ${r.follow_up_date}` : ''}
            </p>
            {(r.contact_name || r.contact_phone) && <p className="text-xs text-[#A9B8C6] mt-1">{[r.contact_name, r.contact_phone].filter(Boolean).join(' · ')}</p>}
            {r.notes && <p className="text-sm text-[#A9B8C6] mt-1">{r.notes}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={r.status === 'accepted' ? 'ok' : r.status === 'open' ? 'warn' : 'neutral'}>{r.status}</StatusPill>
            {STATUSES.filter((s) => s !== r.status).map((s) => (
              <Button key={s} variant="secondary" onClick={async () => {
                await safecaseFetch('/api/admin/safecase/referrals', { method: 'PATCH', body: JSON.stringify({ id: r.id, status: s }) })
                load()
              }}>{s}</Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
