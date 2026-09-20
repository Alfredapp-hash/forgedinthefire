'use client'

import type { ContentItem, SEOCheck, SEOHealthScore } from './types'

type SEOPanelProps = {
  item: ContentItem
  onChange: (seo: ContentItem['seo']) => void
}

/**
 * SEO Health Panel for Blog Studio
 * 
 * Provides real-time SEO checks and scoring for content items.
 * Adapted from Thomas Marine Blog Studio for Forged nonprofit use.
 */

export function calculateSEOScore(item: ContentItem): SEOHealthScore {
  const titleLen = item.seo?.title?.length || 0
  const descLen = item.seo?.description?.length || 0
  const hasBlocks = item.blocks.length > 0
  const textBlocks = item.blocks.filter(b => b.type === 'text')
  const contentLength = textBlocks.reduce((acc, b) => acc + (b.data.content?.length || 0), 0)
  
  const checks: SEOCheck[] = [
    {
      id: 'title-length',
      label: 'SEO Title Length (30-65 characters)',
      ok: titleLen >= 30 && titleLen <= 65,
      warn: titleLen > 0 && (titleLen < 30 || titleLen > 65),
      value: titleLen
    },
    {
      id: 'title-present',
      label: 'SEO Title Present',
      ok: !!item.seo?.title && item.seo.title.length > 0,
    },
    {
      id: 'description-length',
      label: 'Meta Description (120-160 characters)',
      ok: descLen >= 120 && descLen <= 160,
      warn: descLen > 0 && (descLen < 120 || descLen > 160),
      value: descLen
    },
    {
      id: 'description-present',
      label: 'Meta Description Present',
      ok: !!item.seo?.description && item.seo.description.length > 0,
    },
    {
      id: 'slug',
      label: 'URL Slug Set',
      ok: !!item.slug && item.slug.length > 0,
    },
    {
      id: 'excerpt',
      label: 'Excerpt / Summary Set',
      ok: !!item.excerpt && item.excerpt.length > 20,
    },
    {
      id: 'category',
      label: 'Category Assigned',
      ok: !!item.category,
    },
    {
      id: 'featured-image',
      label: 'Featured Image Present',
      ok: !!item.featuredImage?.url,
    },
    {
      id: 'image-alt',
      label: 'Featured Image Has Alt Text',
      ok: !!item.featuredImage?.alt && item.featuredImage.alt.length > 0,
    },
    {
      id: 'og-image',
      label: 'Open Graph / Social Image Set',
      ok: !!item.seo?.ogImage || !!item.featuredImage?.url,
    },
    {
      id: 'content-length',
      label: 'Content Length (300+ words recommended)',
      ok: contentLength >= 1500, // ~300 words
      warn: contentLength > 0 && contentLength < 1500,
      value: Math.round(contentLength / 5) // approximate word count
    },
    {
      id: 'has-cta',
      label: 'Call to Action Present',
      ok: !!item.cta && !!item.cta.text && !!item.cta.url,
    },
    {
      id: 'keywords',
      label: 'Focus Keywords Set',
      ok: (item.seo?.keywords?.length || 0) > 0,
    },
  ]

  const passed = checks.filter(c => c.ok).length
  const total = checks.length
  const score = Math.round((passed / total) * 100)

  return { score, checks, passed, total }
}

export default function SEOPanel({ item, onChange }: SEOPanelProps) {
  const seo = item.seo || {}
  const health = calculateSEOScore(item)
  
  const handleChange = (patch: Partial<typeof seo>) => {
    onChange({ ...seo, ...patch })
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[#8DEBFF] bg-[#8DEBFF]/15 border-[#8DEBFF]/30'
    if (score >= 60) return 'text-[#8DEBFF] bg-[#53D6FF]/10 border-[#53D6FF]/30'
    return 'text-[#8DEBFF] bg-[#8DEBFF]/15 border-[#8DEBFF]/35'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Good'
    if (score >= 60) return 'Needs Work'
    return 'Needs Attention'
  }

  const titleLen = seo.title?.length || 0
  const descLen = seo.description?.length || 0

  return (
    <div className="space-y-6">
      {/* Score Card */}
      <div className={`p-4 rounded-xl border ${getScoreColor(health.score)}`}>
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#27313B" strokeWidth="3" />
              <circle 
                cx="18" 
                cy="18" 
                r="15.9" 
                fill="none" 
                strokeWidth="3"
                stroke={health.score >= 80 ? '#53D6FF' : health.score >= 60 ? '#8DEBFF' : '#8DEBFF'}
                strokeDasharray={`${health.score} ${100 - health.score}`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
              {health.score}%
            </span>
          </div>
          <div>
            <p className="font-semibold">SEO Health: {getScoreLabel(health.score)}</p>
            <p className="text-sm opacity-75">
              {health.passed} of {health.total} checks passed
            </p>
          </div>
        </div>
      </div>

      {/* Checks List */}
      <div className="bg-[#05070A] rounded-xl p-4 border border-[#27313B]">
        <p className="text-xs font-semibold text-[#A9B8C6] uppercase tracking-wider mb-3">
          SEO Checklist
        </p>
        <div className="space-y-1.5">
          {health.checks.map((check) => (
            <div key={check.id} className="flex items-center gap-2 text-sm">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                check.ok 
                  ? 'bg-[#8DEBFF]/15 text-[#8DEBFF]' 
                  : check.warn 
                    ? 'bg-[#53D6FF]/10 text-[#8DEBFF]'
                    : 'bg-[#8DEBFF]/15 text-[#8DEBFF]'
              }`}>
                {check.ok ? '✓' : check.warn ? '!' : '✗'}
              </span>
              <span className={check.ok ? 'text-[#F6FAFC]' : 'text-[#A9B8C6]'}>
                {check.label}
              </span>
              {check.value !== undefined && (
                <span className="text-xs text-[#A9B8C6] ml-auto">
                  {check.value}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SEO Fields */}
      <div className="space-y-4">
        {/* SEO Title */}
        <div>
          <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
            SEO Title
            <span className={`text-xs ml-2 ${
              titleLen > 65 ? 'text-[#8DEBFF]' : titleLen >= 30 ? 'text-[#8DEBFF]' : 'text-[#A9B8C6]'
            }`}>
              {titleLen} / 65
            </span>
          </label>
          <input
            type="text"
            value={seo.title || ''}
            onChange={(e) => handleChange({ title: e.target.value })}
            placeholder={`${item.title} | Forged in the Fire`}
            className={`w-full border rounded-lg px-3 py-2 text-sm bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30 ${
              titleLen > 65 ? 'border-[#8DEBFF]/35' : 'border-[#27313B]'
            }`}
            maxLength={80}
          />
          <p className="text-xs text-[#A9B8C6] mt-1">
            Appears in search results and browser tabs. 30-65 characters recommended.
          </p>
        </div>

        {/* Meta Description */}
        <div>
          <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
            Meta Description
            <span className={`text-xs ml-2 ${
              descLen > 160 ? 'text-[#8DEBFF]' : descLen >= 120 ? 'text-[#8DEBFF]' : 'text-[#A9B8C6]'
            }`}>
              {descLen} / 160
            </span>
          </label>
          <textarea
            value={seo.description || ''}
            onChange={(e) => handleChange({ description: e.target.value })}
            placeholder="Brief description of this content for search results..."
            rows={3}
            className={`w-full border rounded-lg px-3 py-2 text-sm bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30 resize-none ${
              descLen > 160 ? 'border-[#8DEBFF]/35' : 'border-[#27313B]'
            }`}
            maxLength={200}
          />
          <p className="text-xs text-[#A9B8C6] mt-1">
            Appears in search results. 120-160 characters recommended.
          </p>
        </div>

        {/* Keywords */}
        <div>
          <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
            Focus Keywords
          </label>
          <input
            type="text"
            value={(seo.keywords || []).join(', ')}
            onChange={(e) => handleChange({ 
              keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
            })}
            placeholder="human trafficking advocacy, Lorain County Ohio, survivor support"
            className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30"
          />
          <p className="text-xs text-[#A9B8C6] mt-1">
            Separate keywords with commas. These help with SEO focus.
          </p>
        </div>

        {/* Open Graph Title */}
        <div>
          <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
            Social Share Title (Open Graph)
          </label>
          <input
            type="text"
            value={seo.ogTitle || ''}
            onChange={(e) => handleChange({ ogTitle: e.target.value })}
            placeholder={seo.title || item.title}
            className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30"
          />
          <p className="text-xs text-[#A9B8C6] mt-1">
            Title shown when shared on Facebook, LinkedIn, etc.
          </p>
        </div>

        {/* Open Graph Description */}
        <div>
          <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
            Social Share Description
          </label>
          <textarea
            value={seo.ogDescription || ''}
            onChange={(e) => handleChange({ ogDescription: e.target.value })}
            placeholder={seo.description || item.excerpt}
            rows={2}
            className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30 resize-none"
          />
        </div>

        {/* Canonical URL */}
        <div>
          <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
            Canonical URL
          </label>
          <input
            type="text"
            value={seo.canonicalUrl || ''}
            onChange={(e) => handleChange({ canonicalUrl: e.target.value })}
            placeholder={`https://www.forgedinthefireohio.org/blog/${item.slug}`}
            className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:ring-2 focus:ring-[#53D6FF]/30"
          />
        </div>

        {/* No Index */}
        <div className="flex items-start gap-3 pt-4 border-t border-[#27313B]">
          <input
            type="checkbox"
            id="noIndex"
            checked={seo.noIndex || false}
            onChange={(e) => handleChange({ noIndex: e.target.checked })}
            className="mt-0.5 rounded border-[#27313B]"
          />
          <label htmlFor="noIndex" className="text-sm text-[#F6FAFC]">
            <span className="font-medium">Hide from search engines</span>
            <span className="text-[#A9B8C6] block text-xs mt-0.5">
              Enable noindex to prevent this content from appearing in search results.
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}
