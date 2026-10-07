import { USER_ROLES } from '../auth/auth.constants'

export const SETTING_VALUE_TYPES = ['boolean', 'string', 'number'] as const
export type SettingValueType = (typeof SETTING_VALUE_TYPES)[number]

export const SETTING_GROUPS = ['general', 'access', 'features'] as const
export type SettingGroup = (typeof SETTING_GROUPS)[number]

export type SettingValue = boolean | string | number

/**
 * Stable setting keys. Renaming a key orphans its stored value, so add new keys instead.
 */
export const SETTING_KEYS = {
    MAINTENANCE_MODE: 'maintenance_mode',
    ALLOW_USER_SIGNUP: 'allow_user_signup',
    REQUIRE_DEFAULT_COMPANY_ON_USER: 'require_default_company_on_user',
    DEFAULT_USER_ROLE: 'default_user_role',
    FEATURE_SD_ENABLED: 'feature_sd_enabled',
    FEATURE_MM_ENABLED: 'feature_mm_enabled',
    FEATURE_FICO_ENABLED: 'feature_fico_enabled',
    FEATURE_SCM_ENABLED: 'feature_scm_enabled',
    FEATURE_CRM_ENABLED: 'feature_crm_enabled',
    FEATURE_HCM_ENABLED: 'feature_hcm_enabled',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

export type SettingDefinition = {
    key: SettingKey
    valueType: SettingValueType
    defaultValue: SettingValue
    label: string
    description: string
    group: SettingGroup
    sortOrder: number
    /** Allowed values for string settings. */
    options?: readonly string[]
    /** Allowed values loaded at runtime instead of `options`; `assignable_roles` = active roles in the Role table. */
    optionSource?: 'assignable_roles'
    /** Values that are never accepted, even when the runtime source contains them. */
    excludedValues?: readonly string[]
    /** Exposed without authentication via GET /system-settings/public. Never mark sensitive keys public. */
    public?: boolean
}

/**
 * Module on/off switch. Hides and blocks the module's screens and permission checks;
 * background integrations (ATP, goods issue → FICO, MM → SCM events) keep running.
 */
function moduleToggle(
    key: SettingKey,
    label: string,
    sortOrder: number,
    note?: string,
): SettingDefinition {
    return {
        key,
        valueType: 'boolean',
        defaultValue: true,
        label,
        description: `${note ? `${note} ` : ''}When off, the module is hidden and blocked for everyone, including Super Admins. Background integrations keep running.`,
        group: 'features',
        sortOrder,
        public: true,
    }
}

export const SETTINGS_CATALOG: readonly SettingDefinition[] = [
    {
        key: SETTING_KEYS.MAINTENANCE_MODE,
        valueType: 'boolean',
        defaultValue: false,
        label: 'Maintenance mode',
        description:
            'Only Super Admins can sign in and use the system. Everyone else sees a maintenance page.',
        group: 'general',
        sortOrder: 10,
        public: true,
    },
    {
        key: SETTING_KEYS.ALLOW_USER_SIGNUP,
        valueType: 'boolean',
        defaultValue: true,
        label: 'Allow user sign-up',
        description:
            'Show the public sign-up page. When off, only Super Admins can create users in User Management.',
        group: 'access',
        sortOrder: 10,
        public: true,
    },
    {
        key: SETTING_KEYS.REQUIRE_DEFAULT_COMPANY_ON_USER,
        valueType: 'boolean',
        defaultValue: true,
        label: 'Require a company for users other than Super Admin',
        description:
            'Users with any role other than Super Admin must belong to at least one company (with a default) when created or edited in User Management.',
        group: 'access',
        sortOrder: 20,
    },
    {
        key: SETTING_KEYS.DEFAULT_USER_ROLE,
        valueType: 'string',
        defaultValue: USER_ROLES.EMPLOYEE,
        label: 'Default role for new users',
        description:
            'Role given to accounts created through public sign-up, and preselected when creating a user.',
        group: 'access',
        sortOrder: 30,
        optionSource: 'assignable_roles',
        excludedValues: [USER_ROLES.SUPER_ADMIN],
        public: true,
    },
    moduleToggle(SETTING_KEYS.FEATURE_SD_ENABLED, 'Sales & Distribution', 10),
    moduleToggle(SETTING_KEYS.FEATURE_MM_ENABLED, 'Materials Management', 20),
    moduleToggle(SETTING_KEYS.FEATURE_FICO_ENABLED, 'Finance & Controlling', 30),
    moduleToggle(SETTING_KEYS.FEATURE_SCM_ENABLED, 'Supply Chain Management', 40),
    moduleToggle(SETTING_KEYS.FEATURE_CRM_ENABLED, 'Customer Relationship Management', 50),
    moduleToggle(
        SETTING_KEYS.FEATURE_HCM_ENABLED,
        'Human Capital Management',
        60,
        'External HRIS link.',
    ),
]

export const SETTINGS_BY_KEY: ReadonlyMap<string, SettingDefinition> = new Map(
    SETTINGS_CATALOG.map((d) => [d.key, d]),
)

/** Permission module codes switched off entirely by a feature toggle. */
export const FEATURE_MODULE_FLAGS: Readonly<Record<string, SettingKey>> = {
    sd: SETTING_KEYS.FEATURE_SD_ENABLED,
    mm: SETTING_KEYS.FEATURE_MM_ENABLED,
    fico: SETTING_KEYS.FEATURE_FICO_ENABLED,
    scm: SETTING_KEYS.FEATURE_SCM_ENABLED,
    crm: SETTING_KEYS.FEATURE_CRM_ENABLED,
    hcm: SETTING_KEYS.FEATURE_HCM_ENABLED,
}

export function serializeValue(value: SettingValue): string {
    return String(value)
}

export function parseStoredValue(def: SettingDefinition, raw: string | undefined): SettingValue {
    if (raw === undefined) return def.defaultValue
    switch (def.valueType) {
        case 'boolean':
            return raw === 'true'
        case 'number': {
            const n = Number(raw)
            return Number.isFinite(n) ? n : def.defaultValue
        }
        default:
            if (def.excludedValues?.includes(raw)) return def.defaultValue
            return def.options && !def.options.includes(raw) ? def.defaultValue : raw
    }
}

/** Returns an error message, or null when the value is valid for the definition. */
export function validateValue(def: SettingDefinition, value: unknown): string | null {
    switch (def.valueType) {
        case 'boolean':
            return typeof value === 'boolean' ? null : `"${def.key}" must be true or false.`
        case 'number':
            return typeof value === 'number' && Number.isFinite(value)
                ? null
                : `"${def.key}" must be a number.`
        default:
            if (typeof value !== 'string' || !value.trim()) {
                return `"${def.key}" must be a non-empty string.`
            }
            if (def.excludedValues?.includes(value)) {
                return `"${def.key}" cannot be "${value}".`
            }
            if (def.options && !def.options.includes(value)) {
                return `"${def.key}" must be one of: ${def.options.join(', ')}.`
            }
            return null
    }
}
