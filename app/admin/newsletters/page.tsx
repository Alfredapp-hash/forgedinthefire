export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { 
  Mail, 
  Calendar, 
  ChevronRight, 
  Plus,
  Edit,
  Send,
  Clock,
  CheckCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Newsletter } from '@/src/features/subscribers/types'
import { getEmailConfigStatus } from '@/src/lib/email/service'

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-[#53D6FF]/10 text-[#8DEBFF] border-[#53D6FF]/30',
    scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
    sent: 'bg-[#8DEBFF]/15 text-[#8DEBFF] border-[#8DEBFF]/30',
  }
  
  const icons = {
    draft: Edit,
    scheduled: Clock,
    sent: CheckCircle,
  }
  
  const Icon = icons[status as keyof typeof icons] || Edit
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.draft}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  )
}

function MonthName({ month }: { month: number }) {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  return <span>{names[month - 1] || 'Unknown'}</span>
}

export default async function NewslettersPage() {
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
  
  const emailConfig = getEmailConfigStatus()
  
  const { data: newsletters } = await supabase
    .from('newsletters')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
  
  const newsletterList = (newsletters as unknown as Newsletter[]) || []
  
  const draftCount = newsletterList.filter(n => n.status === 'draft').length
  const scheduledCount = newsletterList.filter(n => n.status === 'scheduled').length
  const sentCount = newsletterList.filter(n => n.status === 'sent').length
  
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#F6FAFC] mb-2">Monthly Newsletters</h1>
          <p className="text-[#A9B8C6]">
            Create and send monthly updates using selected blog posts, community news, volunteer opportunities, and survivor support resources.
          </p>
        </div>
        <Button asChild >
          <Link href="/admin/newsletters/new">
            <Plus className="w-4 h-4 mr-2" />
            Create Newsletter
          </Link>
        </Button>
      </div>
      
      {/* Email Config Warning */}
      {!emailConfig.configured && (
        <div className="bg-[#53D6FF]/10 border border-[#53D6FF]/30 rounded-xl p-4 flex items-start gap-3">
          <Mail className="w-5 h-5 text-[#8DEBFF] mt-0.5" />
          <div>
            <p className="font-medium text-[#8DEBFF]">Email delivery not configured</p>
            <p className="text-sm text-[#8DEBFF] mt-1">
              Newsletter drafts will work, but you cannot send emails until an email provider is configured. 
              Add RESEND_API_KEY or other provider credentials to your environment variables.
            </p>
          </div>
        </div>
      )}
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Total Newsletters</p>
          <p className="text-3xl font-bold text-[#F6FAFC]">{newsletterList.length}</p>
          <div className="flex items-center gap-1 mt-1">
            <Mail className="w-4 h-4 text-[#53D6FF]" />
            <p className="text-xs text-[#53D6FF]">All time</p>
          </div>
        </div>
        
        <div className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Drafts</p>
          <p className="text-3xl font-bold text-[#8DEBFF]">{draftCount}</p>
          <p className="text-xs text-[#8DEBFF]/70 mt-1">Ready to send</p>
        </div>
        
        <div className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Scheduled</p>
          <p className="text-3xl font-bold text-blue-600">{scheduledCount}</p>
          <p className="text-xs text-blue-600/70 mt-1">Pending send</p>
        </div>
        
        <div className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Sent</p>
          <p className="text-3xl font-bold text-[#8DEBFF]">{sentCount}</p>
          <p className="text-xs text-[#8DEBFF]/70 mt-1">Delivered</p>
        </div>
      </div>
      
      {/* Newsletters List */}
      <div>
        <h2 className="text-lg font-bold text-[#F6FAFC] mb-4">All Newsletters</h2>
        
        {newsletterList.length === 0 ? (
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-16 text-center">
            <Mail size={48} className="mx-auto mb-4 text-[#A9B8C6]/40" />
            <p className="font-semibold text-[#F6FAFC] mb-1 text-lg">No newsletters yet</p>
            <p className="text-sm text-[#A9B8C6] mb-4">
              Create your first monthly newsletter to keep subscribers engaged.
            </p>
            <Button asChild >
              <Link href="/admin/newsletters/new">
                <Plus className="w-4 h-4 mr-2" />
                Create First Newsletter
              </Link>
            </Button>
          </div>
        ) : (
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#05070A] text-xs uppercase tracking-wider text-[#A9B8C6]">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Newsletter</th>
                  <th className="text-left px-5 py-3 font-semibold">Month</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                  <th className="text-left px-5 py-3 font-semibold">Recipients</th>
                  <th className="text-left px-5 py-3 font-semibold hidden sm:table-cell">Created</th>
                  <th className="text-right px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {newsletterList.map((newsletter) => (
                  <tr key={newsletter.id} className="border-t border-[#27313B] hover:bg-[#1A232C]/50">
                    <td className="px-5 py-4">
                      <Link 
                        href={`/admin/newsletters/${newsletter.id}`}
                        className="font-medium text-[#F6FAFC] hover:text-[#53D6FF] transition-colors"
                      >
                        {newsletter.title}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-[#A9B8C6]">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <MonthName month={newsletter.month} />
                        <span>{newsletter.year}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={newsletter.status} />
                    </td>
                    <td className="px-5 py-4 text-[#F6FAFC]">
                      {newsletter.status === 'sent' 
                        ? `${newsletter.recipient_count || 0} sent`
                        : '-'
                      }
                    </td>
                    <td className="px-5 py-4 text-[#A9B8C6] text-xs hidden sm:table-cell">
                      {new Date(newsletter.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/admin/newsletters/${newsletter.id}`}
                        className="inline-flex items-center gap-1 text-[#53D6FF] hover:text-[#53D6FF] font-medium text-sm transition-colors"
                      >
                        {newsletter.status === 'draft' ? (
                          <>
                            <Edit className="w-4 h-4" /> Edit
                          </>
                        ) : newsletter.status === 'scheduled' ? (
                          <>
                            <Clock className="w-4 h-4" /> View
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" /> View
                          </>
                        )}
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Quick Tips */}
      <div className="bg-[#05070A] rounded-2xl p-6 border border-[#27313B]">
        <h3 className="text-lg font-bold text-[#8DEBFF] mb-4">Creating Effective Newsletters</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[#53D6FF] shrink-0 mt-0.5" />
            <p className="text-[#B8C4CF]">
              Select 3-5 blog posts that represent the month's key updates and impact stories.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[#53D6FF] shrink-0 mt-0.5" />
            <p className="text-[#B8C4CF]">
              Write a warm, personal intro message that connects readers to your mission.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[#53D6FF] shrink-0 mt-0.5" />
            <p className="text-[#B8C4CF]">
              Mark important posts as "Featured in Newsletter" to highlight them prominently.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[#53D6FF] shrink-0 mt-0.5" />
            <p className="text-[#B8C4CF]">
              Always test send to yourself before sending to all subscribers.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
