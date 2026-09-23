'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, CheckCircle, XCircle, Database, Shield, User } from 'lucide-react'

interface CheckResult {
  name: string
  status: 'loading' | 'success' | 'error' | 'info'
  message: string
  details?: string
}

function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase()
}

/**
 * Self-service admin check. It only ever reads the signed-in user's OWN
 * admin_users row (RLS enforces this since 20260923000003_podcast_security.sql).
 * No owner emails live in this client bundle.
 */
const SQL_TEMPLATE = `-- Run in the Supabase SQL editor as a project owner.
-- Replace the address with the account that should own the admin portal.
INSERT INTO admin_users (email, role)
VALUES (lower(trim('owner@example.org')), 'owner')
ON CONFLICT (email) DO UPDATE SET role = 'owner', updated_at = NOW();

-- Policies are managed by supabase/migrations/20260923000003_podcast_security.sql
-- (signed-in users can read only their own row; admins manage the table).`

export default function AdminSetupCheck() {
  const [checks, setChecks] = useState<CheckResult[]>([
    { name: 'Supabase Connection', status: 'loading', message: 'Checking...' },
    { name: 'Current User', status: 'loading', message: 'Checking...' },
    { name: 'Your Admin Access', status: 'loading', message: 'Checking...' },
  ])
  const [showSql, setShowSql] = useState(false)

  const updateCheck = (index: number, status: CheckResult['status'], message: string, details?: string) => {
    setChecks((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], status, message, details }
      return next
    })
  }

  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      if (!supabase) {
        updateCheck(0, 'error', 'Supabase not configured', 'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing')
        updateCheck(1, 'error', 'Cannot check', 'Supabase not connected')
        updateCheck(2, 'error', 'Cannot check', 'Supabase not connected')
        return
      }
      updateCheck(0, 'success', 'Supabase connected', 'Environment variables are set')

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        updateCheck(1, 'info', 'Not signed in', 'Sign in to check your admin status')
        updateCheck(2, 'info', 'Sign in first')
        return
      }
      const email = normalizeEmail(user.email)
      updateCheck(1, 'success', `Signed in: ${email}`)

      const { data: own, error } = await supabase.from('admin_users').select('role').eq('email', email).maybeSingle()
      if (error) {
        updateCheck(2, 'error', 'Could not read admin_users', error.message)
        setShowSql(true)
        return
      }
      if (own && (own.role === 'admin' || own.role === 'owner')) {
        updateCheck(2, 'success', `You are an ${own.role}`)
      } else {
        updateCheck(2, 'error', 'This account is not an admin', 'Ask a site owner to add your email to admin_users.')
        setShowSql(true)
      }
    }
    void run()
  }, [])

  const getIcon = (status: CheckResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-[#8DEBFF]" />
      case 'error':
        return <XCircle className="w-5 h-5 text-[#8DEBFF]" />
      case 'info':
        return <User className="w-5 h-5 text-blue-500" />
      default:
        return <AlertTriangle className="w-5 h-5 text-[#8DEBFF]" />
    }
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#53D6FF]/10 flex items-center justify-center mx-auto mb-4 border border-[#8DEBFF]/30">
            <Shield className="w-8 h-8 text-[#8DEBFF]" />
          </div>
          <h1 className="text-2xl font-bold text-[#F6FAFC] mb-2">Admin Setup Check</h1>
          <p className="text-[#A9B8C6]">Check whether your signed-in account can use the admin portal</p>
        </div>

        <div className="space-y-4 mb-8">
          {checks.map((check, i) => (
            <div key={i} className="bg-[#11161C] rounded-xl p-5 border border-[#27313B]">
              <div className="flex items-start gap-4">
                {getIcon(check.status)}
                <div className="flex-1">
                  <h3 className="font-medium text-[#F6FAFC] mb-1">{check.name}</h3>
                  <p className="text-sm text-[#A9B8C6]">{check.message}</p>
                  {check.details && <p className="text-xs text-[#A9B8C6] mt-1">{check.details}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {showSql && (
          <div className="bg-[#11161C] rounded-xl border border-[#27313B] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-[#05070A] border-b border-[#27313B]">
              <Database className="w-4 h-4 text-[#8DEBFF]" />
              <span className="text-sm font-medium text-[#8DEBFF]">For a site owner: add an admin in the Supabase SQL editor</span>
            </div>
            <pre className="p-4 text-xs text-[#B8C4CF] overflow-x-auto whitespace-pre-wrap font-mono">{SQL_TEMPLATE}</pre>
            <button
              onClick={() => void navigator.clipboard.writeText(SQL_TEMPLATE)}
              className="w-full py-2 bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016] text-sm font-medium transition-colors"
            >
              Copy SQL to Clipboard
            </button>
          </div>
        )}

        <div className="mt-8 text-center space-y-2">
          <Link href="/login" className="text-[#8DEBFF] hover:text-[#53D6FF] text-sm">
            → Go to Login
          </Link>
          <br />
          <Link href="/" className="text-[#A9B8C6] hover:text-[#8DEBFF] text-sm">
            ← Back to Website
          </Link>
        </div>
      </div>
    </div>
  )
}
