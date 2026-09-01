export const USER_ROLES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]

export const ROLE_AUTHORITY: Record<UserRole, string[]> = {
    [USER_ROLES.SUPER_ADMIN]: ['super_admin', 'admin'],
    [USER_ROLES.ADMIN]: ['admin'],
}

export function isUserRole(value: string): value is UserRole {
    return Object.values(USER_ROLES).includes(value as UserRole)
}
