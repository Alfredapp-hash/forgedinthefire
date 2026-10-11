import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isOwnerRole, isProducerRole, isStaffRole, type StaffRole } from '@/lib/admin/roles'

/**
 * Check if the current authenticated user is an admin
 * Uses the admin_users table to verify privileges
 * @returns {Promise<{isAdmin: boolean, user: User | null, error?: string}>}
 */
export async function verifyAdminAccess(): Promise<{
  isAdmin: boolean
  isStaff: boolean
  role: StaffRole | null
  user: { id: string; email: string } | null
  error?: string
}> {
  const supabase = await createClient()
  
  if (!supabase) {
    return {
      isAdmin: false,
      isStaff: false,
      role: null,
      user: null,
      error: 'Database not configured'
    }
  }
  
  // Get the current authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user?.email) {
    return {
      isAdmin: false,
      isStaff: false,
      role: null,
      user: null,
      error: 'Not authenticated'
    }
  }
  
  // Check if user exists in admin_users table
  const { data: adminUser, error: adminError } = await supabase
    .from('admin_users')
    .select('role')
    .eq('email', user.email)
    .single()
  
  const role = isStaffRole(adminUser?.role) ? adminUser.role : null
  if (adminError || !adminUser || !role) {
    return {
      isAdmin: false,
      isStaff: false,
      role: null,
      user: { id: user.id, email: user.email },
      error: 'Not authorized as admin'
    }
  }

  return {
    isAdmin: isProducerRole(role),
    isStaff: true,
    role,
    user: { id: user.id, email: user.email }
  }
}

/**
 * Check if a specific email has admin privileges
 * Uses service role client for server-side checks
 * @param email - The email to check
 * @returns {Promise<boolean>}
 */
export async function isAdminEmail(email: string): Promise<boolean> {
  const adminClient = await createAdminClient()
  
  if (!adminClient) {
    console.error('Admin client not available')
    return false
  }
  
  const { data, error } = await adminClient
    .from('admin_users')
    .select('role')
    .eq('email', email.toLowerCase().trim())
    .single()
  
  if (error || !data) {
    return false
  }
  
  return isProducerRole(data.role)
}

/**
 * Require admin access or throw error
 * Use this in API routes and server actions
 * @throws {Error} If user is not an admin
 */
export async function requireAdmin(): Promise<{ id: string; email: string; role: StaffRole }> {
  const { isAdmin, user, role, error } = await verifyAdminAccess()
  
  if (!isAdmin || !user || !role) {
    throw new Error(error || 'Admin access required')
  }
  
  return { ...user, role }
}

/** Producer, owner, or safeguarding reviewer. */
export async function requireStaff(): Promise<{ id: string; email: string; role: StaffRole }> {
  const { isStaff, user, role, error } = await verifyAdminAccess()
  if (!isStaff || !user || !role) {
    throw new Error(error || 'Admin access required')
  }
  return { ...user, role }
}

/** Delete episodes and manage staff. */
export async function requireOwner(): Promise<{ id: string; email: string; role: StaffRole }> {
  const staff = await requireStaff()
  if (!isOwnerRole(staff.role)) throw new Error('Forbidden')
  return staff
}
