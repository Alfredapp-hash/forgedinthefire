export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DebugLayout({ children }: { children: React.ReactNode }) {
  let debugInfo: any = { step: 'starting' }
  
  try {
    const supabase = await createClient()
    debugInfo.step = 'client_created'
    debugInfo.hasClient = !!supabase
    
    if (!supabase) {
      return (
        <div className="p-8">
          <h1 className="text-[#8DEBFF] font-bold">Debug: No Supabase Client</h1>
          <pre className="mt-4 bg-gray-100 p-4 rounded">{JSON.stringify(debugInfo, null, 2)}</pre>
          {children}
        </div>
      )
    }
    
    debugInfo.step = 'getting_user'
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    debugInfo.hasUser = !!user
    debugInfo.userError = userError?.message
    
    if (!user) {
      return (
        <div className="p-8">
          <h1 className="text-[#8DEBFF] font-bold">Debug: No User</h1>
          <pre className="mt-4 bg-gray-100 p-4 rounded">{JSON.stringify(debugInfo, null, 2)}</pre>
          <Link href="/login" className="text-blue-500 underline">Go to Login</Link>
        </div>
      )
    }
    
    debugInfo.step = 'checking_admin'
    debugInfo.userEmail = user.email
    
    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('role')
      .eq('email', user.email)
      .single()
    
    debugInfo.adminData = adminUser
    debugInfo.adminError = adminError?.message
    debugInfo.isAdmin = adminUser?.role === 'admin' || adminUser?.role === 'owner'
    
    return (
      <div className="p-8">
        <h1 className="text-[#8DEBFF] font-bold mb-4">Debug: Admin Layout</h1>
        <pre className="bg-gray-100 p-4 rounded text-xs">{JSON.stringify(debugInfo, null, 2)}</pre>
        <div className="mt-8">
          {children}
        </div>
      </div>
    )
  } catch (error: any) {
    debugInfo.step = 'error'
    debugInfo.error = error.message
    debugInfo.errorStack = error.stack
    
    return (
      <div className="p-8">
        <h1 className="text-[#8DEBFF] font-bold mb-4">Debug: ERROR</h1>
        <pre className="bg-[#8DEBFF]/15 p-4 rounded text-xs overflow-auto">{JSON.stringify(debugInfo, null, 2)}</pre>
      </div>
    )
  }
}
