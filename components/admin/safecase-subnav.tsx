'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/admin/safecase', label: 'Dashboard', match: 'exact' as const },
  { href: '/admin/safecase/triage', label: 'Triage' },
  { href: '/admin/safecase/caseload', label: 'My Caseload' },
  { href: '/admin/safecase/clients', label: 'Clients' },
  { href: '/admin/safecase/intake', label: 'Intake' },
  { href: '/admin/safecase/programs', label: 'Programs' },
  { href: '/admin/safecase/safety', label: 'Safety' },
  { href: '/admin/safecase/tasks', label: 'Tasks' },
  { href: '/admin/safecase/calendar', label: 'Calendar' },
  { href: '/admin/safecase/referrals', label: 'Referrals' },
  { href: '/admin/safecase/reports', label: 'Reports' },
  { href: '/admin/safecase/grants', label: 'Grants' },
  { href: '/admin/safecase/volunteers', label: 'Volunteers' },
  { href: '/admin/safecase/houses', label: 'Safe Houses' },
  { href: '/admin/safecase/settings', label: 'Settings' },
]

export function SafeCaseSubnav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1 overflow-x-auto pb-3 mb-6 border-b border-[#27313B] print:hidden" aria-label="SafeCase sections">
      {tabs.map((tab) => {
        const active = tab.match === 'exact'
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide uppercase ${
              active ? 'bg-[#53D6FF]/15 text-[#8DEBFF]' : 'text-[#A9B8C6] hover:text-[#F6FAFC] hover:bg-[#1A232C]'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
