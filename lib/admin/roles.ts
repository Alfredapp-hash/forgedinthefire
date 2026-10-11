/** Podcast and admin portal roles. Owner manages people. Admin produces. Safeguarding reviews guest sign-offs and cannot delete episodes. */

export const STAFF_ROLES = ['owner', 'admin', 'safeguarding'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role === 'owner' || role === 'admin' || role === 'safeguarding'
}

/** Can edit episodes, invites, and publish. */
export function isProducerRole(role: string | null | undefined) {
  return role === 'owner' || role === 'admin'
}

export function isOwnerRole(role: string | null | undefined) {
  return role === 'owner'
}
