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
    {
      ok: item.template !== 'impact-story' || Boolean(item.identityProtection),
      label: 'Identity-protection level recorded',
    },
    {
      ok: Boolean(item.seo?.graphicDetailReviewed),
      label: 'Graphic / trauma detail reviewed',
    },
    {
      ok: Boolean(item.seo?.identifyingInfoReviewed),
      label: 'Identifying details reviewed (names, locations, photos)',
    },
    {
      ok: !item.seo?.showPublicAdvisory || Boolean(item.seo?.contentWarning?.trim()),
      label: 'Public content advisory written (if enabled)',
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
        <div className="space-y-3">
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
        <label className="block text-sm text-[#A9B8C6]">
          Identity protection
          <select
            value={item.identityProtection || 'anonymous'}
            onChange={(e) => onChange({ identityProtection: e.target.value as ContentItem['identityProtection'] })}
            className="mt-1 w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]"
          >
            <option value="anonymous">anonymous</option>
            <option value="pseudonym">pseudonym</option>
            <option value="first_name">first name only</option>
            <option value="real_name">real name (explicit consent)</option>
          </select>
        </label>
        </div>
      )}
      <div className="mt-4 space-y-3 border-t border-[#27313B] pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#A9B8C6]">Survivor-safety review</p>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(item.seo?.graphicDetailReviewed)}
            onChange={(e) => onChange({ seo: { ...item.seo, graphicDetailReviewed: e.target.checked } })}
            className="mt-0.5"
          />
          <span className="text-[#F6FAFC]">I reviewed this copy for graphic or trauma-heavy detail.</span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(item.seo?.identifyingInfoReviewed)}
            onChange={(e) => onChange({ seo: { ...item.seo, identifyingInfoReviewed: e.target.checked } })}
            className="mt-0.5"
          />
          <span className="text-[#F6FAFC]">I confirmed no identifying survivor details appear without consent.</span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(item.seo?.showPublicAdvisory)}
            onChange={(e) => onChange({ seo: { ...item.seo, showPublicAdvisory: e.target.checked } })}
            className="mt-0.5"
          />
          <span className="text-[#F6FAFC]">Show a content advisory on the public post.</span>
        </label>
        {item.seo?.showPublicAdvisory && (
          <label className="block text-sm text-[#A9B8C6]">
            Advisory text
            <textarea
              value={item.seo?.contentWarning || ''}
              onChange={(e) => onChange({ seo: { ...item.seo, contentWarning: e.target.value } })}
              rows={2}
              placeholder="This post discusses trafficking, violence, or other trauma. Take care while reading."
              className="mt-1 w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]"
            />
          </label>
        )}
      </div>
    </div>
  )
}
