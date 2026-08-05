'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, AlertTriangle, ArrowLeft, LogOut } from 'lucide-react'
import Link from 'next/link'

export default function UnauthorizedPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    const client = createClient()
    if (client) {
      setSupabase(client)
      // Get current user email
      client.auth.getUser().then(({ data: { user } }) => {
        if (user?.email) {
          setUserEmail(user.email)
        }
      })
    }
  }, [])

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
      window.location.href = '/login'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#8DEBFF]/10 flex items-center justify-center mx-auto mb-4 border border-[#8DEBFF]/35">
            <Shield className="w-8 h-8 text-[#8DEBFF]" />
          </div>
          <h1 className="text-2xl font-bold text-[#F6FAFC] mb-1">Access Denied</h1>
          <p className="text-[#A9B8C6]">Forged in the Fire Admin Portal</p>
        </div>

        {/* Alert Box */}
        <div className="bg-[#11161C] rounded-2xl p-8 border border-[#1A232C]">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#53D6FF]/10 flex items-center justify-center shrink-0 border border-[#53D6FF]/30">
              <AlertTriangle className="w-6 h-6 text-[#8DEBFF]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#F6FAFC] mb-2">
                Unauthorized Access
              </h2>
              <p className="text-[#A9B8C6] text-sm leading-relaxed">
                Your account does not have admin privileges. The admin portal is restricted to authorized personnel only.
              </p>
            </div>
          </div>

          {userEmail && (
            <div className="mb-6 p-4 bg-[#05070A] rounded-lg border border-[#1A232C]">
              <p className="text-xs text-[#A9B8C6] uppercase tracking-wider mb-1">Signed in as</p>
              <p className="text-[#F6FAFC] font-medium">{userEmail}</p>
            </div>
          )}

          <div className="space-y-3">
            <Link
              href="/"
              className="flex items-center justify-center gap-2 w-full bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016] font-medium py-2.5 rounded-lg transition-colors"
            >
              <ArrowLeft size={18} />
              Return to Website
            </Link>

            <button
              onClick={handleSignOut}
              className="flex items-center justify-center gap-2 w-full bg-transparent hover:bg-[#1A232C] text-[#A9B8C6] font-medium py-2.5 rounded-lg transition-colors border border-[#1A232C]"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>

        {/* Security Note */}
        <p className="text-center text-xs text-[#A9B8C6] mt-6">
          All access attempts are logged for security purposes.
          <br />
          If you believe this is an error, contact the site administrator.
        </p>
      </div>
    </div>
  )
}
