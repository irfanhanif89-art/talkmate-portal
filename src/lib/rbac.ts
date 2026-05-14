// Role-based access control for the TalkMate client portal — Session 11.
//
// Three roles in scope:
//   * owner    — businesses.owner_user_id matches the current auth user.
//                Full access to everything.
//   * manager  — staff_members row with role='manager'. Can edit
//                operational settings but not billing.
//   * staff    — staff_members row with role='staff'. View-only across
//                the operational sections.
//
// The TalkMate platform-admin role (users.role = 'admin') is handled
// separately by requireAdmin() in src/lib/admin-auth.ts and is orthogonal
// to portal roles — an internal admin can also be an owner of a client
// account if they happen to have one.

export type PortalRole = 'owner' | 'manager' | 'staff'

// A permission is a verb-noun string. The set is open — UI code calls
// hasPermission() with whatever permission key it needs, and unknown
// permissions return false.
export const ROLE_PERMISSIONS: Record<PortalRole, string[]> = {
  owner: [
    // Read-only views
    'view_dashboard', 'view_calls', 'view_contacts', 'view_bookings',
    'view_callbacks', 'view_team', 'view_vip_callers', 'view_services',
    'view_routing', 'view_billing', 'view_settings', 'view_dispatch',
    'view_audit_log_self',
    // Write
    'edit_services', 'edit_team', 'edit_routing', 'edit_settings',
    'edit_billing', 'edit_dispatch', 'edit_agent', 'edit_notifications',
    // Staff management — owner only
    'invite_staff', 'manage_staff', 'remove_staff',
  ],
  manager: [
    'view_dashboard', 'view_calls', 'view_contacts', 'view_bookings',
    'view_callbacks', 'view_team', 'view_vip_callers', 'view_services',
    'view_routing', 'view_dispatch', 'view_settings',
    'edit_services', 'edit_team', 'edit_routing', 'edit_dispatch',
    'edit_agent', 'edit_notifications',
    // Managers can view but not edit billing — they can see usage but
    // not change the plan or payment details.
  ],
  staff: [
    'view_dashboard', 'view_calls', 'view_contacts', 'view_bookings',
    'view_callbacks', 'view_dispatch',
  ],
}

export function hasPermission(role: PortalRole | null | undefined, permission: string): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

// Convenience labels for the UI.
export const ROLE_LABEL: Record<PortalRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
}

// Friendly explanation shown in the locked-state panel when a user
// hits a feature their role can't access.
export function roleLockMessage(role: PortalRole | null | undefined, what: string): string {
  if (role === 'staff') {
    return `${what} is available to managers and account owners. Ask your owner to grant access if you need it.`
  }
  if (role === 'manager') {
    return `${what} is available to the account owner only.`
  }
  return `${what} is restricted on this account.`
}
