'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Users, FileText, TrendingUp, ExternalLink } from 'lucide-react'
import Link from 'next/link'

type AnalyticsData = {
  operational: { activeSubscribers: number; newSubscribers7d: number; publishedPosts: number }
  ga4: { sessions7d: number; users7d: number; pageviews7d: number } | null
  ga4Configured: boolean
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/analytics')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-[#A9B8C6]">Loading analytics...</div>

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#F6FAFC]">Analytics</h1>
        <p className="text-sm text-[#A9B8C6]">Site traffic and operational metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Active Subscribers', value: data?.operational.activeSubscribers ?? 0, icon: Users, color: '#53D6FF' },
          { label: 'New Subscribers (7d)', value: data?.operational.newSubscribers7d ?? 0, icon: TrendingUp, color: '#8DEBFF' },
          { label: 'Published Posts', value: data?.operational.publishedPosts ?? 0, icon: FileText, color: '#53D6FF' },
        ].map((s) => (
          <div key={s.label} className="bg-[#151B22] rounded-xl border border-[#27313B] p-5">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-5 h-5" style={{ color: s.color }} />
              <p className="text-xs font-bold uppercase tracking-wider text-[#A9B8C6]">{s.label}</p>
            </div>
            <p className="text-3xl font-bold text-[#F6FAFC]">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-[#53D6FF]" />
          <h2 className="font-semibold text-[#F6FAFC]">Google Analytics (7 days)</h2>
        </div>
        {data?.ga4 ? (
          <div className="grid grid-cols-3 gap-4">
            <div><p className="text-xs text-[#A9B8C6]">Sessions</p><p className="text-2xl font-bold">{data.ga4.sessions7d}</p></div>
            <div><p className="text-xs text-[#A9B8C6]">Users</p><p className="text-2xl font-bold">{data.ga4.users7d}</p></div>
            <div><p className="text-xs text-[#A9B8C6]">Page Views</p><p className="text-2xl font-bold">{data.ga4.pageviews7d}</p></div>
          </div>
        ) : (
          <div className="text-sm text-[#A9B8C6] space-y-2">
            <p>GA4 Data API not configured or unavailable.</p>
            <p>Add <code className="bg-[#05070A] px-1 rounded">GA4_PROPERTY_ID</code>, <code className="bg-[#05070A] px-1 rounded">GA4_CLIENT_EMAIL</code>, and <code className="bg-[#05070A] px-1 rounded">GA4_PRIVATE_KEY</code> in Vercel env vars for live traffic data.</p>
            <p>Set your GA4 Measurement ID in <Link href="/admin/settings" className="text-[#53D6FF] underline">Settings</Link> for public tracking with consent.</p>
            <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#53D6FF] font-medium">
              Open Google Analytics <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
