export const USER_ROLES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    EMPLOYEE: 'employee',
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]

export const ROLE_AUTHORITY: Record<UserRole, string[]> = {
    [USER_ROLES.SUPER_ADMIN]: ['super_admin', 'admin'],
    [USER_ROLES.ADMIN]: ['admin'],
    [USER_ROLES.EMPLOYEE]: ['employee'],
}

/** Protected roles seeded into the `roles` table; their codes are security identifiers. */
export const SYSTEM_ROLE_CATALOG: { code: UserRole; name: string; description: string }[] = [
    { code: USER_ROLES.SUPER_ADMIN, name: 'Super Administrator', description: 'Unrestricted system administration.' },
    { code: USER_ROLES.ADMIN, name: 'Administrator', description: 'Full operational access to ERP modules.' },
    { code: USER_ROLES.EMPLOYEE, name: 'Employee', description: 'Standard employee access.' },
]

/** Role codes are lowercase snake_case and immutable once created. */
export const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,49}$/

/** Session authority list; custom roles authorize through permissions, so they only carry their own code. */
export function roleAuthority(role: string): string[] {
    return ROLE_AUTHORITY[role as UserRole] ?? [role]
}
