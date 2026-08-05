'use client'

import { useState } from 'react'
import { BLOCK_REGISTRY, CATEGORY_LABELS, type BlockCategory } from './blockRegistry'
import type { ContentBlockType } from './types'

type Props = {
  onAdd: (type: ContentBlockType) => void
}

const CATEGORY_ORDER: BlockCategory[] = ['content', 'media', 'cta', 'social', 'data', 'layout']

export default function AddSectionMenu({ onAdd }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full py-3 border-2 border-dashed border-[#27313B] rounded-xl text-sm font-semibold text-[#A9B8C6] hover:border-[#53D6FF] hover:text-[#53D6FF] transition-colors"
      >
        + Add Section
      </button>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-2 bg-[#151B22] border border-[#27313B] rounded-xl shadow-forge p-4 max-h-80 overflow-y-auto">
          {CATEGORY_ORDER.map((cat) => {
            const blocks = BLOCK_REGISTRY.filter((b) => b.category === cat)
            if (!blocks.length) return null
            return (
              <div key={cat} className="mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[#A9B8C6] mb-2">
                  {CATEGORY_LABELS[cat]}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {blocks.map((b) => (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => { onAdd(b.type); setOpen(false) }}
                      className="text-left px-3 py-2 rounded-lg text-sm hover:bg-[#53D6FF]/10 border border-transparent hover:border-[#53D6FF]/30"
                    >
                      <span className="mr-1">{b.icon}</span> {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
