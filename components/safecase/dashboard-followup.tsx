'use client'

import { useState } from 'react'
import Link from 'next/link'
import { clientFullName, formatWhen, type SafeCaseClient } from '@/lib/safecase/types'
import { safecaseFetch } from '@/lib/safecase/client'
import { inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'

export function DashboardFollowup({
  stale,
}: {
  stale: Array<Pick<SafeCaseClient, 'id' | 'first_name' | 'last_name' | 'preferred_name' | 'last_contact_at' | 'assigned_to'>>
}) {
  const [clientId, setClientId] = useState(stale[0]?.id || '')
  const [text, setText] = useState('')
  const [ok, setOk] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (stale.length === 0) return null

  return (
    <section className="rounded-2xl border border-[#F6C98A]/30 bg-[#F6C98A]/5 p-5 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#F6FAFC]">No contact in 14 days</h2>
          <p className="text-xs text-[#A9B8C6]">Log a check-in without opening the full file.</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1">
          {stale.map((c) => (
            <Link key={c.id} href={`/admin/safecase/clients/${c.id}`} className="flex justify-between gap-3 text-sm py-1.5 border-b border-[#27313B]/60 last:border-0">
              <span className="text-[#F6FAFC]">{clientFullName(c)}</span>
              <span className="text-[#A9B8C6]">{formatWhen(c.last_contact_at)}</span>
            </Link>
          ))}
        </div>
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            setOk(null)
            try {
              await safecaseFetch('/api/admin/safecase/notes', {
                method: 'POST',
                body: JSON.stringify({ client_id: clientId, note_type: 'contact', narrative: text }),
              })
              setText('')
              setOk('Contact logged')
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not log contact')
            }
          }}
        >
          <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            {stale.map((c) => (
              <option key={c.id} value={c.id}>{clientFullName(c)}</option>
            ))}
          </select>
          <textarea className={inputClass} rows={3} placeholder="Check-in note" value={text} onChange={(e) => setText(e.target.value)} required />
          <Button type="submit">Log contact</Button>
          {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}
          {error && <p className="text-sm text-[#F6A5A5]">{error}</p>}
        </form>
      </div>
    </section>
  )
}
