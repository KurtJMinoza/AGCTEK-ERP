'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tag from '@/components/ui/Tag'
import useCurrentSession from '@/utils/hooks/useCurrentSession'
import { SUPER_ADMIN_SETTINGS_PATH } from '@/constants/route.constant'
import { apiListRoles } from '@/services/PermissionService'
import {
    HiOutlineBan,
    HiOutlineCheckCircle,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineSearch,
} from 'react-icons/hi'
import UserFormDialog from '../components/UserFormDialog'
import { userManagementService } from '../services/userManagementService'
import type {
    CreateUserPayload,
    ManagedUser,
    UserStatusFilter,
} from '../types'

type FilterOption<T extends string> = { value: T | ''; label: string }

const ALL_ROLES_OPTION: FilterOption<string> = { value: '', label: 'All roles' }

const STATUS_FILTER_OPTIONS: FilterOption<UserStatusFilter>[] = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
]

const SEARCH_DEBOUNCE_MS = 300

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

function fullName(user: ManagedUser) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ')
}

const UserManagementPage = () => {
    const { session } = useCurrentSession()
    const currentUserId = session?.user?.id

    const [users, setUsers] = useState<ManagedUser[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState('')
    const [roleFilterOptions, setRoleFilterOptions] = useState<FilterOption<string>[]>([ALL_ROLES_OPTION])
    const [statusFilter, setStatusFilter] = useState<UserStatusFilter | ''>('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    const [formOpen, setFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
    const [editing, setEditing] = useState<ManagedUser | null>(null)
    const [saving, setSaving] = useState(false)

    const [statusTarget, setStatusTarget] = useState<ManagedUser | null>(null)
    const [statusSaving, setStatusSaving] = useState(false)

    useEffect(() => {
        apiListRoles()
            .then((roles) =>
                setRoleFilterOptions([
                    ALL_ROLES_OPTION,
                    ...roles.map((r) => ({ value: r.code, label: r.name })),
                ]),
            )
            .catch(() => setRoleFilterOptions([ALL_ROLES_OPTION]))
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput.trim())
            setPage(1)
        }, SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [searchInput])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await userManagementService.list({
                search: search || undefined,
                role: roleFilter || undefined,
                status: statusFilter || undefined,
                page,
                pageSize,
            })
            setUsers(res.data)
            setTotal(res.total)
        } catch (error) {
            notify('danger', 'Unable to load users', errorMessage(error, 'Please try again.'))
        } finally {
            setLoading(false)
        }
    }, [search, roleFilter, statusFilter, page, pageSize])

    useEffect(() => {
        load()
    }, [load])

    const openCreate = () => {
        setFormMode('create')
        setEditing(null)
        setFormOpen(true)
    }

    const openEdit = useCallback((user: ManagedUser) => {
        setFormMode('edit')
        setEditing(user)
        setFormOpen(true)
    }, [])

    const handleSubmit = async (values: CreateUserPayload) => {
        setSaving(true)
        try {
            if (formMode === 'create') {
                await userManagementService.create(values)
                notify('success', 'User created', `${values.userName} can now sign in.`)
            } else if (editing) {
                const { password: _password, ...rest } = values
                const payload =
                    editing.id === currentUserId
                        ? { ...rest, role: undefined }
                        : rest
                await userManagementService.update(editing.id, payload)
                notify('success', 'User updated', `${values.userName} was updated.`)
            }
            setFormOpen(false)
            await load()
        } catch (error) {
            notify('danger', 'Save failed', errorMessage(error, 'Unable to save user.'))
        } finally {
            setSaving(false)
        }
    }

    const handleConfirmStatus = async () => {
        if (!statusTarget) return
        const nextActive = !statusTarget.isActive
        setStatusSaving(true)
        try {
            await userManagementService.setStatus(statusTarget.id, nextActive)
            notify(
                'success',
                nextActive ? 'User activated' : 'User deactivated',
                `${statusTarget.userName} is now ${nextActive ? 'active' : 'inactive'}.`,
            )
            setStatusTarget(null)
            await load()
        } catch (error) {
            notify('danger', 'Update failed', errorMessage(error, 'Unable to update status.'))
        } finally {
            setStatusSaving(false)
        }
    }

    const columns: ColumnDef<ManagedUser>[] = useMemo(
        () => [
            {
                header: 'Name',
                id: 'name',
                cell: ({ row }) => {
                    const user = row.original
                    const name = fullName(user)
                    return (
                        <div className="min-w-0">
                            <div className="truncate font-semibold heading-text">
                                {name || user.userName}
                                {user.id === currentUserId ? (
                                    <span className="ml-2 text-xs font-normal text-gray-400">
                                        (you)
                                    </span>
                                ) : null}
                            </div>
                            {name ? (
                                <div className="truncate text-xs text-gray-500">
                                    @{user.userName}
                                </div>
                            ) : null}
                        </div>
                    )
                },
            },
            { header: 'Email', accessorKey: 'email' },
            {
                header: 'Role',
                accessorKey: 'role',
                cell: ({ row }) => (
                    <Tag className="border-0 bg-primary-subtle text-primary">
                        {row.original.roleName || row.original.role}
                    </Tag>
                ),
            },
            {
                header: 'Default company',
                id: 'defaultCompany',
                cell: ({ row }) => {
                    const { defaultCompany, companyCount = 0 } = row.original
                    if (!defaultCompany) {
                        return <span className="text-xs text-gray-400">None</span>
                    }
                    return (
                        <span className="whitespace-nowrap">
                            {defaultCompany.code}
                            {companyCount > 1 ? (
                                <span className="ml-1 text-xs text-gray-400">
                                    +{companyCount - 1}
                                </span>
                            ) : null}
                        </span>
                    )
                },
            },
            {
                header: 'Status',
                accessorKey: 'isActive',
                cell: ({ row }) =>
                    row.original.isActive ? (
                        <StatusBadge tone="success">Active</StatusBadge>
                    ) : (
                        <StatusBadge tone="danger">Inactive</StatusBadge>
                    ),
            },
            {
                header: 'Created',
                accessorKey: 'createdAt',
                cell: ({ row }) =>
                    new Date(row.original.createdAt).toLocaleDateString(),
            },
            {
                id: 'actions',
                header: '',
                size: 56,
                cell: ({ row }) => {
                    const user = row.original
                    const isSelf = user.id === currentUserId
                    return (
                        <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                            <Dropdown.Item eventKey="edit" onClick={() => openEdit(user)}>
                                <HiOutlinePencil className="text-base" />
                                <span>Edit</span>
                            </Dropdown.Item>
                            {!isSelf ? (
                                <Dropdown.Item
                                    eventKey="status"
                                    onClick={() => setStatusTarget(user)}
                                >
                                    {user.isActive ? (
                                        <>
                                            <HiOutlineBan className="text-base text-red-500" />
                                            <span className="text-red-500">Deactivate</span>
                                        </>
                                    ) : (
                                        <>
                                            <HiOutlineCheckCircle className="text-base text-emerald-600" />
                                            <span>Activate</span>
                                        </>
                                    )}
                                </Dropdown.Item>
                            ) : null}
                        </Dropdown>
                    )
                },
            },
        ],
        [currentUserId, openEdit],
    )

    return (
        <PageContainer>
            <PageHeader
                title="User Management"
                description="Create users, assign roles, and control account access."
                breadcrumbs={[
                    { label: 'Super Admin Settings', href: SUPER_ADMIN_SETTINGS_PATH },
                    { label: 'User Management' },
                ]}
                actions={
                    <Button
                        variant="solid"
                        size="sm"
                        icon={<HiOutlinePlus />}
                        onClick={openCreate}
                    >
                        Create user
                    </Button>
                }
            />

            <AdaptiveCard>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search name, username, email…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                    <Select<FilterOption<string>>
                        options={roleFilterOptions}
                        value={roleFilterOptions.find((o) => o.value === roleFilter) ?? ALL_ROLES_OPTION}
                        onChange={(opt) => {
                            setRoleFilter(opt?.value ?? '')
                            setPage(1)
                        }}
                    />
                    <Select<FilterOption<UserStatusFilter>>
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => {
                            setStatusFilter(opt?.value ?? '')
                            setPage(1)
                        }}
                    />
                </div>

                <div className="mt-4">
                    <DataTable<ManagedUser>
                        columns={columns}
                        data={users}
                        compact
                        loading={loading}
                        noData={!loading && users.length === 0}
                        pagingData={{ total, pageIndex: page, pageSize }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => {
                            setPageSize(size)
                            setPage(1)
                        }}
                    />
                </div>
            </AdaptiveCard>

            <UserFormDialog
                isOpen={formOpen}
                mode={formMode}
                user={editing}
                saving={saving}
                lockRole={formMode === 'edit' && editing?.id === currentUserId}
                onClose={() => setFormOpen(false)}
                onSubmit={handleSubmit}
                onMembershipChange={load}
            />

            <ConfirmDialog
                isOpen={Boolean(statusTarget)}
                type={statusTarget?.isActive ? 'danger' : 'success'}
                title={statusTarget?.isActive ? 'Deactivate user' : 'Activate user'}
                confirmText={statusTarget?.isActive ? 'Deactivate' : 'Activate'}
                confirmButtonProps={{ loading: statusSaving }}
                onClose={() => setStatusTarget(null)}
                onRequestClose={() => setStatusTarget(null)}
                onCancel={() => setStatusTarget(null)}
                onConfirm={handleConfirmStatus}
            >
                <p>
                    {statusTarget?.isActive
                        ? `${statusTarget?.userName} will no longer be able to sign in. You can reactivate the account later.`
                        : `${statusTarget?.userName} will be able to sign in again.`}
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default UserManagementPage
