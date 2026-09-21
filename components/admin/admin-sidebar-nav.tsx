'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Newspaper,
  PenSquare,
  Mic2,
  Search,
  Settings,
  Users,
  Mail,
  LogOut,
  ExternalLink,
  BarChart3,
  Megaphone,
  UserCog,
  Shield,
  ShieldCheck,
  HeartHandshake,
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'SafeCase', href: '/admin/safecase', icon: Shield },
  { label: 'Studio', href: '/admin/studio', icon: PenSquare },
  { label: 'Blog', href: '/admin/blog', icon: Newspaper },
  { label: 'Podcast', href: '/admin/podcast', icon: Mic2 },
  { label: 'Social', href: '/admin/social', icon: Megaphone },
  { label: 'Campaigns', href: '/admin/campaigns', icon: HeartHandshake },
  { label: 'Content', href: '/admin/content', icon: FileText },
  { label: 'Careers', href: '/admin/careers', icon: ExternalLink },
  { label: 'Subscribers', href: '/admin/subscribers', icon: Users },
  { label: 'Newsletters', href: '/admin/newsletters', icon: Mail },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'SEO Center', href: '/admin/seo', icon: Search },
  { label: 'Users', href: '/admin/users', icon: UserCog },
  { label: 'Security', href: '/admin/security', icon: ShieldCheck },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
]

export function AdminSidebarNav({ email }: { email: string }) {
  const pathname = usePathname()

  return (
    <>
      <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
        {navItems.map((item) => {
          const active = item.href === '/admin'
            ? pathname === '/admin'
            : pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-[#1A232C] text-[#8DEBFF]'
                  : 'text-[#B8C4CF] hover:bg-[#1A232C] hover:text-[#F6FAFC]'
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          )
        })}
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
        <p className="text-xs text-[#A9B8C6] px-3 mb-2 truncate" title={email}>
          {email}
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
    </>
  )
}
