'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SocialAccount } from '@/src/features/social/types'
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/src/features/social/types'

export default function SocialAccountsPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([])

  useEffect(() => {
    fetch('/api/admin/social/accounts').then((r) => r.json()).then((d) => setAccounts(Array.isArray(d) ? d : []))
  }, [])

  async function mockConnect(id: string) {
    const res = await fetch('/api/admin/social/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, connection_status: 'connected', enabled: true }),
    })
    if (res.ok) {
      const updated = await res.json()
      setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)))
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/admin/social" className="text-sm text-[#A9B8C6] hover:text-[#53D6FF]">← Back to Social</Link>
      <h1 className="text-2xl font-bold">Social Accounts</h1>
      <p className="text-sm text-[#A9B8C6]">Connect accounts for publishing. Use Mock account for local testing until OAuth apps are approved.</p>
      <div className="space-y-3">
        {accounts.map((a) => (
          <div key={a.id} className="bg-[#151B22] rounded-xl border p-4 flex items-center gap-4">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[a.platform] }} />
            <div className="flex-1">
              <p className="font-semibold">{PLATFORM_LABELS[a.platform]}</p>
              <p className="text-xs text-[#A9B8C6]">{a.connection_status}</p>
            </div>
            {a.connection_status !== 'connected' && (
              <button type="button" onClick={() => mockConnect(a.id)} className="text-sm px-3 py-1.5 border rounded-lg hover:bg-[#53D6FF]/10">
                {a.platform === 'mock' ? 'Connect (Mock)' : 'Connect (Dev)'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
