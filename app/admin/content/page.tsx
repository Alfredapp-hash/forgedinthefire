export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { 
  Plus, 
  Search, 
  Edit2, 
  Eye, 
  Trash2,
  FileText,
  CheckCircle,
  Clock,
  Archive
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const TEAL = '#1E6B73'
const GOLD = '#C8A46B'

function StatusBadge({ status }: { status: string }) {
  const styles = {
    published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    draft: 'bg-amber-100 text-amber-700 border-amber-200',
    archived: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  const icons = {
    published: CheckCircle,
    draft: Clock,
    archived: Archive,
  }
  const Icon = icons[status as keyof typeof icons] || Clock
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles] || styles.draft}`}>
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
    <span className="text-xs text-[#8B5E3C] bg-[#3A2A24]/10 px-2 py-1 rounded">
      {labels[type] || type}
    </span>
  )
}

export default async function ContentPage({ 
  searchParams 
}: { 
  searchParams: { filter?: string; type?: string } 
}) {
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
  
  let query = supabase
    .from('content')
    .select('*')
    .order('updated_at', { ascending: false })
  
  if (searchParams.filter && searchParams.filter !== 'all') {
    query = query.eq('status', searchParams.filter)
  }
  if (searchParams.type && searchParams.type !== 'all') {
    query = query.eq('type', searchParams.type)
  }
  
  const { data: items } = await query

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E1714]">Content Manager</h1>
          <p className="text-sm text-[#8B5E3C]">Manage blog posts, stories, and site content.</p>
        </div>
        <Button asChild >
          <Link href="/admin/content/new">
            <Plus className="w-4 h-4 mr-2" />
            New Content
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl p-4 border border-[#3A2A24]/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#8B5E3C]">Status:</span>
          <div className="flex gap-1">
            {['all', 'published', 'draft', 'archived'].map((filter) => (
              <Link
                key={filter}
                href={`/admin/content?filter=${filter}${searchParams.type ? `&type=${searchParams.type}` : ''}`}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  searchParams.filter === filter || (!searchParams.filter && filter === 'all')
                    ? 'bg-[#1E6B73] text-white'
                    : 'text-[#8B5E3C] hover:bg-[#3A2A24]/10'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Link>
            ))}
          </div>
        </div>
        <div className="w-px h-6 bg-[#3A2A24]/20" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#8B5E3C]">Type:</span>
          <div className="flex gap-1">
            {['all', 'blog', 'success_story', 'news', 'resource'].map((type) => (
              <Link
                key={type}
                href={`/admin/content?${searchParams.filter ? `filter=${searchParams.filter}&` : ''}type=${type}`}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  searchParams.type === type || (!searchParams.type && type === 'all')
                    ? 'bg-[#C8A46B] text-white'
                    : 'text-[#8B5E3C] hover:bg-[#3A2A24]/10'
                }`}
              >
                {type === 'success_story' ? 'Stories' : type.charAt(0).toUpperCase() + type.slice(1)}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Content List */}
      <div className="bg-white rounded-2xl border border-[#3A2A24]/20 overflow-hidden">
        {items && items.length > 0 ? (
          <table className="w-full">
            <thead className="bg-[#f4f6f9] border-b border-[#3A2A24]/10">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#8B5E3C] uppercase tracking-wider">Title</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#8B5E3C] uppercase tracking-wider">Type</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#8B5E3C] uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#8B5E3C] uppercase tracking-wider">Updated</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-[#8B5E3C] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3A2A24]/10">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-[#f4f6f9]/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#1E6B73]/10 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-[#1E6B73]" />
                      </div>
                      <div>
                        <p className="font-medium text-[#1E1714]">{item.title}</p>
                        <p className="text-xs text-[#8B5E3C]">/{item.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <TypeBadge type={item.type} />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-[#8B5E3C]">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/content/${item.id}`}
                        className="p-2 rounded-lg hover:bg-[#3A2A24]/10 text-[#8B5E3C] hover:text-[#1E6B73] transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Link>
                      {item.status === 'published' && (
                        <Link
                          href={`/blog/${item.slug}`}
                          target="_blank"
                          className="p-2 rounded-lg hover:bg-[#3A2A24]/10 text-[#8B5E3C] hover:text-[#C8A46B] transition-colors"
                          title="View Live"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      )}
                      <form action={`/api/admin/content/${item.id}/delete`} method="POST" className="inline">
                        <button
                          type="submit"
                          className="p-2 rounded-lg hover:bg-red-50 text-[#8B5E3C] hover:text-red-600 transition-colors"
                          title="Delete"
                          onClick={(e) => confirm('Are you sure you want to delete this content?') ? null : e.preventDefault()}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#3A2A24]/10 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-[#8B5E3C]" />
            </div>
            <h3 className="text-lg font-medium text-[#1E1714] mb-1">No content yet</h3>
            <p className="text-sm text-[#8B5E3C] mb-4">Get started by creating your first piece of content.</p>
            <Button asChild >
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
