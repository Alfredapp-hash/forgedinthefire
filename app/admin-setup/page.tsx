'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, CheckCircle, XCircle, Database, Shield, User, Bug } from 'lucide-react'

interface CheckResult {
  name: string
  status: 'loading' | 'success' | 'error' | 'info'
  message: string
  details?: string
}

interface DebugInfo {
  expectedOwnerEmail: string
  signedInEmail: string | null
  matchedRole: string | null
  allAdminUsers: Array<{email: string, role: string}> | null
}

const EXPECTED_OWNER_EMAILS = ['salsbury.law@icloud.com', 'tracys@forgedinthefireohio.org']

function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase()
}

export default function AdminSetupCheck() {
  const [checks, setChecks] = useState<CheckResult[]>([
    { name: 'Supabase Connection', status: 'loading', message: 'Checking...' },
    { name: 'Admin Users Table', status: 'loading', message: 'Checking...' },
    { name: 'Owner Account', status: 'loading', message: 'Checking...' },
    { name: 'Current User', status: 'loading', message: 'Checking...' },
  ])
  const [sqlScript, setSqlScript] = useState('')
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  useEffect(() => {
    runChecks()
  }, [])

  const runChecks = async () => {
    const supabase = createClient()
    
    if (!supabase) {
      updateCheck(0, 'error', 'Supabase not configured', 'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing')
      updateCheck(1, 'error', 'Cannot check', 'Supabase not connected')
      updateCheck(2, 'error', 'Cannot check', 'Supabase not connected')
      updateCheck(3, 'error', 'Cannot check', 'Supabase not connected')
      return
    }

    updateCheck(0, 'success', 'Supabase connected', 'Environment variables are set')

    // Check admin_users table
    const { data: tableData, error: tableError } = await supabase
      .from('admin_users')
      .select('count')
      .limit(1)

    if (tableError) {
      updateCheck(1, 'error', 'admin_users table missing or inaccessible', tableError.message)
      updateCheck(2, 'error', 'Cannot check', 'Table does not exist')
      setSqlScript(generateSQLScript())
      return
    }
    
    updateCheck(1, 'success', 'admin_users table exists', 'Table is accessible')

    // Get current user first
    const { data: { user } } = await supabase.auth.getUser()
    const signedInEmail = normalizeEmail(user?.email)

    // Get all admin users for debugging and owner check
    const { data: allAdminUsers, error: allAdminsError } = await supabase
      .from('admin_users')
      .select('email, role')

    // Find owner by normalized email comparison (supports multiple owner emails)
    const ownerRecord = allAdminUsers?.find(
      u => EXPECTED_OWNER_EMAILS.includes(normalizeEmail(u.email)) && normalizeEmail(u.role) === 'owner'
    )

    // Find current user's admin record
    const userAdminRecord = allAdminUsers?.find(
      u => normalizeEmail(u.email) === signedInEmail
    )

    // Set debug info
    setDebugInfo({
      expectedOwnerEmail: EXPECTED_OWNER_EMAILS.join(', '),
      signedInEmail: signedInEmail || null,
      matchedRole: userAdminRecord?.role || null,
      allAdminUsers: allAdminUsers?.map(u => ({ email: u.email, role: u.role })) || null
    })

    // Check owner account
    if (ownerRecord) {
      updateCheck(2, 'success', `Owner: ${ownerRecord.email}`, `Role: ${ownerRecord.role}`)
    } else {
      updateCheck(2, 'error', 'No owner account found', `${EXPECTED_OWNER_EMAILS.join(' or ')} needs to be added as owner`)
      setSqlScript(generateSQLScript())
    }

    // Check current user
    if (user) {
      if (userAdminRecord) {
        updateCheck(3, 'success', `Signed in: ${user.email}`, `Role: ${userAdminRecord.role}`)
      } else {
        updateCheck(3, 'error', `Signed in: ${user.email}`, 'NOT an admin - needs to be added to admin_users table')
      }
    } else {
      updateCheck(3, 'info', 'Not signed in', 'Sign in to check admin status')
    }
  }

  const updateCheck = (index: number, status: CheckResult['status'], message: string, details?: string) => {
    setChecks(prev => {
      const newChecks = [...prev]
      newChecks[index] = { ...newChecks[index], status, message, details }
      return newChecks
    })
  }

  const generateSQLScript = () => {
    return `-- ============================================
-- FORGED IN THE FIRE - ADMIN SETUP FIX
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================

-- Step 1: Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Temporarily disable RLS to ensure inserts work
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;

-- Step 3: Insert BOTH owners (clean slate approach)
DELETE FROM admin_users WHERE email IN ('salsbury.law@icloud.com', 'tracys@forgedinthefireohio.org');

INSERT INTO admin_users (id, email, role, created_at, updated_at) VALUES
  (gen_random_uuid(), 'salsbury.law@icloud.com', 'owner', NOW(), NOW()),
  (gen_random_uuid(), 'tracys@forgedinthefireohio.org', 'owner', NOW(), NOW());

-- Step 4: Re-enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Step 5: Drop ALL existing policies
DROP POLICY IF EXISTS "Allow public to check admin status" ON admin_users;
DROP POLICY IF EXISTS "Allow admin full access on admin_users" ON admin_users;
DROP POLICY IF EXISTS "Allow owner full access on admin_users" ON admin_users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON admin_users;
DROP POLICY IF EXISTS "Allow select for auth" ON admin_users;
DROP POLICY IF EXISTS "Allow owner modify" ON admin_users;
DROP POLICY IF EXISTS "anon_can_read_admin_users" ON admin_users;
DROP POLICY IF EXISTS "auth_can_read_admin_users" ON admin_users;

-- Step 6: Create SELECT policy (all authenticated users can read)
CREATE POLICY "Allow select for auth"
  ON admin_users FOR SELECT
  TO authenticated
  USING (true);

-- Step 7: Create MODIFY policy for BOTH owners
CREATE POLICY "Allow owners modify"
  ON admin_users FOR ALL
  TO authenticated
  USING (email IN ('salsbury.law@icloud.com', 'tracys@forgedinthefireohio.org'))
  WITH CHECK (email IN ('salsbury.law@icloud.com', 'tracys@forgedinthefireohio.org'));

-- Step 8: Verify both owners exist
SELECT email, role, created_at FROM admin_users ORDER BY email;`
  }

  const getIcon = (status: CheckResult['status']) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-5 h-5 text-[#8DEBFF]" />
      case 'error': return <XCircle className="w-5 h-5 text-[#8DEBFF]" />
      case 'info': return <User className="w-5 h-5 text-blue-500" />
      default: return <AlertTriangle className="w-5 h-5 text-[#8DEBFF]" />
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
          <p className="text-[#A9B8C6]">Verify your admin authentication is configured correctly</p>
        </div>

        <div className="space-y-4 mb-8">
          {checks.map((check, i) => (
            <div key={i} className="bg-[#11161C] rounded-xl p-5 border border-[#27313B]">
              <div className="flex items-start gap-4">
                {getIcon(check.status)}
                <div className="flex-1">
                  <h3 className="font-medium text-[#F6FAFC] mb-1">{check.name}</h3>
                  <p className={`text-sm ${check.status === 'error' ? 'text-[#8DEBFF]' : check.status === 'success' ? 'text-[#8DEBFF]' : 'text-[#A9B8C6]'}`}>
                    {check.message}
                  </p>
                  {check.details && (
                    <p className="text-xs text-[#A9B8C6] mt-1">{check.details}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {sqlScript && (
          <div className="bg-[#11161C] rounded-xl border border-[#27313B] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-[#05070A] border-b border-[#27313B]">
              <Database className="w-4 h-4 text-[#8DEBFF]" />
              <span className="text-sm font-medium text-[#8DEBFF]">Fix Script - Run in Supabase SQL Editor</span>
            </div>
            <pre className="p-4 text-xs text-[#B8C4CF] overflow-x-auto whitespace-pre-wrap font-mono">
              {sqlScript}
            </pre>
            <button
              onClick={() => navigator.clipboard.writeText(sqlScript)}
              className="w-full py-2 bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016] text-sm font-medium transition-colors"
            >
              Copy SQL to Clipboard
            </button>
          </div>
        )}

        {debugInfo && (
          <div className="mt-6 bg-[#11161C] rounded-xl border border-[#27313B] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-[#05070A] border-b border-[#27313B]">
              <Bug className="w-4 h-4 text-[#A9B8C6]" />
              <span className="text-sm font-medium text-[#A9B8C6]">Debug Information</span>
            </div>
            <div className="p-4 text-xs text-[#A9B8C6] font-mono space-y-2">
              <div>
                <span className="text-[#A9B8C6]">Expected Owner:</span>{' '}
                <span className="text-[#B8C4CF]">{debugInfo.expectedOwnerEmail}</span>
              </div>
              <div>
                <span className="text-[#A9B8C6]">Signed In User:</span>{' '}
                <span className="text-[#B8C4CF]">{debugInfo.signedInEmail || '(not signed in)'}</span>
              </div>
              <div>
                <span className="text-[#A9B8C6]">Matched Role:</span>{' '}
                <span className="text-[#B8C4CF]">{debugInfo.matchedRole || '(none)'}</span>
              </div>
              <div className="pt-2 border-t border-[#27313B]">
                <span className="text-[#A9B8C6]">All Admin Users in DB:</span>
                {debugInfo.allAdminUsers && debugInfo.allAdminUsers.length > 0 ? (
                  <ul className="mt-2 space-y-1 ml-4">
                    {debugInfo.allAdminUsers.map((u, i) => (
                      <li key={i} className="text-[#B8C4CF]">
                        • {u.email} ({u.role})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#B8C4CF] ml-4 mt-1">(none found)</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 text-center space-y-2">
          <a href="/login" className="text-[#8DEBFF] hover:text-[#53D6FF] text-sm">
            → Go to Login
          </a>
          <br />
          <a href="/" className="text-[#A9B8C6] hover:text-[#8DEBFF] text-sm">
            ← Back to Website
          </a>
        </div>
      </div>
    </div>
  )
}
