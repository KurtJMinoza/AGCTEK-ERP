'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import PageContainer from '@/components/shared/PageContainer'
import {
    ROLE_AUTHORITY,
    ROLE_LABELS,
    USER_ROLE_VALUES,
    USER_ROLES,
    type UserRole,
} from '@/constants/roles.constant'
import {
    SUPER_ADMIN_SYSTEM_SETTINGS_PATH,
    SUPER_ADMIN_USERS_PATH,
    superAdminRolePath,
} from '@/constants/route.constant'
import {
    PiShieldCheckDuotone,
    PiUsersThreeDuotone,
    PiSlidersHorizontalDuotone,
} from 'react-icons/pi'
import type { ReactNode } from 'react'

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
    [USER_ROLES.SUPER_ADMIN]:
        'Full system access across companies and configuration. Only role that can open Super Admin Settings.',
    [USER_ROLES.ADMIN]:
        'Broad operational and administrative access within company scope.',
    [USER_ROLES.EMPLOYEE]:
        'Standard operational user. No user or role management, limited settings.',
}

type SettingsSectionProps = {
    icon: ReactNode
    title: string
    description: string
    children?: ReactNode
}

const SettingsSection = ({
    icon,
    title,
    description,
    children,
}: SettingsSectionProps) => (
    <Card bordered={false} className="shadow-sm dark:shadow-2xl">
        <div className="flex items-start gap-3">
            <span className="text-2xl text-primary">{icon}</span>
            <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold heading-text">{title}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {description}
                </p>
                {children ? <div className="mt-4">{children}</div> : null}
            </div>
        </div>
    </Card>
)

const SuperAdminSettings = () => {
    return (
        <PageContainer>
            <h2 className="mb-6 text-2xl font-bold heading-text">
                Super Admin Settings
            </h2>

            <div className="flex flex-col gap-4">
                <SettingsSection
                    icon={<PiShieldCheckDuotone />}
                    title="Roles"
                    description="System roles available in this release. Roles are assigned per user; open a role to configure its module access."
                >
                    <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
                        {USER_ROLE_VALUES.map((role) => (
                            <li
                                key={role}
                                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4"
                            >
                                <div className="flex w-40 shrink-0 items-center gap-2">
                                    <span className="font-semibold heading-text">
                                        {ROLE_LABELS[role]}
                                    </span>
                                    <Tag className="border-0 bg-gray-100 text-xs dark:bg-gray-700">
                                        {role}
                                    </Tag>
                                </div>
                                <p className="flex-1 text-sm text-gray-600 dark:text-gray-300">
                                    {ROLE_DESCRIPTIONS[role]}
                                </p>
                                <span className="text-xs text-gray-400">
                                    {ROLE_AUTHORITY[role].join(', ')}
                                </span>
                                <Link href={superAdminRolePath(role)}>
                                    <Button size="xs">
                                        {role === USER_ROLES.SUPER_ADMIN
                                            ? 'View permissions'
                                            : 'Manage permissions'}
                                    </Button>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </SettingsSection>

                <SettingsSection
                    icon={<PiUsersThreeDuotone />}
                    title="User Management"
                    description="Create users, assign roles, and activate or deactivate accounts."
                >
                    <Link href={SUPER_ADMIN_USERS_PATH}>
                        <Button size="sm" variant="solid">
                            Manage users
                        </Button>
                    </Link>
                </SettingsSection>

                <SettingsSection
                    icon={<PiSlidersHorizontalDuotone />}
                    title="System Settings"
                    description="Maintenance mode, sign-up and new-user defaults, and module feature toggles."
                >
                    <Link href={SUPER_ADMIN_SYSTEM_SETTINGS_PATH}>
                        <Button size="sm" variant="solid">
                            Open system settings
                        </Button>
                    </Link>
                </SettingsSection>
            </div>
        </PageContainer>
    )
}

export default SuperAdminSettings
