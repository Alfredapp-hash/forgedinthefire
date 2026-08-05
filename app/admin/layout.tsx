export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

function normalizeEmail(email: string | undefined): string {
  return (email || '').trim().toLowerCase()
}

import {
  LayoutDashboard,
  FileText,
  PenSquare,
  Search,
  Settings,
  Users,
  Mail,
  LogOut,
  ExternalLink,
  BarChart3,
  Megaphone,
  UserCog,
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Content', href: '/admin/content', icon: FileText },
  { label: 'Blog Studio', href: '/admin/blog', icon: PenSquare },
  { label: 'Careers', href: '/admin/careers', icon: ExternalLink },
  { label: 'Subscribers', href: '/admin/subscribers', icon: Users },
  { label: 'Newsletters', href: '/admin/newsletters', icon: Mail },
  { label: 'Social', href: '/admin/social', icon: Megaphone },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'SEO Center', href: '/admin/seo', icon: Search },
  { label: 'Users', href: '/admin/users', icon: UserCog },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
  const supabase = await createClient()
  
  // Handle missing Supabase configuration
  if (!supabase) {
    return (
      <div className="min-h-screen bg-[#05070A] flex items-center justify-center p-4">
        <div className="bg-[#53D6FF]/10 border border-[#53D6FF]/30 rounded-lg p-6 max-w-md">
          <h2 className="text-[#8DEBFF] font-medium mb-2">Admin Not Available</h2>
          <p className="text-[#8DEBFF]/80 text-sm">
            Supabase environment variables are missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        </div>
      </div>
    )
  }
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  
  // Check admin authorization - verify user exists in admin_users table (with normalized email)
  const normalizedUserEmail = normalizeEmail(user.email)
  const { data: adminUser, error: adminError } = await supabase
    .from('admin_users')
    .select('role')
    .eq('email', normalizedUserEmail)
    .single()
  
  // If not an admin, redirect to unauthorized page
  if (adminError || !adminUser || (adminUser.role !== 'admin' && adminUser.role !== 'owner')) {
    console.warn(`Unauthorized admin layout access attempt: ${user.email} (normalized: ${normalizedUserEmail})`)
    redirect('/unauthorized')
  }

  return (
    <div className="flex min-h-screen bg-[#05070A]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 text-white flex flex-col bg-[#05070A] border-r border-[#27313B]">
        <div className="px-5 py-5 border-b border-[#27313B]">
          <p className="font-bold text-base text-[#8DEBFF]">Forged in the Fire</p>
          <p className="text-xs text-[#A9B8C6]">Admin Portal</p>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#B8C4CF] hover:bg-[#1A232C] hover:text-[#F6FAFC] transition-colors"
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}
          <div className="my-4 border-t border-[#27313B]" />
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#B8C4CF] hover:bg-[#1A232C] hover:text-[#F6FAFC] transition-colors"
          >
            <ExternalLink size={16} />
            View Site
          </Link>
        </nav>
        <div className="px-2 py-4 border-t border-[#27313B]">
          <p className="text-xs text-[#A9B8C6] px-3 mb-2 truncate" title={user.email ?? ''}>
            {user.email}
          </p>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#A9B8C6] hover:bg-[#1A232C] hover:text-[#F6FAFC] transition-colors w-full"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  )
  } catch (error) {
    console.error('Admin layout error:', error)
    throw error
  }
}
