'use client'

import { useEffect, useState } from 'react'
import { UserPlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type AdminUser = { id: string; email: string; role: string; created_at: string }

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'owner'>('admin')
  const [error, setError] = useState<string | null>(null)

  function load() {
    fetch('/api/admin/users').then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setUsers(d)
    })
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    setError(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }
    setEmail('')
    load()
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this admin user?')) return
    await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#F6FAFC]">Admin Users</h1>
        <p className="text-sm text-[#A9B8C6]">Manage who can access the admin portal (owner-only invites)</p>
      </div>

      <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><UserPlus className="w-5 h-5" /> Invite Admin</h2>
        {error && <p className="text-sm text-[#8DEBFF]">{error}</p>}
        <div className="flex gap-2">
          <input type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'owner')} className="border rounded-lg px-2 text-sm">
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <Button onClick={handleAdd} disabled={!email}>Add</Button>
        </div>
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="bg-[#151B22] rounded-xl border p-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="font-medium">{u.email}</p>
              <p className="text-xs text-[#A9B8C6]">{u.role}</p>
            </div>
            <button type="button" onClick={() => handleRemove(u.id)} className="text-[#8DEBFF] hover:text-[#8DEBFF] p-1"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
