'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { inputClass } from '@/components/safecase/ui'
import { clientFullName } from '@/lib/safecase/types'

type SearchHit = {
  clients: Array<{ id: string; first_name: string; last_name: string; preferred_name?: string | null; case_number?: string | null; status: string }>
  tasks: Array<{ id: string; task_name: string; status: string; client_id: string | null }>
  flags: Array<{ id: string; flag_type: string; severity: string; client_id: string; is_active: boolean }>
  notes: Array<{ id: string; narrative: string; client_id: string }>
}

export function SafeCaseSearch() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return }
    const t = setTimeout(() => {
      fetch(`/api/admin/safecase/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d) => setHits(d))
        .catch(() => setHits(null))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 flex-1 min-w-[240px]">
      <input className={inputClass} placeholder="Search case files, notes, tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits && (
        <div className="mt-3 space-y-3 text-sm">
          {hits.clients.map((c) => (
            <Link key={c.id} href={`/admin/safecase/clients/${c.id}`} className="block text-[#F6FAFC] hover:text-[#8DEBFF]">
              {clientFullName(c)} {c.case_number ? `· ${c.case_number}` : ''} · {c.status}
            </Link>
          ))}
          {hits.tasks.map((t) => (
            <p key={t.id} className="text-[#A9B8C6]">Task · {t.task_name} · {t.status}</p>
          ))}
          {hits.flags.map((f) => (
            <Link key={f.id} href={`/admin/safecase/clients/${f.client_id}`} className="block text-[#F6C98A]">
              Safety · {f.flag_type}
            </Link>
          ))}
          {hits.notes.map((n) => (
            <Link key={n.id} href={`/admin/safecase/clients/${n.client_id}`} className="block text-[#A9B8C6] line-clamp-2">
              Note · {n.narrative}
            </Link>
          ))}
          {hits.clients.length + hits.tasks.length + hits.flags.length + hits.notes.length === 0 && (
            <p className="text-[#A9B8C6]">No matches.</p>
          )}
        </div>
      )}
    </div>
  )
}
