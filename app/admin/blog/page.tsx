export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { 
  Plus, 
  Search, 
  FileText,
  CheckCircle,
  Clock,
  Archive,
  Star,
  TrendingUp,
  Loader2,
  Filter,
  LayoutGrid,
  Eye,
  PenSquare
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ContentStatus, PostTemplate, ContentCategory } from '@/src/features/content/types'
import { PostActions } from './PostActions'
import { Filters } from './Filters'

const TEAL = '#53D6FF'
const GOLD = '#8DEBFF'

function StatusBadge({ status }: { status: ContentStatus }) {
  const styles: Record<ContentStatus, string> = {
    published: 'bg-[#8DEBFF]/15 text-[#8DEBFF] border-[#8DEBFF]/30',
    draft: 'bg-[#53D6FF]/10 text-[#8DEBFF] border-[#53D6FF]/30',
    scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
    archived: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  const icons: Record<ContentStatus, typeof CheckCircle> = {
    published: CheckCircle,
    draft: Clock,
    scheduled: Clock,
    archived: Archive,
  }
  const Icon = icons[status]
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
      <Icon size={12} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function TemplateBadge({ template }: { template: PostTemplate }) {
  const labels: Record<PostTemplate, string> = {
    standard: 'Standard',
    event: 'Event',
    'impact-story': 'Impact Story',
    'volunteer-opp': 'Volunteer',
    'donor-update': 'Donor Update',
    'resource-guide': 'Resource',
    'partner-spotlight': 'Partner',
    fundraising: 'Fundraising',
  }
  return (
    <span className="text-xs text-[#A9B8C6] bg-[#1A232C]/10 px-2 py-1 rounded">
      {labels[template] || template}
    </span>
  )
}

function CategoryBadge({ category }: { category: ContentCategory }) {
  const labels: Record<ContentCategory, string> = {
    news: 'News',
    events: 'Events',
    'impact-stories': 'Impact',
    volunteer: 'Volunteer',
    'donor-updates': 'Donor',
    resources: 'Resources',
    partners: 'Partners',
    fundraising: 'Fundraising',
  }
  return (
    <span className="text-xs text-[#53D6FF] bg-[#53D6FF]/10 px-2 py-1 rounded">
      {labels[category] || category}
    </span>
  )
}

// Stat Card Component
function StatCard({ 
  label, 
  value, 
  sub, 
  href, 
  accent, 
  icon: Icon,
  alert 
}: { 
  label: string; 
  value: string | number; 
  sub?: string; 
  href: string; 
  accent: string; 
  icon: React.ElementType;
  alert?: boolean 
}) {
  return (
    <Link
      href={href}
      className="bg-[#151B22] rounded-xl p-5 border border-[#27313B] shadow-forge-sm hover:shadow-forge-sm transition-all group relative overflow-hidden"
    >
      {alert && (
        <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#8DEBFF]/15 ring-2 ring-white" />
      )}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">{label}</p>
          <p className="text-3xl font-bold mb-1" style={{ color: accent }}>{value}</p>
          {sub && <p className="text-xs text-[#A9B8C6]">{sub}</p>}
        </div>
        <div 
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accent}15` }}
        >
          <Icon className="w-5 h-5" style={{ color: accent }} />
        </div>
      </div>
    </Link>
  )
}

export default async function BlogPage({ 
  searchParams 
}: { 
  searchParams: { 
    status?: ContentStatus | 'all'
    template?: PostTemplate | 'all'
    category?: ContentCategory | 'all'
    search?: string
  } 
}) {
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
  
  // Fetch stats
  const { count: totalCount } = await supabase
    .from('content')
    .select('*', { count: 'exact', head: true })
  
  const { count: publishedCount } = await supabase
    .from('content')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
  
  const { count: draftCount } = await supabase
    .from('content')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'draft')
  
  const { count: featuredCount } = await supabase
    .from('content')
    .select('*', { count: 'exact', head: true })
    .eq('featured', true)
  
  // Build query
  let query = supabase
    .from('content')
    .select('*')
    .order('updated_at', { ascending: false })
  
  // Apply filters
  if (searchParams.status && searchParams.status !== 'all') {
    query = query.eq('status', searchParams.status)
  }
  if (searchParams.template && searchParams.template !== 'all') {
    query = query.eq('template', searchParams.template)
  }
  if (searchParams.category && searchParams.category !== 'all') {
    query = query.eq('category', searchParams.category)
  }
  if (searchParams.search) {
    query = query.or(`title.ilike.%${searchParams.search}%,excerpt.ilike.%${searchParams.search}%,slug.ilike.%${searchParams.search}%`)
  }
  
  const { data: items } = await query

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F6FAFC]">Blog production board</h1>
          <p className="text-sm text-[#A9B8C6]">
            Drafting, scheduled, and published posts. Start a biweekly package from{' '}
            <Link href="/admin/studio" className="text-[#8DEBFF] hover:underline">Content Studio</Link>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/studio">Studio</Link>
          </Button>
          <Button asChild >
            <Link href="/admin/blog/new">
              <Plus className="w-4 h-4 mr-2" />
              New Post
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Posts"
          value={totalCount ?? 0}
          sub="All content"
          href="/admin/blog"
          accent={TEAL}
          icon={LayoutGrid}
        />
        <StatCard
          label="Published"
          value={publishedCount ?? 0}
          sub="Live on site"
          href="/admin/blog?status=published"
          accent="#53D6FF"
          icon={Eye}
        />
        <StatCard
          label="Drafts"
          value={draftCount ?? 0}
          sub="Awaiting publication"
          href="/admin/blog?status=draft"
          accent={GOLD}
          icon={PenSquare}
          alert={draftCount ? draftCount > 0 : false}
        />
        <StatCard
          label="Featured"
          value={featuredCount ?? 0}
          sub="Highlighted posts"
          href="/admin/blog"
          accent="#8DEBFF"
          icon={Star}
        />
      </div>

      {/* Search and Filters */}
      <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-4 space-y-4">
        {/* Search Bar */}
        <form className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A9B8C6]" />
          <input
            type="search"
            name="search"
            defaultValue={searchParams.search || ''}
            placeholder="Search posts by title, excerpt, or URL..."
            className="w-full pl-10 pr-4 py-2 border border-[#27313B] rounded-lg text-[#F6FAFC] placeholder-[#A9B8C6] focus:outline-none focus:border-[#53D6FF] transition-colors"
          />
          <Button 
            type="submit" 
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#53D6FF] hover:bg-[#82E8FF]"
          >
            Search
          </Button>
        </form>

        <div className="border-t border-[#27313B] pt-4">
          <Filters 
            status={searchParams.status || 'all'}
            category={searchParams.category || 'all'}
            template={searchParams.template || 'all'}
          />
        </div>
      </div>

      {/* Results Count */}
      {items && items.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#A9B8C6]">
            Showing <span className="font-medium text-[#F6FAFC]">{items.length}</span> post{items.length !== 1 ? 's' : ''}
            {searchParams.search && (
              <span> for &quot;<span className="font-medium">{searchParams.search}</span>&quot;</span>
            )}
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-3">
        {(['draft', 'scheduled', 'published', 'archived'] as ContentStatus[]).map((column) => {
          const columnItems = (items ?? []).filter((item) => item.status === column)
          const labels: Record<ContentStatus, string> = {
            draft: 'Drafting',
            scheduled: 'Scheduled',
            published: 'Published',
            archived: 'Archived',
          }
          return (
            <div key={column} className="rounded-2xl border border-[#27313B] bg-[#151B22] p-3 min-h-[180px]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mb-3">
                {labels[column]} · {columnItems.length}
              </p>
              <div className="space-y-2">
                {columnItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/admin/blog/${item.id}`}
                    className="block rounded-lg border border-[#27313B] bg-[#05070A] p-3 hover:border-[#53D6FF]"
                  >
                    <p className="text-sm text-[#F6FAFC] leading-snug">{item.title}</p>
                    <p className="text-[11px] text-[#A9B8C6] mt-1">/{item.slug}</p>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Content List */}
      <div className="bg-[#151B22] rounded-2xl border border-[#27313B] overflow-hidden">
        {items && items.length > 0 ? (
          <table className="w-full">
            <thead className="bg-[#05070A] border-b border-[#27313B]">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#A9B8C6] uppercase tracking-wider">Post</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#A9B8C6] uppercase tracking-wider">Type</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#A9B8C6] uppercase tracking-wider">Category</th>
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
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-[#F6FAFC]">{item.title}</p>
                          {item.featured && (
                            <Star className="w-4 h-4 text-[#8DEBFF] fill-[#8DEBFF]" />
                          )}
                        </div>
                        <p className="text-xs text-[#A9B8C6]">/{item.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <TemplateBadge template={item.template} />
                  </td>
                  <td className="px-6 py-4">
                    <CategoryBadge category={item.category} />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-[#A9B8C6]">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <PostActions 
                      postId={item.id} 
                      slug={item.slug} 
                      status={item.status} 
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#1A232C]/10 flex items-center justify-center mx-auto mb-5">
              {searchParams.search ? (
                <Search className="w-10 h-10 text-[#A9B8C6]" />
              ) : (
                <FileText className="w-10 h-10 text-[#A9B8C6]" />
              )}
            </div>
            <h3 className="text-lg font-medium text-[#F6FAFC] mb-2">
              {searchParams.search ? 'No posts found' : 'No posts yet'}
            </h3>
            <p className="text-sm text-[#A9B8C6] mb-5 max-w-md mx-auto">
              {searchParams.search 
                ? `We couldn't find any posts matching "${searchParams.search}". Try a different search term.`
                : 'Create your first blog post to share survivor stories, events, and updates with your community.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              {searchParams.search ? (
                <Button asChild variant="outline">
                  <Link href="/admin/blog">Clear Search</Link>
                </Button>
              ) : null}
              <Button asChild >
                <Link href="/admin/blog/new">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Post
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
