'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogOut, RefreshCw, ArrowLeft } from 'lucide-react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Admin page error:', error)
  }, [error])

  const handleSignOut = async () => {
    const supabase = createClient()
    if (supabase) {
      await supabase.auth.signOut()
    }
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-[#05070A] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#11161C] rounded-2xl p-8 border border-[#27313B]">
        <div className="w-12 h-12 rounded-xl bg-[#8DEBFF]/10 flex items-center justify-center mx-auto mb-4 border border-[#8DEBFF]/35">
          <span className="text-[#8DEBFF] text-xl">!</span>
        </div>
        <h2 className="text-xl font-bold text-[#8DEBFF] mb-2 text-center">Admin Page Error</h2>
        <p className="text-[#A9B8C6] text-sm text-center mb-6">
          Something went wrong loading the admin area.
        </p>
        
        <div className="bg-[#05070A] rounded-lg p-4 mb-6 overflow-auto">
          <p className="text-sm text-[#B8C4CF] font-mono whitespace-pre-wrap">
            {error.message}
          </p>
          {error.digest && (
            <p className="text-xs text-[#A9B8C6] mt-2">
              Error ID: {error.digest}
            </p>
          )}
        </div>
        
        <div className="space-y-2">
          <button
            onClick={reset}
            className="w-full flex items-center justify-center gap-2 bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016] font-medium py-2.5 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
          
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-[#1A232C] text-[#A9B8C6] font-medium py-2.5 rounded-lg transition-colors border border-[#27313B]"
          >
            <LogOut size={16} />
            Sign Out
          </button>
          
          <a
            href="/admin-setup"
            className="block w-full text-center text-[#A9B8C6] hover:text-[#8DEBFF] text-sm py-2 transition-colors"
          >
            Go to Admin Setup Check →
          </a>
        </div>
      </div>
    </div>
  )
}
