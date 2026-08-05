'use client'

import type { ContentItem } from './types'
import { BlockRenderer } from '@/src/components/blog/BlockRenderer'

type Props = {
  item: ContentItem
}

export default function BlogPostPreview({ item }: Props) {
  return (
    <div className="bg-[#05070A] rounded-xl p-6 max-h-[70vh] overflow-y-auto">
      <p className="text-xs text-[#A9B8C6] uppercase tracking-wider mb-4">Preview</p>
      <h2 className="font-playfair text-2xl font-bold text-cream-100 mb-2">{item.title}</h2>
      {item.excerpt && <p className="text-cream-100/70 text-sm mb-6">{item.excerpt}</p>}
      <div className="space-y-8">
        {item.blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} />
        ))}
      </div>
    </div>
  )
}
