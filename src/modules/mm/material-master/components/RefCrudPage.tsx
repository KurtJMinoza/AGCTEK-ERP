'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineSearch } from 'react-icons/hi'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { getApiErrorMessage } from '@/modules/mm/shared/apiError'
import { filterTableRows } from '@/modules/mm/shared/clientTableFilter'
import {
    firstError,
    hasErrors,
    maxLength,
    minLength,
    nonNegativeNumber,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

export interface RefCrudField {
    key: string
    label: string
    required?: boolean
    type?: 'text' | 'number' | 'select'
    minLength?: number
    maxLength?: number
    /** System-assigned on create; shown read-only in the form */
    autoGenerate?: boolean
    autoGenerateHint?: string
    placeholder?: string
    helpText?: string
    options?: { value: string; label: string }[]
    isClearable?: boolean
}

interface RefCrudPageProps<T extends { id: string }> {
    routePath: string
    title: string
    description: string
    fields: RefCrudField[]
    columns: ColumnDef<T>[]
    fetchAll: () => Promise<T[]>
    createItem: (data: any) => Promise<T>
    updateItem: (id: string, data: any) => Promise<T>
    deleteItem: (id: string) => Promise<any>
    getItemLabel?: (item: T) => string
}

export default function RefCrudPage<T extends { id: string }>({
    routePath,
    title,
    description,
    fields,
    columns: userColumns,
    fetchAll,
    createItem,
    updateItem,
    deleteItem,
    getItemLabel,
}: RefCrudPageProps<T>) {
    const breadcrumbItems = buildErpBreadcrumbs(routePath)
    const [search, setSearch] = useState('')
    const [items, setItems] = useState<T[]>([])
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<T | null>(null)
    const [deleting, setDeleting] = useState<T | null>(null)
    const [formData, setFormData] = useState<Record<string, any>>({})
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)

    // Keep latest fetchAll without putting it in effect deps — inline
    // fetchAll props would otherwise retrigger load every render (infinite loop).
    const fetchAllRef = useRef(fetchAll)
    fetchAllRef.current = fetchAll

    const load = useCallback(async () => {
        setLoading(true)
        try { setItems(await fetchAllRef.current()) } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    const fieldErrors = useMemo<FieldErrors>(() => {
        const errors: FieldErrors = {}
        for (const f of fields) {
            if (f.autoGenerate && !editing) continue
            const value = formData[f.key]
            if (f.type === 'number') {
                errors[f.key] = firstError(
                    f.required ? required(value === '' || value == null ? '' : value, f.label) : undefined,
                    nonNegativeNumber(value, f.label),
                )
            } else {
                errors[f.key] = firstError(
                    f.required ? required(value, f.label) : undefined,
                    f.minLength ? minLength(String(value ?? ''), f.minLength, f.label) : undefined,
                    f.maxLength ? maxLength(String(value ?? ''), f.maxLength, f.label) : undefined,
                )
            }
        }
        return errors
    }, [fields, formData, editing])

    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)
    const formInvalid = hasErrors(fieldErrors)

    const setField = (key: string, value: unknown) => {
        setFormData((prev) => ({ ...prev, [key]: value }))
        setTouched((t) => ({ ...t, [key]: true }))
    }

    const openCreate = () => {
        setEditing(null)
        const blank: Record<string, any> = {}
        fields.forEach((f) => { blank[f.key] = f.type === 'number' ? '' : '' })
        setFormData(blank)
        setTouched({})
        setForceValidate(false)
        setFormOpen(true)
    }

    const openEdit = (item: T) => {
        setEditing(item)
        const data: Record<string, any> = {}
        fields.forEach((f) => { data[f.key] = (item as any)[f.key] ?? '' })
        setFormData(data)
        setTouched({})
        setForceValidate(false)
        setFormOpen(true)
    }

    const handleSave = async () => {
        setForceValidate(true)
        if (formInvalid) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before saving.')
            return
        }
        try {
            const payload: Record<string, any> = {}
            for (const f of fields) {
                if (f.autoGenerate) {
                    // Omit on create (server generates); never send on edit (immutable)
                    if (!editing) continue
                    continue
                }
                const raw = formData[f.key]
                if (f.type === 'number') {
                    if (raw === '' || raw == null) {
                        if (!f.required) continue
                        payload[f.key] = 0
                    } else {
                        payload[f.key] = Number(raw)
                    }
                } else if (raw !== '' && raw != null) {
                    payload[f.key] = typeof raw === 'string' ? raw.trim() : raw
                } else if (f.required) {
                    payload[f.key] = ''
                }
            }
            if (editing) {
                await updateItem(editing.id, payload)
                pushToast('success', 'Updated', `${title} updated.`)
            } else {
                await createItem(payload)
                pushToast('success', 'Created', `${title} created.`)
            }
            setFormOpen(false)
            load()
        } catch (e: unknown) {
            pushToast('danger', 'Error', getApiErrorMessage(e, 'Operation failed'))
        }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try {
            await deleteItem(deleting.id)
            pushToast('success', 'Deleted', `${getItemLabel?.(deleting) ?? title} removed.`)
            setDeleting(null)
            load()
        } catch (e: unknown) {
            pushToast('danger', 'Error', getApiErrorMessage(e, 'Delete failed'))
        }
    }

    const handleCheckBoxChange = useCallback((checked: boolean, row: T) => {
        setSelectedRows((prev) => {
            const next = new Set(prev)
            if (checked) next.add(row.id)
            else next.delete(row.id)
            return next
        })
    }, [])

    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: T }[]) => {
        setSelectedRows((prev) => {
            const next = new Set(prev)
            for (const r of rows) {
                if (checked) next.add(r.original.id)
                else next.delete(r.original.id)
            }
            return next
        })
    }, [])

    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            const ids = Array.from(selectedRows)
            await Promise.all(ids.map((id) => deleteItem(id)))
            pushToast('success', 'Bulk delete', `${ids.length} item(s) deleted.`)
            setSelectedRows(new Set())
            setBulkDeleteOpen(false)
            load()
        } catch (e: unknown) {
            pushToast('danger', 'Error', getApiErrorMessage(e, 'Some deletions failed'))
        } finally {
            setBulkDeleting(false)
        }
    }, [selectedRows, deleteItem, load])

    const actionCol: ColumnDef<T> = {
        id: 'actions',
        header: '',
        enableSorting: false,
        size: 56,
        cell: ({ row }) => (
            <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                <Dropdown.Item eventKey="edit" onClick={() => openEdit(row.original)}>
                    <HiOutlinePencil className="text-base" /><span>Edit</span>
                </Dropdown.Item>
                <Dropdown.Item eventKey="delete" onClick={() => setDeleting(row.original)}>
                    <HiOutlineTrash className="text-base text-red-500" /><span className="text-red-500">Delete</span>
                </Dropdown.Item>
            </Dropdown>
        ),
    }

    const allColumns = [...userColumns, actionCol]

    const filteredItems = useMemo(
        () => filterTableRows(items, search),
        [items, search],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title={title}
                description={description}
                actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>Add {title.toLowerCase()}</Button>}
            />
            <AdaptiveCard>
                <div className="mb-4 max-w-md">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder={`Search ${title.toLowerCase()}…`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                {selectedRows.size > 0 && (
                    <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">
                            {selectedRows.size} item{selectedRows.size > 1 ? 's' : ''} selected
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            <Button size="xs" onClick={() => setSelectedRows(new Set())}>Clear selection</Button>
                            <Button size="xs" variant="solid" customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'} icon={<HiOutlineTrash />} onClick={() => setBulkDeleteOpen(true)}>
                                Delete selected
                            </Button>
                        </div>
                    </div>
                )}
                <DataTable<T>
                    columns={allColumns}
                    data={filteredItems}
                    compact
                    loading={loading}
                    noData={!loading && filteredItems.length === 0}
                    selectable
                    checkboxChecked={(row) => selectedRows.has(row.id)}
                    onCheckBoxChange={handleCheckBoxChange}
                    onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)}
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                size="md"
                title={editing ? `Edit ${title}` : `New ${title}`}
                description={editing ? `Update ${title.toLowerCase()} details.` : `Create a new ${title.toLowerCase()}.`}
                icon={editing ? <HiOutlinePencil /> : <HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleSave} disabled={forceValidate && formInvalid}>
                            {editing ? 'Save' : 'Create'}
                        </Button>
                    </>
                }
            >
                {fields.map((f) => {
                    const message = err(f.key)
                    const isAuto = Boolean(f.autoGenerate)
                    const displayValue = isAuto
                        ? (editing ? String(formData[f.key] ?? '') : (f.autoGenerateHint ?? 'Auto-generated'))
                        : (formData[f.key] ?? '')
                    const selectOpts = f.options ?? []
                    return (
                        <FormItem
                            key={f.key}
                            label={f.label}
                            asterisk={f.required && !isAuto}
                            invalid={Boolean(message)}
                            errorMessage={message}
                        >
                            {f.type === 'select' && !isAuto ? (
                                <Select
                                    isSearchable
                                    isClearable={f.isClearable}
                                    placeholder={f.placeholder ?? `Select ${f.label.toLowerCase()}…`}
                                    options={selectOpts}
                                    value={selectOpts.find((o) => o.value === formData[f.key]) ?? null}
                                    onChange={(opt: any) => setField(f.key, opt?.value ?? '')}
                                />
                            ) : (
                                <Input
                                    type={f.type === 'number' ? 'number' : 'text'}
                                    value={displayValue}
                                    disabled={isAuto}
                                    className={isAuto ? '!bg-gray-100 dark:!bg-gray-700/50' : undefined}
                                    onChange={(e) => setField(
                                        f.key,
                                        f.type === 'number' ? e.target.value : e.target.value,
                                    )}
                                    placeholder={f.placeholder ?? f.label}
                                />
                            )}
                            {isAuto && (
                                <p className="mt-1 text-xs text-gray-400">Assigned automatically and cannot be changed.</p>
                            )}
                            {!isAuto && f.helpText && (
                                <p className="mt-1 text-xs text-gray-400">{f.helpText}</p>
                            )}
                        </FormItem>
                    )
                })}
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                type="danger"
                title={`Delete ${title.toLowerCase()}?`}
                confirmText="Delete"
                onRequestClose={() => setDeleting(null)}
                onCancel={() => setDeleting(null)}
                onConfirm={handleDelete}
            >
                <p>Are you sure you want to delete <span className="font-semibold">{deleting ? getItemLabel?.(deleting) ?? '' : ''}</span>?</p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={bulkDeleteOpen}
                type="danger"
                title={`Delete ${selectedRows.size} item${selectedRows.size > 1 ? 's' : ''}?`}
                confirmText={`Delete ${selectedRows.size}`}
                onRequestClose={() => setBulkDeleteOpen(false)}
                onCancel={() => setBulkDeleteOpen(false)}
                onConfirm={handleBulkDelete}
                confirmButtonProps={{
                    loading: bulkDeleting,
                    customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white',
                }}
            >
                <p>This will permanently delete the selected items. This action cannot be undone.</p>
            </ConfirmDialog>
        </PageContainer>
    )
}
