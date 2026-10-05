export const USER_ROLES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    EMPLOYEE: 'employee',
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]

export const USER_ROLE_VALUES = [
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
    USER_ROLES.EMPLOYEE,
] as const

export const ROLE_LABELS: Record<UserRole, string> = {
    [USER_ROLES.SUPER_ADMIN]: 'Super Admin',
    [USER_ROLES.ADMIN]: 'Admin',
    [USER_ROLES.EMPLOYEE]: 'Employee',
}

export type RoleOption = {
    value: UserRole
    label: string
}

export const ROLE_OPTIONS: RoleOption[] = USER_ROLE_VALUES.map((value) => ({
    value,
    label: ROLE_LABELS[value],
}))

export const ROLE_AUTHORITY: Record<UserRole, string[]> = {
    [USER_ROLES.SUPER_ADMIN]: ['super_admin', 'admin'],
    [USER_ROLES.ADMIN]: ['admin'],
    [USER_ROLES.EMPLOYEE]: ['employee'],
}

export const SUPER_ADMIN_AUTHORITY = [USER_ROLES.SUPER_ADMIN]

export function getRoleLabel(role?: string | null) {
    return role && role in ROLE_LABELS ? ROLE_LABELS[role as UserRole] : ''
}
