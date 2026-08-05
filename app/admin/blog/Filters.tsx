'use client'

interface FiltersProps {
  status: string
  category: string
  template: string
}

const categories = ['news', 'events', 'impact-stories', 'volunteer', 'donor-updates', 'resources', 'partners', 'fundraising']
const statuses = ['draft', 'published', 'archived']
const templates = ['standard', 'event', 'impact-story', 'volunteer-opp', 'donor-update', 'resource-guide', 'partner-spotlight', 'fundraising']

export function Filters({ status, category, template }: FiltersProps) {
  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams()
    if (status && status !== 'all') params.set('status', status)
    if (e.target.value !== 'all') params.set('category', e.target.value)
    window.location.href = `/admin/blog?${params.toString()}`
  }

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams()
    if (status && status !== 'all') params.set('status', status)
    if (category && category !== 'all') params.set('category', category)
    if (e.target.value !== 'all') params.set('template', e.target.value)
    window.location.href = `/admin/blog?${params.toString()}`
  }

  return (
    <div className="flex flex-wrap items-center gap-3 bg-[#151B22] rounded-xl p-4 border border-[#27313B]">
      {/* Status Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[#A9B8C6]">Status:</span>
        <div className="flex gap-1">
          {['all', ...statuses].map((s) => {
            const isActive = status === s || (!status && s === 'all')
            const href = `/admin/blog?${new URLSearchParams({
              ...(template && template !== 'all' ? { template } : {}),
              ...(category && category !== 'all' ? { category } : {}),
              ...(s !== 'all' ? { status: s } : {}),
            }).toString()}`
            
            return (
              <a
                key={s}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-[#53D6FF] text-[#061016]'
                    : 'text-[#A9B8C6] hover:bg-[#1A232C]/10'
                }`}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </a>
            )
          })}
        </div>
      </div>

      <div className="w-px h-6 bg-[#1A232C]/20" />

      {/* Template Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[#A9B8C6]">Type:</span>
        <select
          className="text-sm border border-[#27313B] rounded-lg px-3 py-1.5 bg-[#151B22] focus:outline-none focus:border-[#53D6FF]"
          value={template || 'all'}
          onChange={handleTemplateChange}
        >
          <option value="all">All Types</option>
          {templates.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1).replace('-', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="w-px h-6 bg-[#1A232C]/20" />

      {/* Category Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[#A9B8C6]">Category:</span>
        <select
          className="text-sm border border-[#27313B] rounded-lg px-3 py-1.5 bg-[#151B22] focus:outline-none focus:border-[#53D6FF]"
          value={category || 'all'}
          onChange={handleCategoryChange}
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
