/** Protected system role codes. Custom roles come from the roles table (`apiListRoles`). */
export const USER_ROLES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    EMPLOYEE: 'employee',
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]

/** Fallback labels for system roles when the API does not return a role name. */
export const ROLE_LABELS: Record<UserRole, string> = {
    [USER_ROLES.SUPER_ADMIN]: 'Super Admin',
    [USER_ROLES.ADMIN]: 'Admin',
    [USER_ROLES.EMPLOYEE]: 'Employee',
}

export const SUPER_ADMIN_AUTHORITY = [USER_ROLES.SUPER_ADMIN]

export function getRoleLabel(role?: string | null) {
    return role && role in ROLE_LABELS ? ROLE_LABELS[role as UserRole] : ''
}
