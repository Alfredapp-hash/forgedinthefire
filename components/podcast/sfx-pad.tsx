'use client'

import { previewSfx, SFX_META, type SfxId } from '@/lib/podcast/sfx'

type Props = {
  disabled?: boolean
  compact?: boolean
  onDrop: (id: SfxId) => void
}

export function SfxPad({ disabled, compact, onDrop }: Props) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mr-1">SFX 1–0</p>
        {SFX_META.map((sfx, idx) => (
          <button
            key={sfx.id}
            type="button"
            title={`${idx === 9 ? '0' : idx + 1} · ${sfx.hint}`}
            disabled={disabled}
            className="rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-[11px] text-[#B8C4CF] disabled:opacity-40"
            onClick={() => onDrop(sfx.id)}
          >
            {idx === 9 ? '0' : idx + 1} {sfx.label}
          </button>
        ))}
      </div>
    )
  }
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mb-2">
        Sound effects · generated in Chrome
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {SFX_META.map((sfx) => (
          <div key={sfx.id} className="rounded-lg border border-[#27313B] bg-[#151B22] p-2 space-y-1.5">
            <p className="text-sm text-[#F6FAFC]">{sfx.label}</p>
            <p className="text-[10px] text-[#A9B8C6] leading-snug">{sfx.hint}</p>
            <div className="flex gap-1">
              <button
                type="button"
                className="flex-1 rounded border border-[#27313B] px-2 py-1 text-[11px] text-[#B8C4CF] disabled:opacity-40"
                disabled={disabled}
                onClick={() => void previewSfx(sfx.id)}
              >
                Preview
              </button>
              <button
                type="button"
                className="flex-1 rounded border border-[#53D6FF]/40 px-2 py-1 text-[11px] text-[#8DEBFF] disabled:opacity-40"
                disabled={disabled}
                onClick={() => onDrop(sfx.id)}
              >
                Drop
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
