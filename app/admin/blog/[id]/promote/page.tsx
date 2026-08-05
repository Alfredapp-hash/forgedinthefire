'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Megaphone, Loader2 } from 'lucide-react'
import { getContentItem } from '@/src/features/content/store'
import { generateCaption } from '@/src/features/social/captionGenerators'

export default function PromoteBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [postId, setPostId] = useState('')
  const router = useRouter()

  useEffect(() => {
    params.then(async ({ id }) => {
      setPostId(id)
      const post = await getContentItem(id)
      if (post) {
        setTitle(`Promote: ${post.title}`)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://forgedinthefireohio.org'
        setCaption(generateCaption(post.template, post.title, post.excerpt, `${siteUrl}/blog/${post.slug}`))
      }
      setLoading(false)
    })
  }, [params])

  async function createCampaign() {
    setCreating(true)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://forgedinthefireohio.org'
    const res = await fetch('/api/admin/social/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        source_type: 'blog_post',
        source_id: postId,
        posts: [
          { platform: 'mock', caption, link_url: `${siteUrl}/blog` },
          { platform: 'facebook', caption, link_url: `${siteUrl}/blog` },
          { platform: 'linkedin', caption, link_url: `${siteUrl}/blog` },
        ],
      }),
    })
    const data = await res.json()
    setCreating(false)
    if (res.ok) router.push(`/admin/social/campaigns/${data.id}`)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[#53D6FF]" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href={`/admin/blog/${postId}`} className="text-sm text-[#A9B8C6]">← Back to post</Link>
      <div className="flex items-center gap-3">
        <Megaphone className="w-8 h-8 text-[#53D6FF]" />
        <h1 className="text-2xl font-bold">Promote Blog Post</h1>
      </div>
      <div className="bg-[#151B22] rounded-xl border p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Campaign Title</label>
          <input className="w-full border rounded-lg px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Caption Preview</label>
          <textarea className="w-full border rounded-lg px-3 py-2 font-mono text-sm" rows={8} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={creating || !title}
          onClick={createCampaign}
          className="px-6 py-3 bg-[#53D6FF] text-[#061016] rounded-xl font-semibold disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Social Campaign'}
        </button>
      </div>
    </div>
  )
}
