'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi'
import { supplierService } from '../services/supplierService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { required, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'
import { useSupplierOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE = '/modules/mm/supplier-management/supplier-documents'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

type DocRow = {
    id: string
    supplierId: string
    fileName: string
    fileUrl?: string | null
    storageKey?: string | null
    mimeType?: string | null
    docType?: string | null
    uploadedBy?: string | null
    uploadedAt: string
}

const DOC_TYPES = [
    { value: 'CONTRACT', label: 'Contract' },
    { value: 'CERTIFICATE', label: 'Certificate' },
    { value: 'TAX', label: 'Tax document' },
    { value: 'OTHER', label: 'Other' },
]

const SupplierDocumentsPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const [supplierId, setSupplierId] = useState('')
    const [items, setItems] = useState<DocRow[]>([])
    const [loading, setLoading] = useState(false)
    const [addOpen, setAddOpen] = useState(false)
    const [deleting, setDeleting] = useState<DocRow | null>(null)
    const [fileName, setFileName] = useState('')
    const [fileUrl, setFileUrl] = useState('')
    const [storageKey, setStorageKey] = useState('')
    const [mimeType, setMimeType] = useState('')
    const [docType, setDocType] = useState('OTHER')
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const { options: supplierOpts } = useSupplierOptions({ enabled: true })

    const fieldErrors = useMemo<FieldErrors>(() => ({
        supplierId: required(supplierId, 'Supplier'),
        fileName: required(fileName, 'File name'),
    }), [supplierId, fileName])
    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)

    const load = useCallback(async () => {
        if (!supplierId) { setItems([]); return }
        setLoading(true)
        try { setItems(await supplierService.listDocuments(supplierId) as DocRow[]) } catch { setItems([]) }
        finally { setLoading(false) }
    }, [supplierId])

    useEffect(() => { load() }, [load])

    const handleAdd = async () => {
        setForceValidate(true)
        if (fieldErrors.supplierId || fieldErrors.fileName) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before saving.')
            return
        }
        try {
            await supplierService.addDocument(supplierId, {
                fileName,
                fileUrl: fileUrl || undefined,
                storageKey: storageKey || undefined,
                mimeType: mimeType || undefined,
                docType,
            })
            pushToast('success', 'Added', 'Document metadata saved.')
            setAddOpen(false)
            setFileName(''); setFileUrl(''); setStorageKey(''); setMimeType(''); setDocType('OTHER')
            setTouched({}); setForceValidate(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Failed')
        }
    }

    const handleDelete = async () => {
        if (!deleting || !supplierId) return
        try {
            await supplierService.removeDocument(supplierId, deleting.id)
            pushToast('success', 'Deleted', 'Document removed.')
            setDeleting(null); load()
        } catch { pushToast('danger', 'Error', 'Delete failed') }
    }

    const columns = useMemo<ColumnDef<DocRow>[]>(() => [
        { header: 'File name', accessorKey: 'fileName', size: 220 },
        { header: 'Type', accessorKey: 'docType', size: 120, cell: ({ row }) => row.original.docType || '—' },
        { header: 'MIME', accessorKey: 'mimeType', size: 120, cell: ({ row }) => row.original.mimeType || '—' },
        { header: 'URL / key', id: 'url', size: 220, cell: ({ row }) => row.original.fileUrl || row.original.storageKey || '—' },
        { header: 'Uploaded', accessorKey: 'uploadedAt', size: 160, cell: ({ row }) => new Date(row.original.uploadedAt).toLocaleString() },
        { id: 'actions', header: '', size: 56, cell: ({ row }) => <Button size="xs" variant="plain" icon={<HiOutlineTrash className="text-red-500" />} onClick={() => setDeleting(row.original)} /> },
    ], [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbs} />
            <PageHeader
                title="Supplier Documents"
                description="Document metadata for suppliers (URL/storage key only)."
                actions={
                    <Button variant="solid" size="sm" icon={<HiOutlinePlus />} disabled={!supplierId} onClick={() => setAddOpen(true)}>
                        Add document
                    </Button>
                }
            />
            <AdaptiveCard>
                <div className="mb-4 max-w-md">
                    <FormItem label="Supplier">
                        <Select
                            isSearchable
                            placeholder="Select supplier…"
                            options={supplierOpts}
                            value={supplierOpts.find((o) => o.value === supplierId) ?? null}
                            onChange={(opt: any) => setSupplierId(opt?.value ?? '')}
                        />
                    </FormItem>
                </div>
                <DataTable columns={columns} data={items} compact loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                size="md"
                title="Add Document"
                description="Store document metadata for this supplier."
                icon={<HiOutlinePlus />}
                footer={<><Button size="sm" onClick={() => setAddOpen(false)}>Cancel</Button><Button size="sm" variant="solid" onClick={handleAdd}>Add</Button></>}
            >
                <FormItem label="File name" asterisk invalid={Boolean(err('fileName'))} errorMessage={err('fileName')}>
                    <Input value={fileName} onChange={(e) => { setFileName(e.target.value); setTouched((t) => ({ ...t, fileName: true })) }} placeholder="e.g. contract-2026.pdf" />
                </FormItem>
                <FormItem label="Document type">
                    <Select options={DOC_TYPES} value={DOC_TYPES.find((o) => o.value === docType)} onChange={(opt: any) => setDocType(opt?.value ?? 'OTHER')} />
                </FormItem>
                <FormItem label="File URL">
                    <Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" />
                </FormItem>
                <FormItem label="Storage key">
                    <Input value={storageKey} onChange={(e) => setStorageKey(e.target.value)} placeholder="Optional storage key" />
                </FormItem>
                <FormItem label="MIME type">
                    <Input value={mimeType} onChange={(e) => setMimeType(e.target.value)} placeholder="application/pdf" />
                </FormItem>
            </FormDialog>

            <ConfirmDialog isOpen={Boolean(deleting)} type="danger" title="Delete document?" confirmText="Delete" onRequestClose={() => setDeleting(null)} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
                <p>Remove document metadata for <span className="font-semibold">{deleting?.fileName}</span>?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default SupplierDocumentsPage
