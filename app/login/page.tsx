'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Flame, AlertTriangle, KeyRound } from 'lucide-react'

function normalizeEmail(email: string | undefined | null): string {
  return (email || '').trim().toLowerCase()
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null)
  const [configMissing, setConfigMissing] = useState(false)
  const [showResetForm, setShowResetForm] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)
  const router = useRouter()

  // Initialize Supabase client after mount (avoids build-time errors)
  useEffect(() => {
    const client = createClient()
    if (!client) {
      setConfigMissing(true)
      setError('Authentication is not configured. Please contact the site administrator.')
    } else {
      setSupabase(client)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!supabase) {
      setError('Authentication not initialized. Please refresh the page.')
      return
    }
    
    setError('')
    setDebugInfo(null)
    setLoading(true)

    // Normalize email for consistent lookup
    const normalizedEmail = normalizeEmail(email)
    console.log('[Login] Attempting login for:', normalizedEmail)

    // Sign in with Supabase Auth
    const { error: signInError, data: { user } } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (signInError) {
      console.error('[Login] Auth error:', signInError.code, signInError.message)
      
      // Provide clearer error messages
      let errorMessage = signInError.message
      let debugMsg = `Error code: ${signInError.code || 'unknown'}`
      
      if (signInError.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please try again.'
        debugMsg += ' | User may not exist or password is incorrect'
      } else if (signInError.code === 'email_not_confirmed') {
        errorMessage = 'Email not confirmed. Please check your inbox.'
      } else if (signInError.code === 'user_not_found') {
        errorMessage = 'User not found. Please check your email or contact an administrator.'
      }
      
      setError(errorMessage)
      setDebugInfo(debugMsg)
      setLoading(false)
      return
    }

    if (!user) {
      console.error('[Login] No user returned after successful auth')
      setError('Authentication failed. Please try again.')
      setLoading(false)
      return
    }

    console.log('[Login] Auth successful for:', user.email)

    // Check if user is an admin (with normalized email)
    const normalizedUserEmail = normalizeEmail(user.email)
    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('role')
      .eq('email', normalizedUserEmail)
      .single()

    if (adminError) {
      console.error('[Login] admin_users lookup error:', adminError.message, '| Looking for:', normalizedUserEmail)
    }

    if (adminError || !adminUser || (adminUser.role !== 'admin' && adminUser.role !== 'owner')) {
      console.warn('[Login] User not in admin_users:', user.email, '(normalized:', normalizedUserEmail + ')')
      // Not an admin - sign them out and show error
      await supabase.auth.signOut()
      setError(`Access denied. The email "${user.email}" is not authorized as an admin. Contact the site owner to request access.`)
      setLoading(false)
      return
    }

    console.log('[Login] Admin access granted, role:', adminUser.role)

    // User is authenticated and is an admin - redirect to admin dashboard
    router.push('/admin')
    router.refresh()
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!supabase) {
      setError('Authentication not initialized.')
      return
    }

    setError('')
    setLoading(true)

    const normalizedEmail = normalizeEmail(email)
    console.log('[Login] Sending password reset to:', normalizedEmail)

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/login`,
    })

    if (error) {
      console.error('[Login] Reset error:', error.message)
      setError(`Failed to send reset email: ${error.message}`)
      setLoading(false)
      return
    }

    console.log('[Login] Reset email sent to:', normalizedEmail)
    setResetSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#53D6FF]/10 flex items-center justify-center mx-auto mb-4 border border-[#8DEBFF]/30">
            <Flame className="w-8 h-8 text-[#8DEBFF]" />
          </div>
          <h1 className="text-2xl font-bold text-[#F6FAFC] mb-1">Admin Login</h1>
          <p className="text-[#A9B8C6]">Forged in the Fire</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-[#11161C] rounded-2xl p-8 border border-[#1A232C]">
          {configMissing && (
            <div className="mb-4 p-4 bg-[#53D6FF]/10 border border-[#53D6FF]/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#8DEBFF] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[#8DEBFF] font-medium text-sm mb-1">Authentication Not Configured</p>
                  <p className="text-[#8DEBFF]/80 text-sm">
                    Supabase environment variables are missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {error && !configMissing && (
            <div className="mb-4 p-3 bg-[#8DEBFF]/10 border border-[#8DEBFF]/35 rounded-lg text-[#8DEBFF] text-sm">
              {error}
              {debugInfo && (
                <p className="mt-1 text-xs text-[#8DEBFF]/70 font-mono">{debugInfo}</p>
              )}
            </div>
          )}

          {resetSent && (
            <div className="mb-4 p-3 bg-[#8DEBFF]/10 border border-[#8DEBFF]/30 rounded-lg text-[#8DEBFF] text-sm">
              Password reset email sent! Check your inbox at {normalizeEmail(email)}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#B8C4CF] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={configMissing}
                className="w-full bg-[#05070A] border border-[#1A232C] rounded-lg px-4 py-2.5 text-[#F6FAFC] placeholder-[#A9B8C6] focus:outline-none focus:border-[#8DEBFF] transition-colors disabled:opacity-50"
                placeholder="admin@forgedinthefireohio.org"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#B8C4CF] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={configMissing}
                  className="w-full bg-[#05070A] border border-[#1A232C] rounded-lg px-4 py-2.5 text-[#F6FAFC] placeholder-[#A9B8C6] focus:outline-none focus:border-[#8DEBFF] transition-colors disabled:opacity-50"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={configMissing}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors disabled:opacity-50"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !supabase || configMissing}
              className="w-full bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016] font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : !supabase ? 'Initializing...' : 'Sign In'}
            </button>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setShowResetForm(!showResetForm)}
                className="text-sm text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors"
              >
                {showResetForm ? 'Back to login' : 'Forgot password?'}
              </button>
              
              <a 
                href="/admin-setup" 
                className="text-sm text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors"
              >
                Admin Setup →
              </a>
            </div>

            {showResetForm && (
              <div className="pt-4 border-t border-[#1A232C]">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={loading || !supabase || !email}
                  className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-[#1A232C] text-[#8DEBFF] font-medium py-2.5 rounded-lg transition-colors border border-[#8DEBFF]/30 disabled:opacity-50"
                >
                  <KeyRound size={16} />
                  Send Password Reset Email
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-[#1A232C] text-center">
            <a href="/" className="text-sm text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors">
              ← Back to website
            </a>
          </div>
        </form>

        {/* Security Note */}
        <p className="text-center text-xs text-[#A9B8C6] mt-6">
          This area is restricted to authorized personnel only.
          <br />
          All access is logged for security purposes.
        </p>
      </div>
    </div>
  )
}
