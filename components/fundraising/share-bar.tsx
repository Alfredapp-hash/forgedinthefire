'use client'

import { useState } from 'react'
import { Copy, Check, Share2 } from 'lucide-react'

export function CampaignShareBar({
  path,
  title,
  caption,
}: {
  path: string
  title: string
  caption?: string | null
}) {
  const [copied, setCopied] = useState<'link' | 'caption' | null>(null)

  function url() {
    if (typeof window === 'undefined') return `https://forgedinthefireohio.org${path}`
    return `${window.location.origin}${path}`
  }

  async function copy(kind: 'link' | 'caption', text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
    }
  }

  async function nativeShare() {
    const href = url()
    if (navigator.share) {
      try {
        await navigator.share({ title, text: caption || title, url: href })
        return
      } catch {
        /* user cancelled */
      }
    }
    await copy('link', href)
  }

  const href = url()
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption || title)}&url=${encodeURIComponent(href)}`
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(href)}`

  return (
    <div className="rounded-2xl border border-[#27313B] bg-[#151B22] p-4 space-y-3">
      <p className="text-sm font-semibold text-[#F6FAFC]">Share this campaign</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy('link', href)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#27313B] px-3 py-1.5 text-xs text-[#B8C4CF] hover:border-[#53D6FF]"
        >
          {copied === 'link' ? <Check size={12} /> : <Copy size={12} />}
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
        {caption && (
          <button
            type="button"
            onClick={() => void copy('caption', `${caption}\n${href}`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#27313B] px-3 py-1.5 text-xs text-[#B8C4CF] hover:border-[#53D6FF]"
          >
            {copied === 'caption' ? <Check size={12} /> : <Copy size={12} />}
            {copied === 'caption' ? 'Copied' : 'Copy caption'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void nativeShare()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#27313B] px-3 py-1.5 text-xs text-[#B8C4CF] hover:border-[#53D6FF]"
        >
          <Share2 size={12} /> Share
        </button>
        <a href={facebook} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#27313B] px-3 py-1.5 text-xs text-[#B8C4CF] hover:border-[#53D6FF]">
          Facebook
        </a>
        <a href={tweet} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#27313B] px-3 py-1.5 text-xs text-[#B8C4CF] hover:border-[#53D6FF]">
          Post
        </a>
      </div>
    </div>
  )
}
