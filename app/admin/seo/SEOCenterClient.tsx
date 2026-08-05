'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Search,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { SEOAuditReport } from '@/src/lib/seo/audit-report-shared'
import {
  calculateSEOScore,
  getRouteHealth,
  SEO_CRAWL_CLI,
  SEO_CRAWL_SITE_URL_HINT,
} from '@/src/lib/seo/audit-report-shared'
import { GEO, ORG } from '@/lib/constants'

type Props = {
  report: SEOAuditReport | null
  isLiveCrawl: boolean
  lastUpdated?: string
}

export default function SEOCenterClient({ report, isLiveCrawl, lastUpdated }: Props) {
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'pages' | 'local' | 'recommendations'>('overview')

  const score = report ? calculateSEOScore(report.issues) : 85
  const scoreColor = score >= 90 ? '#53D6FF' : score >= 70 ? '#8DEBFF' : '#8DEBFF'

  const green = report?.routes.filter((r) => getRouteHealth(r.route, report.issues) === 'green').length ?? 8
  const yellow = report?.routes.filter((r) => getRouteHealth(r.route, report.issues) === 'yellow').length ?? 2
  const red = report?.routes.filter((r) => getRouteHealth(r.route, report.issues) === 'red').length ?? 0
  const total = report?.routes.length ?? 10

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#F6FAFC]">SEO Health Center</h1>
          <p className="text-sm text-[#A9B8C6]">
            {isLiveCrawl ? 'Live crawl report' : 'Sample data — run crawler for live stats'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold" style={{ color: scoreColor }}>{score}</p>
          <p className="text-xs text-[#A9B8C6]">Site score</p>
        </div>
      </div>

      {!isLiveCrawl && (
        <div className="bg-[#53D6FF]/10 border border-[#53D6FF]/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#8DEBFF] shrink-0" />
          <div>
            <p className="font-medium text-[#8DEBFF]">Run a live crawl</p>
            <p className="text-sm text-[#8DEBFF] mt-1 font-mono">{SEO_CRAWL_CLI}</p>
            <p className="text-xs text-[#8DEBFF] mt-1">{SEO_CRAWL_SITE_URL_HINT}</p>
          </div>
        </div>
      )}

      <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-6">
        {green > 0 && <div className="bg-[#8DEBFF]/15 rounded-full" style={{ width: `${(green / total) * 100}%` }} />}
        {yellow > 0 && <div className="bg-[#53D6FF]/10 rounded-full" style={{ width: `${(yellow / total) * 100}%` }} />}
        {red > 0 && <div className="bg-[#8DEBFF]/15 rounded-full" style={{ width: `${(red / total) * 100}%` }} />}
      </div>

      <div className="flex gap-1 mb-6 bg-[#151B22] rounded-xl p-1 border border-[#27313B] w-fit">
        {(['overview', 'pages', 'local', 'recommendations'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${activeTab === tab ? 'bg-[#53D6FF] text-[#061016]' : 'text-[#A9B8C6]'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Avg Load', value: `${report.summary.avgLoadTime}ms` },
            { label: 'Missing Titles', value: report.summary.missingTitles.length },
            { label: 'Missing Descriptions', value: report.summary.missingDescriptions.length },
            { label: 'Missing H1', value: report.summary.missingH1.length },
          ].map((s) => (
            <div key={s.label} className="bg-[#151B22] rounded-xl border border-[#27313B] p-4">
              <p className="text-xs text-[#A9B8C6] uppercase tracking-wider">{s.label}</p>
              <p className="text-2xl font-bold text-[#F6FAFC]">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'pages' && report && (
        <div className="space-y-2">
          {report.routes.map((page) => {
            const health = getRouteHealth(page.route, report.issues)
            const pageIssues = report.issues.filter((i) => i.route === page.route)
            const colors = { green: 'text-[#8DEBFF]', yellow: 'text-[#8DEBFF]', red: 'text-[#8DEBFF]' }
            return (
              <div key={page.route} className="bg-[#151B22] rounded-xl border border-[#27313B] overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#1A232C]"
                  onClick={() => setExpandedRoute(expandedRoute === page.route ? null : page.route)}
                >
                  <span className={`font-bold ${colors[health]}`}>●</span>
                  <span className="font-medium text-[#F6FAFC] flex-1">{page.route}</span>
                  <span className="text-xs text-[#A9B8C6]">{page.loadTime}ms</span>
                  {expandedRoute === page.route ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {expandedRoute === page.route && (
                  <div className="px-4 pb-4 border-t border-[#27313B] pt-3 space-y-2">
                    <p className="text-sm text-[#F6FAFC]"><strong>Title:</strong> {page.title || '—'}</p>
                    <p className="text-sm text-[#F6FAFC]"><strong>Description:</strong> {page.metaDescription || '—'}</p>
                    {pageIssues.map((issue, i) => (
                      <p key={i} className="text-sm text-[#8DEBFF] flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {issue.issue}
                      </p>
                    ))}
                    <Link href={page.url} target="_blank" className="text-sm text-[#53D6FF] flex items-center gap-1">
                      View page <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'local' && (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-4">
          <h3 className="font-semibold text-[#F6FAFC] flex items-center gap-2">
            <Search className="w-5 h-5 text-[#53D6FF]" /> Local SEO — {GEO.label}
          </h3>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><dt className="text-[#A9B8C6]">Organization</dt><dd className="font-medium">{ORG.name}</dd></div>
            <div><dt className="text-[#A9B8C6]">Address</dt><dd className="font-medium">{ORG.address}</dd></div>
            <div><dt className="text-[#A9B8C6]">Phone</dt><dd className="font-medium">{ORG.phone}</dd></div>
            <div><dt className="text-[#A9B8C6]">Service Area</dt><dd className="font-medium">{GEO.serviceArea}</dd></div>
          </dl>
          <p className="text-xs text-[#A9B8C6]">Update NAP details in Settings to keep local SEO consistent site-wide.</p>
        </div>
      )}

      {activeTab === 'recommendations' && report && (
        <ul className="space-y-2">
          {report.recommendations.map((rec, i) => (
            <li key={i} className="flex items-start gap-2 bg-[#151B22] rounded-xl border border-[#27313B] p-4 text-sm">
              <CheckCircle className="w-4 h-4 text-[#53D6FF] shrink-0 mt-0.5" />
              {rec}
            </li>
          ))}
        </ul>
      )}

      {isLiveCrawl && lastUpdated && (
        <p className="text-xs text-[#A9B8C6] mt-6 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Last crawl: {new Date(lastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  )
}
