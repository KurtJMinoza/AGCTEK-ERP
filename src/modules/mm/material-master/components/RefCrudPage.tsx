'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import Upload from '@/components/ui/Upload'
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineSearch } from 'react-icons/hi'
import { PiImageDuotone } from 'react-icons/pi'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
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

const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

function FileFieldInput<T extends { id: string }>({
    field,
    editing,
    value,
    onChange,
}: {
    field: RefCrudField
    editing: T | null
    value: unknown
    onChange: (file: File | null) => void
}) {
    const existingUrl =
        field.existingUrlField && editing
            ? String((editing as Record<string, unknown>)[field.existingUrlField] ?? '')
            : ''
    const previewUrl = useMemo(() => {
        if (value instanceof File) return URL.createObjectURL(value)
        return existingUrl || ''
    }, [value, existingUrl])

    useEffect(() => {
        if (!(value instanceof File) || !previewUrl.startsWith('blob:')) return
        return () => URL.revokeObjectURL(previewUrl)
    }, [value, previewUrl])

    const fileList = value instanceof File ? [value] : []

    return (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-900/50 lg:w-36">
                {previewUrl ? (
                    <img
                        src={previewUrl}
                        alt=""
                        className="h-28 w-28 rounded-lg object-contain"
                    />
                ) : (
                    <div className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-lg bg-gray-50 text-gray-400 dark:bg-gray-800">
                        <PiImageDuotone className="text-3xl" />
                        <span className="text-[10px] font-medium uppercase tracking-wide">
                            Preview
                        </span>
                    </div>
                )}
                {value instanceof File ? (
                    <span className="mt-2 max-w-full truncate text-center text-xs text-gray-500">
                        {value.name}
                    </span>
                ) : existingUrl ? (
                    <span className="mt-2 text-center text-xs text-gray-500">Current logo</span>
                ) : null}
            </div>
            <div className="min-w-0 flex-1">
                <Upload
                    key={value instanceof File ? value.name : 'logo-empty'}
                    draggable
                    accept={field.accept ?? LOGO_ACCEPT}
                    uploadLimit={1}
                    showList={false}
                    fileList={fileList}
                    className="min-h-[9.5rem] w-full"
                    onChange={(files) => onChange(files[0] ?? null)}
                >
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-subtle text-primary-deep">
                            <PiImageDuotone className="text-2xl" />
                        </span>
                        <p className="text-sm font-semibold heading-text">
                            Drop your logo here, or{' '}
                            <span className="text-primary">browse</span>
                        </p>
                        <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400">
                            {field.helpText ??
                                'PNG, JPG, WEBP, or GIF. Recommended square image, max 5 MB.'}
                        </p>
                    </div>
                </Upload>
                {previewUrl && (value instanceof File || existingUrl) ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="plain"
                        className="mt-2"
                        onClick={() => onChange(null)}
                    >
                        Clear selection
                    </Button>
                ) : null}
            </div>
        </div>
    )
}

function RefCrudFormSection({
    title,
    description,
    children,
}: {
    title: string
    description?: string
    children: ReactNode
}) {
    return (
        <section className="rounded-xl border border-gray-200/80 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-800/25">
            <div className="border-b border-gray-200/80 px-4 py-3 dark:border-gray-700 sm:px-5">
                <h6 className="text-sm font-semibold heading-text">{title}</h6>
                {description ? (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
                ) : null}
            </div>
            <div className="space-y-1 px-4 py-4 sm:px-5 sm:py-5">{children}</div>
        </section>
    )
}

export interface RefCrudField {
    key: string
    label: string
    required?: boolean
    type?: 'text' | 'number' | 'select' | 'textarea' | 'file'
    minLength?: number
    maxLength?: number
    /** When `type` is `file`, existing URL on the row (e.g. `logoUrl`) satisfies required on edit. */
    existingUrlField?: string
    accept?: string
    /** System-assigned on create; shown read-only in the form */
    autoGenerate?: boolean
    autoGenerateHint?: string
    placeholder?: string
    helpText?: string
    options?: { value: string; label: string }[]
    isClearable?: boolean
    /** Grid columns in sectioned forms (default 1). */
    colSpan?: 1 | 2
}

export interface RefCrudFormSectionConfig {
    title: string
    description?: string
    keys: string[]
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
    prepareFormOpen?: () => void | Promise<void>
    /** Multipart or custom save (e.g. company logo upload). */
    saveItem?: (args: {
        editing: T | null
        payload: Record<string, unknown>
        formData: Record<string, unknown>
    }) => Promise<T>
    formDialogSize?: 'sm' | 'md' | 'lg' | 'xl'
    formSections?: RefCrudFormSectionConfig[]
    formDialogIcon?: React.ReactNode
    formDialogTitle?: (editing: T | null) => React.ReactNode
    formDialogDescription?: (editing: T | null) => React.ReactNode
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
    prepareFormOpen,
    saveItem,
    formDialogSize = 'md',
    formSections,
    formDialogIcon,
    formDialogTitle,
    formDialogDescription,
}: RefCrudPageProps<T>) {
    const breadcrumbItems = buildErpBreadcrumbs(routePath)
    const { canCreate, canUpdate, canDelete } = useResourceAccess()
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
            if (f.type === 'file') {
                const hasFile = value instanceof File
                const existingUrl =
                    f.existingUrlField && editing
                        ? String((editing as Record<string, unknown>)[f.existingUrlField] ?? '')
                        : ''
                errors[f.key] = firstError(
                    f.required && !hasFile && !existingUrl
                        ? required('', f.label)
                        : undefined,
                )
            } else if (f.type === 'number') {
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

    const openCreate = async () => {
        await prepareFormOpen?.()
        setEditing(null)
        const blank: Record<string, any> = {}
        fields.forEach((f) => {
            if (f.type === 'file') blank[f.key] = null
            else blank[f.key] = f.type === 'number' ? '' : ''
        })
        setFormData(blank)
        setTouched({})
        setForceValidate(false)
        setFormOpen(true)
    }

    const openEdit = async (item: T) => {
        await prepareFormOpen?.()
        setEditing(item)
        const data: Record<string, any> = {}
        fields.forEach((f) => {
            if (f.type === 'file') data[f.key] = null
            else data[f.key] = (item as any)[f.key] ?? ''
        })
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
                if (f.type === 'file') continue
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
            if (saveItem) {
                await saveItem({ editing, payload, formData })
                pushToast('success', editing ? 'Updated' : 'Created', `${title} ${editing ? 'updated' : 'created'}.`)
            } else if (editing) {
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
                {canUpdate && (
                    <Dropdown.Item eventKey="edit" onClick={() => openEdit(row.original)}>
                        <HiOutlinePencil className="text-base" /><span>Edit</span>
                    </Dropdown.Item>
                )}
                {canDelete && (
                    <Dropdown.Item eventKey="delete" onClick={() => setDeleting(row.original)}>
                        <HiOutlineTrash className="text-base text-red-500" /><span className="text-red-500">Delete</span>
                    </Dropdown.Item>
                )}
            </Dropdown>
        ),
    }

    const allColumns = [...userColumns, actionCol]

    const filteredItems = useMemo(
        () => filterTableRows(items, search),
        [items, search],
    )

    const fieldByKey = useMemo(
        () => Object.fromEntries(fields.map((f) => [f.key, f])),
        [fields],
    )

    const renderFormField = useCallback(
        (f: RefCrudField) => {
            const message = err(f.key)
            const isAuto = Boolean(f.autoGenerate)
            const displayValue = isAuto
                ? (editing ? String(formData[f.key] ?? '') : (f.autoGenerateHint ?? 'Auto-generated'))
                : (formData[f.key] ?? '')
            const selectOpts = f.options ?? []
            const spanClass =
                f.colSpan === 2 || f.type === 'textarea' || f.type === 'file'
                    ? 'sm:col-span-2'
                    : ''

            return (
                <div key={f.key} className={spanClass}>
                    <FormItem
                        label={f.label}
                        asterisk={f.required && !isAuto}
                        invalid={Boolean(message)}
                        errorMessage={message}
                        className="mb-0"
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
                        ) : f.type === 'textarea' && !isAuto ? (
                            <Input
                                textArea
                                rows={3}
                                value={displayValue}
                                onChange={(e) => setField(f.key, e.target.value)}
                                placeholder={f.placeholder ?? f.label}
                            />
                        ) : f.type === 'file' && !isAuto ? (
                            <FileFieldInput
                                field={f}
                                editing={editing}
                                value={formData[f.key]}
                                onChange={(file) => setField(f.key, file)}
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
                            <p className="mt-1 text-xs text-gray-400">
                                Assigned automatically and cannot be changed.
                            </p>
                        )}
                        {!isAuto && f.helpText && f.type !== 'file' ? (
                            <p className="mt-1 text-xs text-gray-400">{f.helpText}</p>
                        ) : null}
                    </FormItem>
                </div>
            )
        },
        [editing, err, formData, setField],
    )

    const formBody = formSections?.length ? (
        <div className="flex flex-col gap-5">
            {formSections.map((section) => (
                <RefCrudFormSection
                    key={section.title}
                    title={section.title}
                    description={section.description}
                >
                    <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-4">
                        {section.keys.map((key) => {
                            const f = fieldByKey[key]
                            return f ? renderFormField(f) : null
                        })}
                    </div>
                </RefCrudFormSection>
            ))}
        </div>
    ) : (
        <div className="space-y-4">{fields.map((f) => renderFormField(f))}</div>
    )

    const resolvedDialogTitle = formDialogTitle
        ? formDialogTitle(editing)
        : editing
          ? `Edit ${title}`
          : `New ${title}`
    const resolvedDialogDescription = formDialogDescription
        ? formDialogDescription(editing)
        : editing
          ? `Update ${title.toLowerCase()} details.`
          : `Create a new ${title.toLowerCase()}.`
    const resolvedDialogIcon = formDialogIcon ?? (editing ? <HiOutlinePencil /> : <HiOutlinePlus />)

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title={title}
                description={description}
                actions={canCreate ? <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>Add {title.toLowerCase()}</Button> : undefined}
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
                {canDelete && selectedRows.size > 0 && (
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
                size={formDialogSize}
                title={resolvedDialogTitle}
                description={resolvedDialogDescription}
                icon={resolvedDialogIcon}
                bodyClassName={formSections?.length ? '!py-5 !px-4 sm:!px-5' : undefined}
                footer={
                    <>
                        <Button variant="plain" onClick={() => setFormOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="solid"
                            onClick={handleSave}
                            disabled={forceValidate && formInvalid}
                        >
                            {editing ? 'Save changes' : 'Create'}
                        </Button>
                    </>
                }
            >
                {formBody}
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
