'use client'

import { useState, useEffect } from 'react'
import { 
  Search, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info
} from 'lucide-react'
import Link from 'next/link'

type SEOHealthStatus = 'green' | 'yellow' | 'red'

interface SEOIssue {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: 'title' | 'meta' | 'headings' | 'images' | 'links' | 'performance'
  message: string
  route: string
  suggestion?: string
}

interface SEOPageData {
  route: string
  url: string
  score: number
  status: SEOHealthStatus
  title: string | null
  metaDescription: string | null
  hasH1: boolean
  h1Count: number
  imageCount: number
  imagesWithoutAlt: number
  loadTime: number
  issues: SEOIssue[]
}

interface SEOAuditData {
  timestamp: string
  totalPages: number
  averageScore: number
  pages: SEOPageData[]
  issues: SEOIssue[]
}

// Mock data for initial load - will be replaced with real crawler data
const mockAuditData: SEOAuditData = {
  timestamp: new Date().toISOString(),
  totalPages: 10,
  averageScore: 85,
  pages: [
    {
      route: '/',
      url: 'https://www.forgedinthefireohio.org/',
      score: 92,
      status: 'green',
      title: 'Human Trafficking Victim Advocacy Lorain County Ohio | Forged in the Fire',
      metaDescription: 'Forged in the Fire provides survivor centered human trafficking victim advocacy...',
      hasH1: true,
      h1Count: 1,
      imageCount: 8,
      imagesWithoutAlt: 0,
      loadTime: 1.2,
      issues: []
    },
    {
      route: '/about',
      url: 'https://www.forgedinthefireohio.org/about',
      score: 88,
      status: 'green',
      title: 'About Forged in the Fire | Anti Trafficking Nonprofit Lorain County Ohio',
      metaDescription: 'Meet Forged in the Fire, a Lorain County based anti human trafficking nonprofit...',
      hasH1: true,
      h1Count: 1,
      imageCount: 5,
      imagesWithoutAlt: 0,
      loadTime: 0.9,
      issues: []
    },
    {
      route: '/services',
      url: 'https://www.forgedinthefireohio.org/services',
      score: 78,
      status: 'yellow',
      title: 'Human Trafficking Survivor Services Lorain County Ohio | Forged in the Fire',
      metaDescription: null,
      hasH1: true,
      h1Count: 1,
      imageCount: 3,
      imagesWithoutAlt: 1,
      loadTime: 1.5,
      issues: [
        {
          id: '1',
          severity: 'medium',
          category: 'meta',
          message: 'Missing meta description',
          route: '/services',
          suggestion: 'Add a compelling meta description (150-160 characters)'
        },
        {
          id: '2',
          severity: 'low',
          category: 'images',
          message: '1 image missing alt text',
          route: '/services',
          suggestion: 'Add descriptive alt text for accessibility and SEO'
        }
      ]
    },
    {
      route: '/get-help',
      url: 'https://www.forgedinthefireohio.org/get-help',
      score: 72,
      status: 'yellow',
      title: 'Get Help for Human Trafficking in Lorain County Ohio | Forged in the Fire',
      metaDescription: 'Need help for human trafficking in Lorain County or Northeast Ohio? Find crisis hotlines...',
      hasH1: true,
      h1Count: 2,
      imageCount: 2,
      imagesWithoutAlt: 0,
      loadTime: 0.8,
      issues: [
        {
          id: '3',
          severity: 'high',
          category: 'headings',
          message: 'Multiple H1 tags found',
          route: '/get-help',
          suggestion: 'Use only one H1 tag per page. Use H2-H6 for subsections.'
        }
      ]
    },
    {
      route: '/blog',
      url: 'https://www.forgedinthefireohio.org/blog',
      score: 45,
      status: 'red',
      title: null,
      metaDescription: null,
      hasH1: false,
      h1Count: 0,
      imageCount: 0,
      imagesWithoutAlt: 0,
      loadTime: 0.5,
      issues: [
        {
          id: '4',
          severity: 'critical',
          category: 'title',
          message: 'Missing page title',
          route: '/blog',
          suggestion: 'Add a descriptive title tag (50-60 characters)'
        },
        {
          id: '5',
          severity: 'critical',
          category: 'headings',
          message: 'Missing H1 tag',
          route: '/blog',
          suggestion: 'Add a single H1 tag that describes the page content'
        }
      ]
    }
  ],
  issues: [
    {
      id: '4',
      severity: 'critical',
      category: 'title',
      message: 'Missing page title',
      route: '/blog',
      suggestion: 'Add a descriptive title tag (50-60 characters)'
    },
    {
      id: '5',
      severity: 'critical',
      category: 'headings',
      message: 'Missing H1 tag',
      route: '/blog',
      suggestion: 'Add a single H1 tag that describes the page content'
    },
    {
      id: '3',
      severity: 'high',
      category: 'headings',
      message: 'Multiple H1 tags found',
      route: '/get-help',
      suggestion: 'Use only one H1 tag per page. Use H2-H6 for subsections.'
    },
    {
      id: '1',
      severity: 'medium',
      category: 'meta',
      message: 'Missing meta description',
      route: '/services',
      suggestion: 'Add a compelling meta description (150-160 characters)'
    },
    {
      id: '2',
      severity: 'low',
      category: 'images',
      message: '1 image missing alt text',
      route: '/services',
      suggestion: 'Add descriptive alt text for accessibility and SEO'
    }
  ]
}

function StatusBadge({ status }: { status: SEOHealthStatus }) {
  const styles = {
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    yellow: 'bg-amber-100 text-amber-700 border-amber-200',
    red: 'bg-red-100 text-red-700 border-red-200',
  }
  const icons = {
    green: CheckCircle,
    yellow: AlertTriangle,
    red: AlertCircle,
  }
  const Icon = icons[status]
  const labels = { green: 'Good', yellow: 'Needs Work', red: 'Critical' }
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
      <Icon className="w-3.5 h-3.5" />
      {labels[status]}
    </span>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 90 ? 'text-emerald-600' : score >= 70 ? 'text-amber-600' : 'text-red-600'
  return (
    <span className={`text-lg font-bold ${color}`}>{score}</span>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-blue-100 text-blue-700',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${styles[severity as keyof typeof styles]}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  )
}

export default function SEOPage() {
  const [auditData, setAuditData] = useState<SEOAuditData | null>(mockAuditData)
  const [loading, setLoading] = useState(false)
  const [expandedPage, setExpandedPage] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'issues'>('all')

  const runAudit = async () => {
    setLoading(true)
    // In production, this would call the SEO crawler script
    // For now, we'll just simulate a delay
    await new Promise(resolve => setTimeout(resolve, 2000))
    setAuditData({ ...mockAuditData, timestamp: new Date().toISOString() })
    setLoading(false)
  }

  const criticalCount = auditData?.issues.filter(i => i.severity === 'critical').length || 0
  const highCount = auditData?.issues.filter(i => i.severity === 'high').length || 0
  const mediumCount = auditData?.issues.filter(i => i.severity === 'medium').length || 0
  const lowCount = auditData?.issues.filter(i => i.severity === 'low').length || 0

  const filteredPages = filter === 'issues' 
    ? auditData?.pages.filter(p => p.issues.length > 0) 
    : auditData?.pages

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E1714]">SEO Health Center</h1>
          <p className="text-sm text-[#8B5E3C]">
            Last audited: {auditData ? new Date(auditData.timestamp).toLocaleString() : 'Never'}
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-[#1E6B73] hover:bg-[#4C9AA3] text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Running Audit...' : 'Run Audit'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wider">Critical</p>
          <p className="text-3xl font-bold text-red-600">{criticalCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 p-4">
          <p className="text-xs font-medium text-orange-600 uppercase tracking-wider">High</p>
          <p className="text-3xl font-bold text-orange-600">{highCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Medium</p>
          <p className="text-3xl font-bold text-amber-600">{mediumCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-4">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Low</p>
          <p className="text-3xl font-bold text-blue-600">{lowCount}</p>
        </div>
      </div>

      {/* Overall Score */}
      <div className="bg-white rounded-xl border border-[#3A2A24]/20 p-6">
        <div className="flex items-center gap-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold ${
            (auditData?.averageScore || 0) >= 90 ? 'bg-emerald-100 text-emerald-700' :
            (auditData?.averageScore || 0) >= 70 ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          }`}>
            {auditData?.averageScore || 0}
          </div>
          <div>
            <p className="text-lg font-semibold text-[#1E1714]">Overall Site Health</p>
            <p className="text-sm text-[#8B5E3C]">
              {auditData?.averageScore && auditData.averageScore >= 90 
                ? 'Excellent! Your site is well-optimized.' :
                auditData?.averageScore && auditData.averageScore >= 70
                ? 'Good, but there are areas for improvement.'
                : 'Needs attention. Critical issues found.'}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-[#1E6B73] text-white'
              : 'bg-white border border-[#3A2A24]/20 text-[#8B5E3C] hover:bg-[#f4f6f9]'
          }`}
        >
          All Pages ({auditData?.pages.length || 0})
        </button>
        <button
          onClick={() => setFilter('issues')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'issues'
              ? 'bg-[#C8A46B] text-white'
              : 'bg-white border border-[#3A2A24]/20 text-[#8B5E3C] hover:bg-[#f4f6f9]'
          }`}
        >
          With Issues ({auditData?.pages.filter(p => p.issues.length > 0).length || 0})
        </button>
      </div>

      {/* Pages List */}
      <div className="bg-white rounded-xl border border-[#3A2A24]/20 overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f4f6f9] border-b border-[#3A2A24]/10">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#8B5E3C] uppercase">Page</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#8B5E3C] uppercase">Score</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#8B5E3C] uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#8B5E3C] uppercase">Issues</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#8B5E3C] uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#3A2A24]/10">
            {filteredPages?.map((page) => (
              <>
                <tr 
                  key={page.route}
                  className="hover:bg-[#f4f6f9]/50 transition-colors cursor-pointer"
                  onClick={() => setExpandedPage(expandedPage === page.route ? null : page.route)}
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-[#1E1714]">{page.route}</p>
                      <p className="text-xs text-[#8B5E3C] truncate max-w-xs">
                        {page.title || 'No title'}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={page.score} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={page.status} />
                  </td>
                  <td className="px-4 py-3">
                    {page.issues.length > 0 ? (
                      <span className="text-sm font-medium text-red-600">
                        {page.issues.length} issues
                      </span>
                    ) : (
                      <span className="text-sm text-emerald-600">No issues</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expandedPage === page.route ? (
                      <ChevronUp className="w-4 h-4 text-[#8B5E3C] inline" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#8B5E3C] inline" />
                    )}
                  </td>
                </tr>
                {expandedPage === page.route && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 bg-[#f4f6f9]">
                      <div className="space-y-4">
                        {/* Page Details */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-[#8B5E3C] mb-1">Title Tag</p>
                            <p className={`font-medium ${page.title ? 'text-[#1E1714]' : 'text-red-600'}`}>
                              {page.title || 'Missing'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[#8B5E3C] mb-1">Meta Description</p>
                            <p className={`font-medium ${page.metaDescription ? 'text-[#1E1714]' : 'text-red-600'}`}>
                              {page.metaDescription || 'Missing'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[#8B5E3C] mb-1">H1 Tags</p>
                            <p className={`font-medium ${page.h1Count === 1 ? 'text-emerald-600' : page.h1Count === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                              {page.h1Count} found {page.h1Count !== 1 && '(should be 1)'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[#8B5E3C] mb-1">Images Without Alt</p>
                            <p className={`font-medium ${page.imagesWithoutAlt === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {page.imagesWithoutAlt} of {page.imageCount}
                            </p>
                          </div>
                        </div>

                        {/* Issues */}
                        {page.issues.length > 0 && (
                          <div className="border-t border-[#3A2A24]/10 pt-4">
                            <p className="text-sm font-medium text-[#1E1714] mb-3">Issues Found</p>
                            <div className="space-y-2">
                              {page.issues.map((issue) => (
                                <div key={issue.id} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-[#3A2A24]/10">
                                  <SeverityBadge severity={issue.severity} />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-[#1E1714]">{issue.message}</p>
                                    {issue.suggestion && (
                                      <p className="text-xs text-[#8B5E3C] mt-1">
                                        <Info className="w-3 h-3 inline mr-1" />
                                        {issue.suggestion}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action */}
                        <div className="flex justify-end">
                          <Link
                            href={page.route === '/' ? '/' : page.route}
                            target="_blank"
                            className="inline-flex items-center gap-1.5 text-sm text-[#1E6B73] hover:text-[#4C9AA3] transition-colors"
                          >
                            View Page
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Help Section */}
      <div className="bg-[#1E1714] rounded-xl p-6 border border-[#3A2A24]">
        <h3 className="text-lg font-bold text-[#C8A46B] mb-4">SEO Best Practices for Nonprofits</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[#4C9AA3] shrink-0 mt-0.5" />
            <p className="text-[#CDBDAF]">Use clear, descriptive titles that help survivors find your services.</p>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[#4C9AA3] shrink-0 mt-0.5" />
            <p className="text-[#CDBDAF]">Write compelling meta descriptions that encourage clicks from search results.</p>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[#4C9AA3] shrink-0 mt-0.5" />
            <p className="text-[#CDBDAF]">Use proper heading structure (H1 → H2 → H3) for accessibility.</p>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[#4C9AA3] shrink-0 mt-0.5" />
            <p className="text-[#CDBDAF]">Always add alt text to images for screen readers and SEO.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
