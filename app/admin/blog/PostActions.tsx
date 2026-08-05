'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, Copy, Trash2, Loader2 } from 'lucide-react'

interface PostActionsProps {
  postId: string
  slug: string
  status: string
}

export function PostActions({ postId, slug, status }: PostActionsProps) {
  const [duplicating, setDuplicating] = useState(false)

  const handleDuplicate = async () => {
    if (duplicating) return
    
    setDuplicating(true)
    try {
      const res = await fetch(`/api/admin/content/${postId}/duplicate`, { 
        method: 'POST' 
      })
      
      if (res.ok) {
        window.location.reload()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to duplicate post')
        setDuplicating(false)
      }
    } catch (err) {
      console.error('Duplicate error:', err)
      alert('Failed to duplicate post')
      setDuplicating(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/admin/blog/${postId}`}
        className="p-2 rounded-lg hover:bg-[#1A232C]/10 text-[#A9B8C6] hover:text-[#53D6FF] transition-colors"
        title="Edit"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </Link>
      
      {status === 'published' && (
        <Link
          href={`/blog/${slug}`}
          target="_blank"
          className="p-2 rounded-lg hover:bg-[#1A232C]/10 text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors"
          title="View Live"
        >
          <Eye className="w-4 h-4" />
        </Link>
      )}
      
      <button
        onClick={handleDuplicate}
        disabled={duplicating}
        className="p-2 rounded-lg hover:bg-[#1A232C]/10 text-[#A9B8C6] hover:text-[#53D6FF] transition-colors disabled:opacity-50"
        title="Duplicate"
      >
        {duplicating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
      
      <form action={`/api/admin/content/${postId}/delete`} method="POST" className="inline">
        <button
          type="submit"
          className="p-2 rounded-lg hover:bg-[#8DEBFF]/15 text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors"
          title="Delete"
          onClick={(e) => !confirm('Delete this post?') && e.preventDefault()}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
