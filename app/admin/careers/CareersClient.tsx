'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, X, Check, GripVertical } from 'lucide-react'
import type { JobPosition } from '@/src/features/careers/types'

const TEAL = '#53D6FF'
const GOLD = '#8DEBFF'
const CHARCOAL = '#05070A'

function toSlug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

const EMPTY: Omit<JobPosition, 'id' | 'created_at' | 'updated_at'> = { 
  title: '', 
  slug: '', 
  type: 'Full-Time', 
  description: '', 
  duties: '', 
  requirements: '', 
  pay_range: '', 
  location: 'Lorain County, OH', 
  active: true, 
  sort_order: 0 
}

export default function CareersClient({ initialPositions }: { initialPositions: JobPosition[] }) {
  const router = useRouter()
  const [positions, setPositions] = useState<JobPosition[]>(initialPositions)
  const [editing, setEditing] = useState<Partial<JobPosition> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function openNew() {
    setEditing({ ...EMPTY })
    setIsNew(true)
    setError(null)
  }

  function openEdit(pos: JobPosition) {
    setEditing({ ...pos })
    setIsNew(false)
    setError(null)
  }

  function cancelEdit() {
    setEditing(null)
    setError(null)
  }

  async function save() {
    if (!editing?.title?.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/careers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Save failed.'); return }
      router.refresh()
      setEditing(null)
    } catch {
      setError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  async function deletePos(id: string) {
    if (!confirm('Delete this position?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/careers?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { alert('Delete failed.'); return }
      setPositions((prev) => prev.filter((p) => p.id !== id))
      router.refresh()
    } finally {
      setDeleting(null)
    }
  }

  async function toggleActive(pos: JobPosition) {
    const updated = { ...pos, active: !pos.active }
    await fetch('/api/admin/careers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    setPositions((prev) => prev.map((p) => p.id === pos.id ? updated : p))
    router.refresh()
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F6FAFC] mb-1">Open Positions</h1>
          <p className="text-sm text-[#A9B8C6]">{positions.length} position{positions.length === 1 ? '' : 's'} — shown on Join Our Team page</p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: TEAL }}
        >
          <Plus size={16} /> Add Position
        </button>
      </div>

      {/* Add / Edit form */}
      {editing && (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] shadow-forge-sm p-6">
          <h2 className="font-bold mb-4 text-sm uppercase tracking-wider" style={{ color: TEAL }}>
            {isNew ? 'New Position' : 'Edit Position'}
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-[#A9B8C6] mb-1">Job Title *</label>
              <input
                type="text"
                value={editing.title ?? ''}
                onChange={(e) => {
                  const title = e.target.value
                  setEditing((prev) => ({
                    ...prev,
                    title,
                    slug: isNew ? toSlug(title) : prev?.slug ?? toSlug(title),
                  }))
                }}
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30"
                placeholder="e.g., Victim Advocate"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#A9B8C6] mb-1">Employment Type</label>
              <select
                value={editing.type ?? 'Full-Time'}
                onChange={(e) => setEditing((prev) => ({ ...prev, type: e.target.value }))}
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30 bg-[#151B22]"
              >
                <option value="Full-Time">Full-Time</option>
                <option value="Part-Time">Part-Time</option>
                <option value="Contract">Contract</option>
                <option value="Volunteer">Volunteer</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#A9B8C6] mb-1">URL Slug</label>
            <div className="flex items-center border border-[#27313B] rounded-lg overflow-hidden">
              <span className="px-3 py-2 text-xs text-[#A9B8C6] bg-[#05070A] border-r border-[#27313B] shrink-0">/careers/</span>
              <input
                type="text"
                value={editing.slug ?? ''}
                onChange={(e) => setEditing((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                className="flex-1 px-3 py-2 text-sm focus:outline-none"
                placeholder="victim-advocate"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#A9B8C6] mb-1">Short Description</label>
            <textarea
              value={editing.description ?? ''}
              onChange={(e) => setEditing((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30 resize-none"
              placeholder="Brief summary shown on the listing card..."
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#A9B8C6] mb-1">Duties &amp; Responsibilities</label>
            <textarea
              value={editing.duties ?? ''}
              onChange={(e) => setEditing((prev) => ({ ...prev, duties: e.target.value }))}
              rows={5}
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30 resize-none"
              placeholder="Enter each duty on a new line..."
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#A9B8C6] mb-1">Requirements / Qualifications</label>
            <textarea
              value={editing.requirements ?? ''}
              onChange={(e) => setEditing((prev) => ({ ...prev, requirements: e.target.value }))}
              rows={4}
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30 resize-none"
              placeholder="Enter each requirement on a new line..."
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-[#A9B8C6] mb-1">Pay Range</label>
              <input
                type="text"
                value={editing.pay_range ?? ''}
                onChange={(e) => setEditing((prev) => ({ ...prev, pay_range: e.target.value }))}
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30"
                placeholder="e.g., $18–$24/hr or Competitive"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#A9B8C6] mb-1">Location</label>
              <input
                type="text"
                value={editing.location ?? 'Lorain County, OH'}
                onChange={(e) => setEditing((prev) => ({ ...prev, location: e.target.value }))}
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30"
                placeholder="e.g., Lorain County, OH"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <label className="flex items-center gap-2 text-sm text-[#F6FAFC] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={editing.active ?? true}
                onChange={(e) => setEditing((prev) => ({ ...prev, active: e.target.checked }))}
                className="w-4 h-4 rounded border-[#27313B] text-[#53D6FF] focus:ring-[#53D6FF]"
              />
              Visible on public site
            </label>
          </div>
          {error && <p className="text-[#8DEBFF] text-sm mb-3">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm text-white disabled:opacity-60 transition-opacity hover:opacity-85"
              style={{ backgroundColor: TEAL }}
            >
              <Check size={15} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={cancelEdit}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm text-[#A9B8C6] border border-[#27313B] hover:bg-[#1A232C]"
            >
              <X size={15} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Positions list */}
      {positions.length === 0 && !editing ? (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-16 text-center">
          <div className="w-16 h-16 rounded-full bg-[#1A232C]/10 flex items-center justify-center mx-auto mb-4">
            <GripVertical size={32} className="text-[#A9B8C6]" />
          </div>
          <p className="font-semibold text-[#F6FAFC] mb-1">No positions yet</p>
          <p className="text-sm text-[#A9B8C6] mb-6">Add your first open position to show on the careers page.</p>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: TEAL }}
          >
            <Plus size={16} /> Add Position
          </button>
        </div>
      ) : (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#05070A] text-xs uppercase tracking-wider text-[#A9B8C6]">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Title</th>
                <th className="text-left px-5 py-3 font-semibold">Type</th>
                <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Slug</th>
                <th className="text-left px-5 py-3 font-semibold">Visible</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.id} className="border-t border-[#27313B] hover:bg-[#1A232C]/50">
                  <td className="px-5 py-3 font-semibold" style={{ color: CHARCOAL }}>
                    {pos.title}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(83, 214, 255,0.12)', color: '#53D6FF' }}
                    >
                      {pos.type || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[#A9B8C6] text-xs hidden md:table-cell font-mono">
                    /careers/{pos.slug}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleActive(pos)}
                      className={`w-8 h-5 rounded-full transition-colors relative ${pos.active ? 'bg-[#8DEBFF]/15' : 'bg-gray-300'}`}
                      title={pos.active ? 'Visible — click to hide' : 'Hidden — click to show'}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-[#151B22] rounded-full shadow transition-transform ${pos.active ? 'translate-x-3' : 'translate-x-0.5'}`}
                      />
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(pos)}
                        className="p-1.5 rounded hover:bg-[#1A232C]/10 text-[#A9B8C6] hover:text-[#53D6FF] transition-colors"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => deletePos(pos.id)}
                        disabled={deleting === pos.id}
                        className="p-1.5 rounded hover:bg-[#8DEBFF]/15 text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
