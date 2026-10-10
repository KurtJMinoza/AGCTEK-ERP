'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import axios from 'axios'
import {
    HiOutlineDuplicate,
    HiOutlinePlus,
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
import {
    SUPER_ADMIN_SETTINGS_PATH,
    superAdminRolePath,
    superAdminTemplatePath,
} from '@/constants/route.constant'
import {
    apiDeleteRoleTemplate,
    apiGetRoleTemplate,
    apiUpdateRoleTemplate,
    apiUpdateRoleTemplatePermissions,
    type RolePermissionGroup,
    type RoleTemplateResponse,
} from '@/services/PermissionService'
import CreateRoleDialog from '../components/CreateRoleDialog'
import PermissionMatrix, {
    sameFlags,
    toPermissionEntries,
} from '../components/PermissionMatrix'
import RoleDetailsCard from '../components/RoleDetailsCard'

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

const RoleTemplatePage = () => {
    const params = useParams()
    const router = useRouter()
    const templateCode = params?.template as string
    const [template, setTemplate] = useState<
        RoleTemplateResponse['template'] | null
    >(null)
    const [original, setOriginal] = useState<RolePermissionGroup[]>([])
    const [groups, setGroups] = useState<RolePermissionGroup[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [detailsSaving, setDetailsSaving] = useState(false)
    const [copyDialog, setCopyDialog] = useState<'role' | 'template' | null>(
        null,
    )
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const applyResponse = (data: RoleTemplateResponse) => {
        setTemplate(data.template)
        setOriginal(data.groups)
        setGroups(data.groups)
    }

    const load = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            applyResponse(await apiGetRoleTemplate(templateCode))
        } catch (error) {
            setLoadError(errorMessage(error, 'Failed to load the template.'))
        } finally {
            setLoading(false)
        }
    }, [templateCode])

    useEffect(() => {
        load()
    }, [load])

    const dirty = useMemo(
        () => !sameFlags(groups, original),
        [groups, original],
    )

    const copySource = useMemo(
        () =>
            template
                ? {
                      type: 'template' as const,
                      code: template.code,
                      name: template.name,
                  }
                : null,
        [template],
    )

    const handleSave = async () => {
        setSaving(true)
        try {
            const data = await apiUpdateRoleTemplatePermissions(
                templateCode,
                toPermissionEntries(groups),
            )
            applyResponse(data)
            notify(
                'success',
                'Template saved',
                `${data.template.name} permissions updated. Existing roles are not affected.`,
            )
        } catch (error) {
            notify(
                'danger',
                'Save failed',
                errorMessage(error, 'Failed to save template permissions.'),
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
            const updated = await apiUpdateRoleTemplate(templateCode, values)
            setTemplate((prev) =>
                prev
                    ? {
                          ...prev,
                          name: updated.name,
                          description: updated.description,
                      }
                    : prev,
            )
            notify(
                'success',
                'Template updated',
                `${updated.name} details saved.`,
            )
        } catch (error) {
            notify(
                'danger',
                'Save failed',
                errorMessage(error, 'Failed to save template details.'),
            )
        } finally {
            setDetailsSaving(false)
        }
    }

    const handleDelete = async () => {
        setDeleting(true)
        try {
            await apiDeleteRoleTemplate(templateCode)
            notify(
                'success',
                'Template deleted',
                `${template?.name ?? templateCode} was deleted.`,
            )
            router.push(SUPER_ADMIN_SETTINGS_PATH)
        } catch (error) {
            notify(
                'danger',
                'Delete failed',
                errorMessage(error, 'Failed to delete the template.'),
            )
            setDeleting(false)
            setDeleteOpen(false)
        }
    }

    const label = template?.name ?? templateCode

    return (
        <PageContainer>
            <PageHeader
                title={label}
                description="A permission blueprint for creating roles. Templates are never assigned to users and never grant access."
                breadcrumbs={[
                    {
                        label: 'Super Admin Settings',
                        href: SUPER_ADMIN_SETTINGS_PATH,
                    },
                    { label: 'Role Templates' },
                    { label },
                ]}
                actions={
                    template ? (
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<HiOutlinePlus />}
                                disabled={dirty}
                                title={
                                    dirty
                                        ? 'Save or reset your permission changes first.'
                                        : undefined
                                }
                                onClick={() => setCopyDialog('role')}
                            >
                                Create role from template
                            </Button>
                            <Button
                                size="sm"
                                icon={<HiOutlineDuplicate />}
                                disabled={dirty}
                                onClick={() => setCopyDialog('template')}
                            >
                                Duplicate
                            </Button>
                            <Button
                                size="sm"
                                icon={<HiOutlineTrash />}
                                onClick={() => setDeleteOpen(true)}
                            >
                                Delete
                            </Button>
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
                        `${created.name} was created from ${label}.`,
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
                title="Delete template"
                confirmText="Delete"
                confirmButtonProps={{ loading: deleting }}
                onClose={() => setDeleteOpen(false)}
                onRequestClose={() => setDeleteOpen(false)}
                onCancel={() => setDeleteOpen(false)}
                onConfirm={handleDelete}
            >
                <p>
                    {label} will be permanently deleted. Roles created from it
                    keep their own permissions.
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
                    {template && (
                        <RoleDetailsCard
                            role={template}
                            editable
                            saving={detailsSaving}
                            onSave={handleSaveDetails}
                        />
                    )}
                    <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <h4 className="heading-text">Permissions</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Copied into a role when the role is created from
                                this template. Editing the template later does
                                not change existing roles.
                            </p>
                        </div>
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
                    </div>
                    <PermissionMatrix
                        groups={groups}
                        disabled={saving}
                        onChange={setGroups}
                    />
                </div>
            )}
        </PageContainer>
    )
}

export default RoleTemplatePage
