import { USER_ROLES, type UserRole } from '../auth/auth.constants'

export const PERMISSION_ACTIONS = ['view', 'create', 'read', 'update', 'delete'] as const
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

/** `canView` is module access (menu + entry); the CRUD flags apply to records inside it. */
export type CrudFlags = {
    canView: boolean
    canCreate: boolean
    canRead: boolean
    canUpdate: boolean
    canDelete: boolean
}

export const ACTION_FIELD: Record<PermissionAction, keyof CrudFlags> = {
    view: 'canView',
    create: 'canCreate',
    read: 'canRead',
    update: 'canUpdate',
    delete: 'canDelete',
}

export const MODULE_CODES = {
    SD: 'sd',
    MM: 'mm',
    FICO: 'fico',
    SCM: 'scm',
    CRM: 'crm',
    HCM: 'hcm',
    ADMIN: 'admin',
} as const

export type ModuleCode = (typeof MODULE_CODES)[keyof typeof MODULE_CODES]

export const MODULE_CATALOG: {
    code: ModuleCode
    name: string
    description: string
    sortOrder: number
}[] = [
    { code: 'sd', name: 'Sales & Distribution', description: 'Sales orders, POS, pricing, and customer billing.', sortOrder: 10 },
    { code: 'mm', name: 'Materials Management', description: 'Materials, procurement, inventory, and warehousing.', sortOrder: 20 },
    { code: 'fico', name: 'Finance & Controlling', description: 'Accounting, journals, periods, and cost control.', sortOrder: 30 },
    { code: 'scm', name: 'Supply Chain Management', description: 'Fleet, trips, shipments, tracking, and planning.', sortOrder: 40 },
    { code: 'crm', name: 'Customer Relationship Management', description: 'Customers, contacts, and sales pipeline.', sortOrder: 50 },
    { code: 'hcm', name: 'Human Capital Management', description: 'Employees, positions, and HR records.', sortOrder: 60 },
    { code: 'admin', name: 'Administration', description: 'Super Admin Settings: users, roles, and system configuration.', sortOrder: 90 },
]

/** Modules that only super_admin may access; grants for other roles are rejected. */
export const SUPER_ADMIN_ONLY_MODULES: ReadonlySet<string> = new Set([MODULE_CODES.ADMIN])

const NONE: CrudFlags = { canView: false, canCreate: false, canRead: false, canUpdate: false, canDelete: false }
const FULL: CrudFlags = { canView: true, canCreate: true, canRead: true, canUpdate: true, canDelete: true }
const READ: CrudFlags = { ...NONE, canView: true, canRead: true }
const READ_CREATE: CrudFlags = { ...READ, canCreate: true }
const NO_DELETE: CrudFlags = { ...FULL, canDelete: false }

export const FULL_ACCESS = FULL
export const NO_ACCESS = NONE

/**
 * Seeded once per (role, module); later edits in Super Admin Settings are never overwritten.
 * super_admin is always resolved as full access regardless of stored rows.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
    Exclude<UserRole, typeof USER_ROLES.SUPER_ADMIN>,
    Record<ModuleCode, CrudFlags>
> = {
    [USER_ROLES.ADMIN]: {
        sd: FULL,
        mm: FULL,
        fico: NO_DELETE,
        scm: FULL,
        crm: FULL,
        hcm: NO_DELETE,
        admin: NONE,
    },
    [USER_ROLES.EMPLOYEE]: {
        sd: READ_CREATE,
        mm: READ_CREATE,
        fico: NONE,
        scm: READ_CREATE,
        crm: READ_CREATE,
        hcm: NONE,
        admin: NONE,
    },
}

/** Any write grant implies read, and any grant implies view (module access). */
export function normalizeFlags(flags: CrudFlags): CrudFlags {
    const anyWrite = flags.canCreate || flags.canUpdate || flags.canDelete
    const canRead = flags.canRead || anyWrite
    return { ...flags, canRead, canView: flags.canView || canRead }
}

/** Additive merge: an action is allowed if any source allows it. */
export function mergeFlags(...sources: CrudFlags[]): CrudFlags {
    return sources.reduce<CrudFlags>(
        (acc, f) => ({
            canView: acc.canView || f.canView,
            canCreate: acc.canCreate || f.canCreate,
            canRead: acc.canRead || f.canRead,
            canUpdate: acc.canUpdate || f.canUpdate,
            canDelete: acc.canDelete || f.canDelete,
        }),
        NONE,
    )
}
