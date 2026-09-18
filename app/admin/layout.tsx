export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminSidebarNav } from '@/components/admin/admin-sidebar-nav'

function normalizeEmail(email: string | undefined): string {
  return (email || '').trim().toLowerCase()
}

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
      <aside className="w-64 shrink-0 text-white flex flex-col bg-[#05070A] border-r border-[#27313B] print:hidden">
        <div className="px-5 py-5 border-b border-[#27313B]">
          <p className="font-bold text-base text-[#8DEBFF]">Forged in the Fire</p>
          <p className="text-xs text-[#A9B8C6]">Admin Portal</p>
        </div>
        <AdminSidebarNav email={user.email ?? ''} />
      </aside>

      {/* Main */}
      <div className="flex-1 overflow-auto">
        <div className="p-8 print:p-0">
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
