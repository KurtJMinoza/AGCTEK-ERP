'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HiOutlinePlus } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import Tag from '@/components/ui/Tag'
import PageContainer from '@/components/shared/PageContainer'
import { USER_ROLES } from '@/constants/roles.constant'
import {
    SUPER_ADMIN_SYSTEM_SETTINGS_PATH,
    SUPER_ADMIN_USERS_PATH,
    superAdminRolePath,
    superAdminTemplatePath,
} from '@/constants/route.constant'
import {
    apiListRoles,
    apiListRoleTemplates,
    type RoleSummary,
    type RoleTemplateSummary,
} from '@/services/PermissionService'
import {
    PiCopyDuotone,
    PiShieldCheckDuotone,
    PiUsersThreeDuotone,
    PiSlidersHorizontalDuotone,
} from 'react-icons/pi'
import type { ReactNode } from 'react'
import CreateRoleDialog from '../components/CreateRoleDialog'

const RolesList = () => {
    const router = useRouter()
    const [roles, setRoles] = useState<RoleSummary[] | null>(null)
    const [error, setError] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)

    useEffect(() => {
        apiListRoles()
            .then(setRoles)
            .catch(() => setError(true))
    }, [])

    if (error) {
        return <p className="text-sm text-red-500">Failed to load roles.</p>
    }
    if (!roles) {
        return <Spinner size={24} />
    }

    return (
        <>
            <div className="mb-2 flex justify-end">
                <Button
                    size="sm"
                    variant="solid"
                    icon={<HiOutlinePlus />}
                    onClick={() => setCreateOpen(true)}
                >
                    Create role
                </Button>
            </div>
            <CreateRoleDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={(role) => {
                    setCreateOpen(false)
                    router.push(superAdminRolePath(role.code))
                }}
            />
            <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
                {roles.map((role) => (
                    <li
                        key={role.code}
                        className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4"
                    >
                        <div className="flex w-64 shrink-0 flex-wrap items-center gap-2">
                            <span className="font-semibold heading-text">
                                {role.name}
                            </span>
                            <Tag className="border-0 bg-gray-100 text-xs dark:bg-gray-700">
                                {role.code}
                            </Tag>
                            {role.isSystem && (
                                <Tag className="border-0 bg-primary-subtle text-xs text-primary">
                                    SYSTEM
                                </Tag>
                            )}
                            {!role.isActive && (
                                <Tag className="border-0 bg-gray-100 text-xs text-gray-500 dark:bg-gray-700">
                                    Inactive
                                </Tag>
                            )}
                        </div>
                        <p className="flex-1 text-sm text-gray-600 dark:text-gray-300">
                            {role.description}
                        </p>
                        <span className="text-xs text-gray-400">
                            {role._count.users} user
                            {role._count.users === 1 ? '' : 's'}
                        </span>
                        <Link href={superAdminRolePath(role.code)}>
                            <Button size="xs">
                                {role.code === USER_ROLES.SUPER_ADMIN
                                    ? 'View'
                                    : 'Manage'}
                            </Button>
                        </Link>
                    </li>
                ))}
            </ul>
        </>
    )
}

const TemplatesList = () => {
    const router = useRouter()
    const [templates, setTemplates] = useState<RoleTemplateSummary[] | null>(
        null,
    )
    const [error, setError] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)

    useEffect(() => {
        apiListRoleTemplates()
            .then(setTemplates)
            .catch(() => setError(true))
    }, [])

    if (error) {
        return (
            <p className="text-sm text-red-500">Failed to load role templates.</p>
        )
    }
    if (!templates) {
        return <Spinner size={24} />
    }

    return (
        <>
            <div className="mb-2 flex justify-end">
                <Button
                    size="sm"
                    variant="solid"
                    icon={<HiOutlinePlus />}
                    onClick={() => setCreateOpen(true)}
                >
                    Create template
                </Button>
            </div>
            <CreateRoleDialog
                isOpen={createOpen}
                kind="template"
                onClose={() => setCreateOpen(false)}
                onCreated={(template) => {
                    setCreateOpen(false)
                    router.push(superAdminTemplatePath(template.code))
                }}
            />
            {templates.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    No templates yet. Create one here, or open a role and use
                    Save as template.
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
                    {templates.map((template) => (
                        <li
                            key={template.code}
                            className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4"
                        >
                            <div className="flex w-64 shrink-0 flex-wrap items-center gap-2">
                                <span className="font-semibold heading-text">
                                    {template.name}
                                </span>
                                <Tag className="border-0 bg-gray-100 text-xs dark:bg-gray-700">
                                    {template.code}
                                </Tag>
                            </div>
                            <p className="flex-1 text-sm text-gray-600 dark:text-gray-300">
                                {template.description}
                            </p>
                            <span className="text-xs text-gray-400">
                                {template._count.permissions} readable
                                submodule
                                {template._count.permissions === 1 ? '' : 's'}
                            </span>
                            <Link href={superAdminTemplatePath(template.code)}>
                                <Button size="xs">Manage</Button>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </>
    )
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
                    description="Permissions belong to roles, and each user is assigned one role. Open a role to edit its details and permissions or see who has it."
                >
                    <RolesList />
                </SettingsSection>

                <SettingsSection
                    icon={<PiCopyDuotone />}
                    title="Role Templates"
                    description="Reusable permission blueprints for creating roles. Templates are never assigned to users and never grant access; a role copies a template once and is independent afterwards."
                >
                    <TemplatesList />
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
