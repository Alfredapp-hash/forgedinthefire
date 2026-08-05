'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewSocialCampaignPage() {
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function handleCreate() {
    setSaving(true)
    const res = await fetch('/api/admin/social/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        posts: [{ platform: 'mock', caption, link_url: 'https://forgedinthefireohio.org/blog' }],
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) router.push(`/admin/social/campaigns/${data.id}`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/admin/social/campaigns" className="text-sm text-[#A9B8C6]">← Back</Link>
      <h1 className="text-2xl font-bold">New Campaign</h1>
      <div className="bg-[#151B22] rounded-xl border p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Campaign Title</label>
          <input className="w-full border rounded-lg px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Caption</label>
          <textarea className="w-full border rounded-lg px-3 py-2" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <button type="button" disabled={saving || !title} onClick={handleCreate} className="px-4 py-2 bg-[#53D6FF] text-[#061016] rounded-lg disabled:opacity-50">
          {saving ? 'Creating...' : 'Create Campaign'}
        </button>
      </div>
    </div>
  )
}
