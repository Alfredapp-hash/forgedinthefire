'use client'

import { CheckCircle, AlertCircle } from 'lucide-react'
import type { ContentItem } from './types'

type Props = {
  item: ContentItem
  onChange: (patch: Partial<ContentItem>) => void
}

export default function BlogPublishingChecklist({ item, onChange }: Props) {
  const checks = [
    { ok: Boolean(item.title?.trim()), label: 'Title is set' },
    { ok: Boolean(item.slug?.trim()), label: 'URL slug is set' },
    { ok: item.blocks.length > 0, label: 'At least one content block' },
    { ok: Boolean(item.excerpt?.trim()), label: 'Excerpt for cards & email' },
    { ok: Boolean(item.seo?.title?.trim()), label: 'SEO title configured' },
    { ok: Boolean(item.seo?.description?.trim()), label: 'Meta description configured' },
    {
      ok: item.template !== 'impact-story' || Boolean(item.consentConfirmed),
      label: 'Survivor consent confirmed (impact stories)',
      warn: item.template === 'impact-story' && !item.consentConfirmed,
    },
  ]

  const passed = checks.filter((c) => c.ok).length
  const ready = passed === checks.length

  return (
    <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[#F6FAFC]">Publishing Checklist</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ready ? 'bg-[#8DEBFF]/15 text-[#8DEBFF]' : 'bg-[#53D6FF]/10 text-[#8DEBFF]'}`}>
          {passed}/{checks.length}
        </span>
      </div>
      <ul className="space-y-2 mb-4">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-sm">
            {c.ok ? (
              <CheckCircle className="w-4 h-4 text-[#8DEBFF] shrink-0" />
            ) : (
              <AlertCircle className={`w-4 h-4 shrink-0 ${c.warn ? 'text-[#8DEBFF]' : 'text-[#8DEBFF]'}`} />
            )}
            <span className={c.ok ? 'text-[#F6FAFC]' : 'text-[#A9B8C6]'}>{c.label}</span>
          </li>
        ))}
      </ul>
      {item.template === 'impact-story' && (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(item.consentConfirmed)}
            onChange={(e) => onChange({ consentConfirmed: e.target.checked })}
            className="mt-0.5"
          />
          <span className="text-[#F6FAFC]">
            I confirm written consent from the survivor has been obtained for this story.
          </span>
        </label>
      )}
    </div>
  )
}
