export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  FileText,
  PenSquare,
  Search,
  ChevronRight,
  ArrowRight,
  AlertCircle,
  CheckCircle,
  BarChart3,
  Megaphone,
  Users,
  Mail,
  Mic2,
} from 'lucide-react'
import { loadSEOAuditReport, getSEOSummaryFromAuditReport, getMockSEOSummary } from '@/src/lib/seo/audit-report-server'

const GOLD = '#8DEBFF'
const TEAL = '#53D6FF'

function StatCard({
  label, value, sub, href, accent, alert,
}: { label: string; value: string | number; sub?: string; href: string; accent: string; alert?: boolean }) {
  return (
    <Link href={href} className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B] shadow-forge-sm hover:shadow-forge-sm transition-all group relative overflow-hidden">
      {alert && <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#8DEBFF]/15 ring-2 ring-white" />}
      <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">{label}</p>
      <p className="text-3xl font-bold mb-1" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-xs text-[#A9B8C6]">{sub}</p>}
      <ChevronRight size={14} className="absolute bottom-4 right-4 text-[#A9B8C6]/30 group-hover:text-[#A9B8C6]" />
    </Link>
  )
}

function SEOHealthBar({
  green, yellow, red, total, score, isLiveCrawl, lastUpdated,
}: { green: number; yellow: number; red: number; total: number; score: number; isLiveCrawl: boolean; lastUpdated?: string }) {
  const scoreColor = score >= 90 ? '#53D6FF' : score >= 70 ? '#8DEBFF' : '#8DEBFF'
  return (
    <Link href="/admin/seo" className="bg-[#151B22] rounded-2xl border border-[#27313B] shadow-forge-sm hover:shadow-forge-sm p-5 block group">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Search size={18} className="text-[#53D6FF]" />
          <div>
            <p className="text-sm font-bold text-[#F6FAFC]">SEO Health Center</p>
            <p className="text-xs text-[#A9B8C6]">{isLiveCrawl ? 'Live crawl report' : 'Run npm run seo:crawl for live data'}</p>
          </div>
        </div>
        <p className="text-2xl font-bold" style={{ color: scoreColor }}>{score}</p>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-2">
        {green > 0 && <div className="bg-[#8DEBFF]/15 rounded-full" style={{ width: `${(green / total) * 100}%` }} />}
        {yellow > 0 && <div className="bg-[#53D6FF]/10 rounded-full" style={{ width: `${(yellow / total) * 100}%` }} />}
        {red > 0 && <div className="bg-[#8DEBFF]/15 rounded-full" style={{ width: `${(red / total) * 100}%` }} />}
      </div>
      <p className="text-xs text-[#A9B8C6]">
        {green} green · {yellow} yellow · {red} red
        {isLiveCrawl && lastUpdated ? ` · ${new Date(lastUpdated).toLocaleDateString()}` : ''}
      </p>
    </Link>
  )
}

export default async function AdminPage() {
  const supabase = await createClient()

  if (!supabase) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="bg-[#53D6FF]/10 border border-[#53D6FF]/30 rounded-lg p-6">
          <h2 className="text-[#8DEBFF] font-medium mb-2">Database Not Connected</h2>
          <p className="text-[#8DEBFF]/80 text-sm">Supabase environment variables are missing.</p>
        </div>
      </div>
    )
  }

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const [
    { count: blogCount },
    { count: publishedCount },
    { count: draftCount },
    { count: subCount },
    { count: newSubs },
    { count: careerDraft },
  ] = await Promise.all([
    supabase.from('content').select('*', { count: 'exact', head: true }),
    supabase.from('content').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('content').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('newsletter_subscribers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('newsletter_subscribers').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    supabase.from('job_positions').select('*', { count: 'exact', head: true }).eq('active', false),
  ])

  const seoLoaded = await loadSEOAuditReport()
  const seoSummary = seoLoaded ? getSEOSummaryFromAuditReport(seoLoaded.report) : getMockSEOSummary()
  const seoTotal = seoLoaded ? seoLoaded.report.crawled : seoSummary.greenCount + seoSummary.yellowCount + seoSummary.redCount

  const attention: { label: string; href: string }[] = []
  if ((draftCount ?? 0) > 0) attention.push({ label: `${draftCount} draft blog posts`, href: '/admin/blog' })
  if ((careerDraft ?? 0) > 0) attention.push({ label: `${careerDraft} inactive career listings`, href: '/admin/careers' })
  if (seoSummary.redCount > 0) attention.push({ label: `${seoSummary.redCount} SEO red issues`, href: '/admin/seo' })

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[#F6FAFC] mb-2">Admin Dashboard</h1>
        <p className="text-[#A9B8C6]">Content, SEO, analytics, and outreach for Forged in the Fire.</p>
      </div>

      {attention.length > 0 && (
        <div className="bg-[#53D6FF]/10 border border-[#53D6FF]/30 rounded-2xl p-5">
          <h2 className="font-semibold text-[#8DEBFF] mb-3 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Attention Inbox</h2>
          <ul className="space-y-2">
            {attention.map((a) => (
              <li key={a.label}><Link href={a.href} className="text-sm text-[#8DEBFF] hover:underline">{a.label} →</Link></li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Blog Posts" value={blogCount ?? 0} sub="Total posts" href="/admin/blog" accent={TEAL} />
        <StatCard label="Published" value={publishedCount ?? 0} sub="Live on site" href="/admin/content?filter=published" accent="#53D6FF" />
        <StatCard label="Drafts" value={draftCount ?? 0} sub="Awaiting publication" href="/admin/blog" accent={GOLD} alert={(draftCount ?? 0) > 0} />
        <StatCard label="Subscribers" value={subCount ?? 0} sub={`+${newSubs ?? 0} this week`} href="/admin/subscribers" accent="#53D6FF" />
      </div>

      <SEOHealthBar
        green={seoSummary.greenCount}
        yellow={seoSummary.yellowCount}
        red={seoSummary.redCount}
        total={seoTotal}
        score={seoSummary.overallHealth}
        isLiveCrawl={seoLoaded != null}
        lastUpdated={seoLoaded?.fileModifiedAt}
      />

      <div>
        <h2 className="text-lg font-bold text-[#F6FAFC] mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/studio" className="px-4 py-2 rounded-xl border-2 border-[#53D6FF] text-[#53D6FF] text-sm font-bold hover:bg-[#53D6FF]/5">Studio</Link>
          <Link href="/admin/blog/new" className="px-4 py-2 rounded-xl border-2 border-[#53D6FF] text-[#53D6FF] text-sm font-bold hover:bg-[#53D6FF]/5">New Blog Post</Link>
          <Link href="/admin/podcast" className="px-4 py-2 rounded-xl border-2 border-[#53D6FF] text-[#53D6FF] text-sm font-bold hover:bg-[#53D6FF]/5">Podcast</Link>
          <Link href="/admin/seo" className="px-4 py-2 rounded-xl border-2 border-[#8DEBFF] text-[#8DEBFF] text-sm font-bold hover:bg-[#53D6FF]/5">SEO Center</Link>
          <Link href="/admin/social" className="px-4 py-2 rounded-xl border-2 border-[#53D6FF] text-[#53D6FF] text-sm font-bold hover:bg-[#53D6FF]/5">Social Publisher</Link>
          <Link href="/admin/newsletters" className="px-4 py-2 rounded-xl border-2 border-[#27313B] text-[#A9B8C6] text-sm font-bold hover:bg-[#1A232C]/5">Newsletters</Link>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-[#F6FAFC] mb-4">Management Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: 'Content Studio', description: 'Biweekly topic calendar that drives Blog, Podcast, and Social.', href: '/admin/studio', icon: PenSquare, accent: TEAL },
            { label: 'Blog', description: 'Block editor, media library, autosave, and publishing checklist.', href: '/admin/blog', icon: FileText, accent: TEAL },
            { label: 'Podcast Console', description: 'Enterprise episode pipeline, RSS, private feeds, and analytics.', href: '/admin/podcast', icon: Mic2, accent: '#53D6FF' },
            { label: 'Social Publisher', description: 'Promote posts to Facebook, Instagram, TikTok, and LinkedIn.', href: '/admin/social', icon: Megaphone, accent: '#53D6FF' },
            { label: 'Analytics', description: 'Subscriber growth and GA4 traffic summary.', href: '/admin/analytics', icon: BarChart3, accent: GOLD },
            { label: 'Admin Users', description: 'Invite team members to the admin portal.', href: '/admin/users', icon: Users, accent: '#A9B8C6' },
          ].map((t) => (
            <Link key={t.href} href={t.href} className="bg-[#151B22] rounded-2xl border p-5 hover:shadow-forge-sm flex items-start gap-4 group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: t.accent }}>
                <t.icon size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm group-hover:text-[#53D6FF]">{t.label}</p>
                <p className="text-xs text-[#A9B8C6]">{t.description}</p>
              </div>
              <ArrowRight size={14} className="text-[#A9B8C6]/30 mt-1" />
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-[#05070A] rounded-2xl p-6 border border-[#27313B]">
        <h3 className="text-lg font-bold text-[#8DEBFF] mb-4">Quick Tips</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[#53D6FF] shrink-0 mt-0.5" />
            <p className="text-sm text-[#B8C4CF]">Run <code className="text-gold">npm run seo:crawl</code> after deploys to refresh SEO scores.</p>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-[#53D6FF] shrink-0 mt-0.5" />
            <p className="text-sm text-[#B8C4CF]">Enable blog notifications on publish to alert subscribers automatically.</p>
          </div>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#8DEBFF] shrink-0 mt-0.5" />
            <p className="text-sm text-[#B8C4CF]">Always confirm survivor consent before publishing impact stories.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
