export const dynamic = 'force-dynamic'

export default function SimpleAdminPage() {
  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold text-[#F6FAFC] mb-2">Simple Admin Dashboard</h1>
      <p className="text-[#A9B8C6]">This page doesn't fetch any data.</p>
      
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <a href="/admin/content" className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B] shadow-forge-sm hover:shadow-forge-sm transition-all">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Content</p>
          <p className="text-lg font-bold text-[#F6FAFC]">Manage Content</p>
        </a>
        <a href="/admin/blog" className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B] shadow-forge-sm hover:shadow-forge-sm transition-all">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Blog</p>
          <p className="text-lg font-bold text-[#F6FAFC]">Blog Studio</p>
        </a>
        <a href="/admin/careers" className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B] shadow-forge-sm hover:shadow-forge-sm transition-all">
          <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">Careers</p>
          <p className="text-lg font-bold text-[#F6FAFC]">Job Positions</p>
        </a>
      </div>
    </div>
  )
}
