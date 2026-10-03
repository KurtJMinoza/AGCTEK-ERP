'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import axios from 'axios'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Notification from '@/components/ui/Notification'
import Spinner from '@/components/ui/Spinner'
import Tag from '@/components/ui/Tag'
import toast from '@/components/ui/toast'
import {
    USER_ROLE_VALUES,
    getRoleLabel,
    type UserRole,
} from '@/constants/roles.constant'
import { SUPER_ADMIN_SETTINGS_PATH } from '@/constants/route.constant'
import {
    apiGetRolePermissions,
    apiUpdateRolePermissions,
    type CrudFlags,
    type RolePermissionRow,
} from '@/services/PermissionService'
import { invalidatePermissions } from '@/utils/hooks/usePermissions'

const ACTION_COLUMNS: { field: keyof CrudFlags; label: string }[] = [
    { field: 'canView', label: 'View' },
    { field: 'canCreate', label: 'Create' },
    { field: 'canRead', label: 'Read' },
    { field: 'canUpdate', label: 'Update' },
    { field: 'canDelete', label: 'Delete' },
]

const WRITE_FIELDS: (keyof CrudFlags)[] = ['canCreate', 'canUpdate', 'canDelete']

function errorMessage(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        const message = (error.response?.data as { message?: string | string[] })
            ?.message
        if (Array.isArray(message)) return message.join(', ')
        if (message) return message
    }
    return fallback
}

function notify(type: 'success' | 'danger', title: string, message: string) {
    toast.push(
        <Notification type={type} title={title}>
            {message}
        </Notification>,
        { placement: 'top-center' },
    )
}

/** Mirrors the backend rules: write implies read, and any grant implies view. */
function applyToggle(
    row: RolePermissionRow,
    field: keyof CrudFlags,
    value: boolean,
): RolePermissionRow {
    const next = { ...row, [field]: value }
    if (value) {
        if (WRITE_FIELDS.includes(field)) next.canRead = true
        next.canView = true
    } else if (field === 'canView' || field === 'canRead') {
        next.canCreate = false
        next.canUpdate = false
        next.canDelete = false
        if (field === 'canView') next.canRead = false
    }
    return next
}

function sameFlags(a: RolePermissionRow[], b: RolePermissionRow[]) {
    return a.every((row, i) =>
        ACTION_COLUMNS.every(({ field }) => row[field] === b[i]?.[field]),
    )
}

const RolePermissionsPage = () => {
    const params = useParams()
    const role = params?.role as string
    const isKnownRole = USER_ROLE_VALUES.includes(role as UserRole)

    const [original, setOriginal] = useState<RolePermissionRow[]>([])
    const [rows, setRows] = useState<RolePermissionRow[]>([])
    const [editable, setEditable] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!isKnownRole) {
            setLoading(false)
            return
        }
        setLoading(true)
        setLoadError(null)
        try {
            const data = await apiGetRolePermissions(role)
            setOriginal(data.permissions)
            setRows(data.permissions)
            setEditable(data.editable)
        } catch (error) {
            setLoadError(errorMessage(error, 'Failed to load role permissions.'))
        } finally {
            setLoading(false)
        }
    }, [role, isKnownRole])

    useEffect(() => {
        load()
    }, [load])

    const dirty = useMemo(() => !sameFlags(rows, original), [rows, original])

    const toggle = (moduleCode: string, field: keyof CrudFlags, value: boolean) => {
        setRows((prev) =>
            prev.map((row) =>
                row.moduleCode === moduleCode ? applyToggle(row, field, value) : row,
            ),
        )
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const data = await apiUpdateRolePermissions(
                role,
                rows
                    .filter((row) => !row.locked)
                    .map(({ moduleCode, canView, canCreate, canRead, canUpdate, canDelete }) => ({
                        moduleCode,
                        canView,
                        canCreate,
                        canRead,
                        canUpdate,
                        canDelete,
                    })),
            )
            setOriginal(data.permissions)
            setRows(data.permissions)
            invalidatePermissions()
            notify('success', 'Permissions saved', `${getRoleLabel(role)} permissions updated.`)
        } catch (error) {
            notify('danger', 'Save failed', errorMessage(error, 'Failed to save permissions.'))
        } finally {
            setSaving(false)
        }
    }

    const roleLabel = getRoleLabel(role) || role

    return (
        <PageContainer>
            <PageHeader
                title={`${roleLabel} permissions`}
                description="Module access and CRUD actions granted to this role."
                breadcrumbs={[
                    { label: 'Super Admin Settings', href: SUPER_ADMIN_SETTINGS_PATH },
                    { label: 'Roles' },
                    { label: roleLabel },
                ]}
                actions={
                    editable ? (
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                disabled={!dirty || saving}
                                onClick={() => setRows(original)}
                            >
                                Reset
                            </Button>
                            <Button
                                size="sm"
                                variant="solid"
                                loading={saving}
                                disabled={!dirty}
                                onClick={handleSave}
                            >
                                Save
                            </Button>
                        </div>
                    ) : null
                }
            />

            <AdaptiveCard>
                {!isKnownRole ? (
                    <p className="text-sm text-gray-500">Unknown role: {role}</p>
                ) : loading ? (
                    <div className="flex justify-center py-10">
                        <Spinner size={32} />
                    </div>
                ) : loadError ? (
                    <div className="flex flex-col items-start gap-3">
                        <p className="text-sm text-red-500">{loadError}</p>
                        <Button size="sm" onClick={load}>
                            Retry
                        </Button>
                    </div>
                ) : (
                    <>
                        {!editable && (
                            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                                Super Admin always has full access to every module. These
                                permissions cannot be changed.
                            </p>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                                        <th className="py-3 pr-4 font-semibold heading-text">
                                            Module
                                        </th>
                                        {ACTION_COLUMNS.map(({ field, label }) => (
                                            <th
                                                key={field}
                                                className="w-24 py-3 text-center font-semibold heading-text"
                                            >
                                                {label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {rows.map((row) => {
                                        const disabled = !editable || row.locked || saving
                                        return (
                                            <tr key={row.moduleCode}>
                                                <td className="py-3 pr-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold heading-text">
                                                            {row.moduleName}
                                                        </span>
                                                        <Tag className="border-0 bg-gray-100 text-xs dark:bg-gray-700">
                                                            {row.moduleCode}
                                                        </Tag>
                                                        {row.locked && editable && (
                                                            <Tag className="border-0 bg-amber-100 text-xs text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                                                                Super Admin only
                                                            </Tag>
                                                        )}
                                                        {!row.isActive && (
                                                            <Tag className="border-0 bg-gray-100 text-xs text-gray-500 dark:bg-gray-700">
                                                                Inactive
                                                            </Tag>
                                                        )}
                                                    </div>
                                                    {row.description && (
                                                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                            {row.description}
                                                        </p>
                                                    )}
                                                </td>
                                                {ACTION_COLUMNS.map(({ field, label }) => (
                                                    <td key={field} className="py-3 text-center">
                                                        <Checkbox
                                                            className="justify-center"
                                                            checked={row[field]}
                                                            disabled={disabled}
                                                            aria-label={`${row.moduleName} ${label}`}
                                                            onChange={(value) =>
                                                                toggle(row.moduleCode, field, value)
                                                            }
                                                        />
                                                    </td>
                                                ))}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {editable && (
                            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                                View is module access (menu and entry). Any other grant also
                                grants View, and Create, Update or Delete also grant Read.
                                Changes take effect within about 30 seconds.
                            </p>
                        )}
                    </>
                )}
            </AdaptiveCard>
        </PageContainer>
    )
}

export default RolePermissionsPage
