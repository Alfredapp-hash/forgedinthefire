export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Mail, Download, Users, Calendar, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Subscriber, SubscriptionInterest } from '@/src/features/subscribers/types'
import { getInterestLabel } from '@/src/features/subscribers/types'

const TEAL = '#1E6B73'
const GOLD = '#C8A46B'

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    unsubscribed: 'bg-gray-100 text-gray-600 border-gray-200',
    bounced: 'bg-red-100 text-red-700 border-red-200',
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.active}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function InterestBadge({ interest }: { interest: SubscriptionInterest }) {
  const colors: Record<string, string> = {
    'survivor-support': 'bg-purple-100 text-purple-700 border-purple-200',
    'volunteer': 'bg-blue-100 text-blue-700 border-blue-200',
    'donor-updates': 'bg-amber-100 text-amber-700 border-amber-200',
    'community-events': 'bg-pink-100 text-pink-700 border-pink-200',
    'general': 'bg-gray-100 text-gray-700 border-gray-200',
  }
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[interest] || colors.general}`}>
      {getInterestLabel(interest)}
    </span>
  )
}

export default async function SubscribersPage() {
  const supabase = await createClient()
  
  // Handle missing Supabase configuration
  if (!supabase) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6">
          <h2 className="text-amber-400 font-medium mb-2">Database Not Connected</h2>
          <p className="text-amber-400/80 text-sm">
            Supabase environment variables are missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        </div>
      </div>
    )
  }
  
  const { data: subscribers, error } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, name, phone, interest, source, status, created_at')
    .order('created_at', { ascending: false })
  
  const subscriberList = (subscribers as unknown as Subscriber[]) || []
  
  // Calculate stats
  const activeCount = subscriberList.filter(s => s.status === 'active').length
  const unsubscribedCount = subscriberList.filter(s => s.status === 'unsubscribed').length
  const bouncedCount = subscriberList.filter(s => s.status === 'bounced').length
  
  // Group by interest
  const interestCounts: Record<string, number> = {}
  subscriberList.forEach(s => {
    interestCounts[s.interest] = (interestCounts[s.interest] || 0) + 1
  })
  
  // Generate CSV export
  const csvHeader = ['Email', 'Name', 'Phone', 'Interest', 'Source', 'Status', 'Date Subscribed']
  const csvRows = subscriberList.map(s => [
    s.email,
    s.name || '',
    s.phone || '',
    getInterestLabel(s.interest),
    s.source || 'website',
    s.status,
    new Date(s.created_at).toLocaleDateString()
  ].map(field => `"${field.replace(/"/g, '""')}"`)) // Escape quotes
  
  const csvContent = [csvHeader.join(','), ...csvRows].join('\n')
  
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#1E1714] mb-2">Subscribers</h1>
        <p className="text-[#8B5E3C]">Manage newsletter subscribers and view engagement stats.</p>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-[#3A2A24]/20">
          <p className="text-xs font-bold uppercase tracking-widest text-[#8B5E3C] mb-2">Total Subscribers</p>
          <p className="text-3xl font-bold text-[#1E1714]">{subscriberList.length}</p>
          <div className="flex items-center gap-1 mt-1">
            <Users className="w-4 h-4 text-[#4C9AA3]" />
            <p className="text-xs text-[#4C9AA3]">All time</p>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-[#3A2A24]/20">
          <p className="text-xs font-bold uppercase tracking-widest text-[#8B5E3C] mb-2">Active</p>
          <p className="text-3xl font-bold text-emerald-600">{activeCount}</p>
          <p className="text-xs text-emerald-600/70 mt-1">Currently receiving updates</p>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-[#3A2A24]/20">
          <p className="text-xs font-bold uppercase tracking-widest text-[#8B5E3C] mb-2">Unsubscribed</p>
          <p className="text-3xl font-bold text-gray-500">{unsubscribedCount}</p>
          <p className="text-xs text-gray-400 mt-1">Opted out</p>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-[#3A2A24]/20">
          <p className="text-xs font-bold uppercase tracking-widest text-[#8B5E3C] mb-2">Bounced</p>
          <p className="text-3xl font-bold text-red-500">{bouncedCount}</p>
          <p className="text-xs text-red-400 mt-1">Invalid emails</p>
        </div>
      </div>
      
      {/* Interest Breakdown */}
      {Object.keys(interestCounts).length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-[#3A2A24]/20">
          <h2 className="text-lg font-bold text-[#1E1714] mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#8B5E3C]" />
            Interest Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(interestCounts).map(([interest, count]) => (
              <div key={interest} className="flex items-center gap-2 bg-[#f4f6f9] rounded-lg px-3 py-2">
                <InterestBadge interest={interest as SubscriptionInterest} />
                <span className="text-sm font-medium text-[#1E1714]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#1E1714]">Subscriber List</h2>
        {subscriberList.length > 0 && (
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`}
            download="forged-in-the-fire-subscribers.csv"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm border border-[#3A2A24]/20 text-[#8B5E3C] hover:bg-[#f4f6f9] transition-colors"
          >
            <Download size={16} /> Export CSV
          </a>
        )}
      </div>
      
      {/* Subscribers Table */}
      {subscriberList.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#3A2A24]/20 p-16 text-center">
          <Mail size={48} className="mx-auto mb-4 text-[#8B5E3C]/40" />
          <p className="font-semibold text-[#1E1714] mb-1 text-lg">No subscribers yet</p>
          <p className="text-sm text-[#8B5E3C] mb-4">Signups from the website subscribe form will appear here.</p>
          <Button asChild>
            <Link href="/">View Website</Link>
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#3A2A24]/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f4f6f9] text-xs uppercase tracking-wider text-[#8B5E3C]">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Subscriber</th>
                <th className="text-left px-5 py-3 font-semibold">Interest</th>
                <th className="text-left px-5 py-3 font-semibold hidden sm:table-cell">Source</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {subscriberList.map((subscriber) => (
                <tr key={subscriber.id} className="border-t border-[#3A2A24]/10 hover:bg-[#f4f6f9]/50">
                  <td className="px-5 py-4">
                    <div className="font-medium text-[#1E1714]">{subscriber.email}</div>
                    {subscriber.name && (
                      <div className="text-sm text-[#8B5E3C]">{subscriber.name}</div>
                    )}
                    {subscriber.phone && (
                      <div className="text-xs text-[#B8A89A]">{subscriber.phone}</div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <InterestBadge interest={subscriber.interest} />
                  </td>
                  <td className="px-5 py-4 text-[#8B5E3C] capitalize hidden sm:table-cell">
                    {subscriber.source || 'website'}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={subscriber.status} />
                  </td>
                  <td className="px-5 py-4 text-[#8B5E3C] text-xs">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(subscriber.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
