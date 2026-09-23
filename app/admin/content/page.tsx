export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { 
  Plus, 
  Edit2, 
  Eye, 
  FileText,
  CheckCircle,
  Clock,
  Archive
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContentDeleteButton } from './ContentDeleteButton'

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: 'bg-[#8DEBFF]/15 text-[#8DEBFF] border-[#8DEBFF]/30',
    draft: 'bg-[#53D6FF]/10 text-[#8DEBFF] border-[#53D6FF]/30',
    scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
    archived: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  const icons: Record<string, typeof CheckCircle> = {
    published: CheckCircle,
    draft: Clock,
    scheduled: Clock,
    archived: Archive,
  }
  const Icon = icons[status] || Clock
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.draft}`}>
      <Icon size={12} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    blog: 'Blog Post',
    success_story: 'Success Story',
    news: 'News',
    resource: 'Resource',
    event: 'Event',
  }
  return (
    <span className="text-xs text-[#A9B8C6] bg-[#1A232C]/10 px-2 py-1 rounded">
      {labels[type] || type || '—'}
    </span>
  )
}

type ContentSearchParams = { filter?: string; type?: string }

export default async function ContentPage({ 
  searchParams,
}: { 
  searchParams: Promise<ContentSearchParams> | ContentSearchParams
}) {
  const params = await Promise.resolve(searchParams)
  const supabase = await createClient()
  
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
  
  let query = supabase
    .from('content')
    .select('*')
    .order('updated_at', { ascending: false })
  
  if (params.filter && params.filter !== 'all') {
    query = query.eq('status', params.filter)
  }
  if (params.type && params.type !== 'all') {
    query = query.eq('type', params.type)
  }
  
  const { data: items, error } = await query
  if (error) {
    console.error('Admin content list failed:', error.message)
    throw new Error(`Could not load content: ${error.message}`)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F6FAFC]">Content Manager</h1>
          <p className="text-sm text-[#A9B8C6]">Manage blog posts, stories, and site content.</p>
        </div>
        <Button asChild>
          <Link href="/admin/content/new">
            <Plus className="w-4 h-4 mr-2" />
            New Content
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-[#151B22] rounded-xl p-4 border border-[#27313B]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#A9B8C6]">Status:</span>
          <div className="flex gap-1">
            {['all', 'published', 'draft', 'scheduled', 'archived'].map((filter) => (
              <Link
                key={filter}
                href={`/admin/content?filter=${filter}${params.type ? `&type=${params.type}` : ''}`}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  params.filter === filter || (!params.filter && filter === 'all')
                    ? 'bg-[#53D6FF] text-[#061016]'
                    : 'text-[#A9B8C6] hover:bg-[#1A232C]/10'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Link>
            ))}
          </div>
        </div>
        <div className="w-px h-6 bg-[#1A232C]/20" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#A9B8C6]">Type:</span>
          <div className="flex gap-1">
            {['all', 'blog', 'success_story', 'news', 'resource'].map((type) => (
              <Link
                key={type}
                href={`/admin/content?${params.filter ? `filter=${params.filter}&` : ''}type=${type}`}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  params.type === type || (!params.type && type === 'all')
                    ? 'bg-[#53D6FF] text-[#061016]'
                    : 'text-[#A9B8C6] hover:bg-[#1A232C]/10'
                }`}
              >
                {type === 'success_story' ? 'Stories' : type.charAt(0).toUpperCase() + type.slice(1)}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#151B22] rounded-2xl border border-[#27313B] overflow-hidden">
        {items && items.length > 0 ? (
          <table className="w-full">
            <thead className="bg-[#05070A] border-b border-[#27313B]">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#A9B8C6] uppercase tracking-wider">Title</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#A9B8C6] uppercase tracking-wider">Type</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#A9B8C6] uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#A9B8C6] uppercase tracking-wider">Updated</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-[#A9B8C6] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27313B]">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-[#1A232C]/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#53D6FF]/10 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-[#53D6FF]" />
                      </div>
                      <div>
                        <p className="font-medium text-[#F6FAFC]">{item.title}</p>
                        <p className="text-xs text-[#A9B8C6]">/{item.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <TypeBadge type={item.type} />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-[#A9B8C6]">
                    {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/content/${item.id}`}
                        className="p-2 rounded-lg hover:bg-[#1A232C]/10 text-[#A9B8C6] hover:text-[#53D6FF] transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Link>
                      {item.status === 'published' && (
                        <Link
                          href={`/blog/${item.slug}`}
                          target="_blank"
                          className="p-2 rounded-lg hover:bg-[#1A232C]/10 text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors"
                          title="View Live"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      )}
                      <ContentDeleteButton action={`/api/admin/content/${item.id}/delete`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#1A232C]/10 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-[#A9B8C6]" />
            </div>
            <h3 className="text-lg font-medium text-[#F6FAFC] mb-1">No content yet</h3>
            <p className="text-sm text-[#A9B8C6] mb-4">Get started by creating your first piece of content.</p>
            <Button asChild>
              <Link href="/admin/content/new">
                <Plus className="w-4 h-4 mr-2" />
                Create Content
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
