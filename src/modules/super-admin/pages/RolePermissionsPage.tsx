'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import axios from 'axios'
import {
    HiOutlineDocumentDuplicate,
    HiOutlineDuplicate,
    HiOutlineTrash,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import Spinner from '@/components/ui/Spinner'
import toast from '@/components/ui/toast'
import { USER_ROLES } from '@/constants/roles.constant'
import {
    SUPER_ADMIN_SETTINGS_PATH,
    superAdminRolePath,
    superAdminTemplatePath,
} from '@/constants/route.constant'
import {
    apiDeleteRole,
    apiGetRolePermissions,
    apiUpdateRole,
    apiUpdateRolePermissions,
    type RolePermissionGroup,
    type RolePermissionsResponse,
} from '@/services/PermissionService'
import { invalidatePermissions } from '@/utils/hooks/usePermissions'
import CreateRoleDialog from '../components/CreateRoleDialog'
import PermissionMatrix, {
    sameFlags,
    toPermissionEntries,
} from '../components/PermissionMatrix'
import RoleDetailsCard from '../components/RoleDetailsCard'
import RoleUsersCard from '../components/RoleUsersCard'

function errorMessage(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        const message = (
            error.response?.data as { message?: string | string[] }
        )?.message
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

const RolePermissionsPage = () => {
    const params = useParams()
    const router = useRouter()
    const roleCode = params?.role as string
    const [detailsSaving, setDetailsSaving] = useState(false)
    const [copyDialog, setCopyDialog] = useState<'role' | 'template' | null>(
        null,
    )
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const [role, setRole] = useState<RolePermissionsResponse['role'] | null>(
        null,
    )
    const [original, setOriginal] = useState<RolePermissionGroup[]>([])
    const [groups, setGroups] = useState<RolePermissionGroup[]>([])
    const [editable, setEditable] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)

    const applyResponse = (data: RolePermissionsResponse) => {
        setRole(data.role)
        setOriginal(data.groups)
        setGroups(data.groups)
        setEditable(data.editable)
    }

    const load = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            applyResponse(await apiGetRolePermissions(roleCode))
        } catch (error) {
            setLoadError(
                errorMessage(error, 'Failed to load role permissions.'),
            )
        } finally {
            setLoading(false)
        }
    }, [roleCode])

    useEffect(() => {
        load()
    }, [load])

    const dirty = useMemo(
        () => !sameFlags(groups, original),
        [groups, original],
    )

    const copySource = useMemo(
        () =>
            role
                ? { type: 'role' as const, code: role.code, name: role.name }
                : null,
        [role],
    )

    const handleSave = async () => {
        setSaving(true)
        try {
            const data = await apiUpdateRolePermissions(
                roleCode,
                toPermissionEntries(groups),
            )
            applyResponse(data)
            invalidatePermissions()
            notify(
                'success',
                'Permissions saved',
                `${data.role.name} permissions updated.`,
            )
        } catch (error) {
            notify(
                'danger',
                'Save failed',
                errorMessage(error, 'Failed to save permissions.'),
            )
        } finally {
            setSaving(false)
        }
    }

    const handleSaveDetails = async (values: {
        name: string
        description: string
    }) => {
        setDetailsSaving(true)
        try {
            const updated = await apiUpdateRole(roleCode, values)
            setRole((prev) =>
                prev
                    ? {
                          ...prev,
                          name: updated.name,
                          description: updated.description,
                      }
                    : prev,
            )
            notify('success', 'Role updated', `${updated.name} details saved.`)
        } catch (error) {
            notify(
                'danger',
                'Save failed',
                errorMessage(error, 'Failed to save role details.'),
            )
        } finally {
            setDetailsSaving(false)
        }
    }

    const handleDelete = async () => {
        setDeleting(true)
        try {
            await apiDeleteRole(roleCode)
            notify(
                'success',
                'Role deleted',
                `${role?.name ?? roleCode} was deleted.`,
            )
            router.push(SUPER_ADMIN_SETTINGS_PATH)
        } catch (error) {
            notify(
                'danger',
                'Delete failed',
                errorMessage(error, 'Failed to delete the role.'),
            )
            setDeleting(false)
            setDeleteOpen(false)
        }
    }

    const roleLabel = role?.name ?? roleCode
    const isSuperAdmin = roleCode === USER_ROLES.SUPER_ADMIN
    const canDelete = Boolean(role && !role.isSystem && role.userCount === 0)

    return (
        <PageContainer>
            <PageHeader
                title={roleLabel}
                description="Role details, permissions per submodule, and the users who have this role."
                breadcrumbs={[
                    {
                        label: 'Super Admin Settings',
                        href: SUPER_ADMIN_SETTINGS_PATH,
                    },
                    { label: 'Roles' },
                    { label: roleLabel },
                ]}
                actions={
                    role && !isSuperAdmin ? (
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                icon={<HiOutlineDuplicate />}
                                onClick={() => setCopyDialog('role')}
                            >
                                Clone
                            </Button>
                            <Button
                                size="sm"
                                icon={<HiOutlineDocumentDuplicate />}
                                disabled={dirty}
                                title={
                                    dirty
                                        ? 'Save or reset your permission changes first.'
                                        : undefined
                                }
                                onClick={() => setCopyDialog('template')}
                            >
                                Save as template
                            </Button>
                            {!role.isSystem && (
                                <Button
                                    size="sm"
                                    icon={<HiOutlineTrash />}
                                    disabled={!canDelete}
                                    title={
                                        canDelete
                                            ? undefined
                                            : 'Move every user to another role before deleting this role.'
                                    }
                                    onClick={() => setDeleteOpen(true)}
                                >
                                    Delete
                                </Button>
                            )}
                        </div>
                    ) : null
                }
            />

            <CreateRoleDialog
                isOpen={copyDialog !== null}
                kind={copyDialog ?? 'role'}
                source={copySource}
                onClose={() => setCopyDialog(null)}
                onCreated={(created) => {
                    const asTemplate = copyDialog === 'template'
                    setCopyDialog(null)
                    notify(
                        'success',
                        asTemplate ? 'Template created' : 'Role created',
                        `${created.name} was created from ${roleLabel}.`,
                    )
                    router.push(
                        asTemplate
                            ? superAdminTemplatePath(created.code)
                            : superAdminRolePath(created.code),
                    )
                }}
            />

            <ConfirmDialog
                isOpen={deleteOpen}
                type="danger"
                title="Delete role"
                confirmText="Delete"
                confirmButtonProps={{ loading: deleting }}
                onClose={() => setDeleteOpen(false)}
                onRequestClose={() => setDeleteOpen(false)}
                onCancel={() => setDeleteOpen(false)}
                onConfirm={handleDelete}
            >
                <p>
                    {roleLabel} and its permissions will be permanently deleted.
                    No users currently have this role.
                </p>
            </ConfirmDialog>

            {loading ? (
                <AdaptiveCard>
                    <div className="flex justify-center py-10">
                        <Spinner size={32} />
                    </div>
                </AdaptiveCard>
            ) : loadError ? (
                <AdaptiveCard>
                    <div className="flex flex-col items-start gap-3">
                        <p className="text-sm text-red-500">{loadError}</p>
                        <Button size="sm" onClick={load}>
                            Retry
                        </Button>
                    </div>
                </AdaptiveCard>
            ) : (
                <div className="flex flex-col gap-4">
                    {role && (
                        <RoleDetailsCard
                            role={role}
                            editable={!isSuperAdmin}
                            saving={detailsSaving}
                            onSave={handleSaveDetails}
                        />
                    )}
                    <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <h4 className="heading-text">Permissions</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {editable
                                    ? 'Read, Create, Update and Delete per submodule, grouped by module.'
                                    : 'Super Admin always has full access to every module. These permissions cannot be changed.'}
                            </p>
                        </div>
                        {editable && (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    disabled={!dirty || saving}
                                    onClick={() => setGroups(original)}
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
                                    Save permissions
                                </Button>
                            </div>
                        )}
                    </div>
                    <PermissionMatrix
                        groups={groups}
                        disabled={!editable || saving}
                        onChange={setGroups}
                    />
                    {editable && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Read means the submodule or feature is visible and
                            its records can be read. Create, Update or Delete
                            also grant Read. Submodules that contain features
                            are granted per feature; expand them to set each
                            feature, or use their checkboxes to set all
                            features at once. A module appears in the menu when
                            anything in it is readable. Changes take effect
                            within about 30 seconds.
                        </p>
                    )}
                    <RoleUsersCard roleCode={roleCode} />
                </div>
            )}
        </PageContainer>
    )
}

export default RolePermissionsPage
