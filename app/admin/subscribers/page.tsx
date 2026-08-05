export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Mail, Download, Users, Calendar, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Subscriber, SubscriptionInterest } from '@/src/features/subscribers/types'
import { getInterestLabel } from '@/src/features/subscribers/types'

const TEAL = '#53D6FF'
const GOLD = '#8DEBFF'

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-[#8DEBFF]/15 text-[#8DEBFF] border-[#8DEBFF]/30',
    unsubscribed: 'bg-gray-100 text-gray-600 border-gray-200',
    bounced: 'bg-[#8DEBFF]/15 text-[#8DEBFF] border-[#8DEBFF]/35',
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
    'donor-updates': 'bg-[#53D6FF]/10 text-[#8DEBFF] border-[#53D6FF]/30',
    'community-events': 'bg-[#8DEBFF]/10 text-[#8DEBFF] border-[#8DEBFF]/30',
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
        <div className="bg-[#53D6FF]/10 border border-[#53D6FF]/30 rounded-lg p-6">
          <h2 className="text-[#8DEBFF] font-medium mb-2">Database Not Connected</h2>
          <p className="text-[#8DEBFF]/80 text-sm">
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
        <h1 className="text-3xl font-bold text-[#F6FAFC] mb-2">Subscribers</h1>
        <p className="text-[#A9B8C6]">Manage newsletter subscribers and view engagement stats.</p>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Total Subscribers</p>
          <p className="text-3xl font-bold text-[#F6FAFC]">{subscriberList.length}</p>
          <div className="flex items-center gap-1 mt-1">
            <Users className="w-4 h-4 text-[#53D6FF]" />
            <p className="text-xs text-[#53D6FF]">All time</p>
          </div>
        </div>
        
        <div className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Active</p>
          <p className="text-3xl font-bold text-[#8DEBFF]">{activeCount}</p>
          <p className="text-xs text-[#8DEBFF]/70 mt-1">Currently receiving updates</p>
        </div>
        
        <div className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Unsubscribed</p>
          <p className="text-3xl font-bold text-gray-500">{unsubscribedCount}</p>
          <p className="text-xs text-gray-400 mt-1">Opted out</p>
        </div>
        
        <div className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Bounced</p>
          <p className="text-3xl font-bold text-[#8DEBFF]">{bouncedCount}</p>
          <p className="text-xs text-[#8DEBFF] mt-1">Invalid emails</p>
        </div>
      </div>
      
      {/* Interest Breakdown */}
      {Object.keys(interestCounts).length > 0 && (
        <div className="bg-[#151B22] rounded-2xl p-6 border border-[#27313B]">
          <h2 className="text-lg font-bold text-[#F6FAFC] mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#A9B8C6]" />
            Interest Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(interestCounts).map(([interest, count]) => (
              <div key={interest} className="flex items-center gap-2 bg-[#05070A] rounded-lg px-3 py-2">
                <InterestBadge interest={interest as SubscriptionInterest} />
                <span className="text-sm font-medium text-[#F6FAFC]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#F6FAFC]">Subscriber List</h2>
        {subscriberList.length > 0 && (
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`}
            download="forged-in-the-fire-subscribers.csv"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm border border-[#27313B] text-[#A9B8C6] hover:bg-[#1A232C] transition-colors"
          >
            <Download size={16} /> Export CSV
          </a>
        )}
      </div>
      
      {/* Subscribers Table */}
      {subscriberList.length === 0 ? (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-16 text-center">
          <Mail size={48} className="mx-auto mb-4 text-[#A9B8C6]/40" />
          <p className="font-semibold text-[#F6FAFC] mb-1 text-lg">No subscribers yet</p>
          <p className="text-sm text-[#A9B8C6] mb-4">Signups from the website subscribe form will appear here.</p>
          <Button asChild>
            <Link href="/">View Website</Link>
          </Button>
        </div>
      ) : (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#05070A] text-xs uppercase tracking-wider text-[#A9B8C6]">
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
                <tr key={subscriber.id} className="border-t border-[#27313B] hover:bg-[#1A232C]/50">
                  <td className="px-5 py-4">
                    <div className="font-medium text-[#F6FAFC]">{subscriber.email}</div>
                    {subscriber.name && (
                      <div className="text-sm text-[#A9B8C6]">{subscriber.name}</div>
                    )}
                    {subscriber.phone && (
                      <div className="text-xs text-[#A9B8C6]">{subscriber.phone}</div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <InterestBadge interest={subscriber.interest} />
                  </td>
                  <td className="px-5 py-4 text-[#A9B8C6] capitalize hidden sm:table-cell">
                    {subscriber.source || 'website'}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={subscriber.status} />
                  </td>
                  <td className="px-5 py-4 text-[#A9B8C6] text-xs">
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
