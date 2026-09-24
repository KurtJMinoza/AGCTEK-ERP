'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Spinner from '@/components/ui/Spinner'
import { FormItem } from '@/components/ui/Form'
import FileItem from '@/components/ui/Upload/FileItem'
import CloseButton from '@/components/ui/CloseButton'
import DocumentFileDisplay from '@/components/shared/DocumentFileDisplay'
import SpreadsheetPreview from '@/components/shared/SpreadsheetPreview'
import type { SpreadsheetPreviewData } from '@/components/shared/parseSpreadsheetBlob'
import {
    canPreviewFile,
    getFileKind,
    inferMimeType,
} from '@/components/shared/fileTypeUtils'
import classNames from '@/utils/classNames'
import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import {
    HiOutlineEye,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineUpload,
} from 'react-icons/hi'
import { supplierService } from '../services/supplierService'

export type SupplierDocumentRow = {
    id: string
    supplierId?: string
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

const ACCEPT =
    '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function getDocumentApiPath(supplierId: string, documentId: string) {
    return `/mm/suppliers/${supplierId}/documents/${documentId}/file`
}

function hasStoredFile(doc: SupplierDocumentRow): boolean {
    return Boolean(doc.storageKey || doc.fileUrl)
}

type SupplierDocumentsPanelProps = {
    supplierId: string
    compact?: boolean
    showHeader?: boolean
}

const SupplierDocumentsPanel = ({
    supplierId,
    compact = false,
    showHeader = true,
}: SupplierDocumentsPanelProps) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const [items, setItems] = useState<SupplierDocumentRow[]>([])
    const [loading, setLoading] = useState(true)
    const [uploadOpen, setUploadOpen] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [docType, setDocType] = useState('OTHER')
    const [deleting, setDeleting] = useState<SupplierDocumentRow | null>(null)
    const [viewing, setViewing] = useState<SupplierDocumentRow | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewText, setPreviewText] = useState<string | null>(null)
    const [previewSpreadsheet, setPreviewSpreadsheet] =
        useState<SpreadsheetPreviewData | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewError, setPreviewError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setItems(
                (await supplierService.listDocuments(
                    supplierId,
                )) as SupplierDocumentRow[],
            )
        } catch {
            setItems([])
        } finally {
            setLoading(false)
        }
    }, [supplierId])

    useEffect(() => {
        load()
    }, [load])

    useEffect(() => {
        if (!viewing || !hasStoredFile(viewing)) {
            setPreviewUrl(null)
            setPreviewText(null)
            setPreviewSpreadsheet(null)
            setPreviewError(null)
            setPreviewLoading(false)
            return
        }

        let cancelled = false
        let objectUrl: string | null = null
        const resolvedMime = inferMimeType(viewing.fileName, viewing.mimeType)
        const kind = getFileKind(viewing.fileName, resolvedMime)

        const loadPreview = async () => {
            setPreviewLoading(true)
            setPreviewError(null)
            setPreviewUrl(null)
            setPreviewText(null)
            setPreviewSpreadsheet(null)

            try {
                const response = await ErpAxiosBase.get<Blob>(
                    getDocumentApiPath(supplierId, viewing.id),
                    { responseType: 'blob' },
                )

                if (cancelled) return

                const blob =
                    response.data.type && response.data.type !== 'application/octet-stream'
                        ? response.data
                        : new Blob([response.data], { type: resolvedMime })

                if (kind === 'text' || kind === 'csv') {
                    const text = await blob.text()
                    if (!cancelled) setPreviewText(text)
                    return
                }

                if (kind === 'excel') {
                    const { parseSpreadsheetBlob } = await import(
                        '@/components/shared/parseSpreadsheetBlob'
                    )
                    const spreadsheet = await parseSpreadsheetBlob(blob)
                    if (!cancelled) setPreviewSpreadsheet(spreadsheet)
                    return
                }

                objectUrl = URL.createObjectURL(blob)
                if (!cancelled) setPreviewUrl(objectUrl)
            } catch {
                if (!cancelled) {
                    setPreviewError('Unable to load document preview.')
                }
            } finally {
                if (!cancelled) setPreviewLoading(false)
            }
        }

        loadPreview()

        return () => {
            cancelled = true
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [viewing, supplierId])

    const resetUpload = () => {
        setSelectedFile(null)
        setDocType('OTHER')
        setDragOver(false)
        if (inputRef.current) {
            inputRef.current.value = ''
        }
    }

    const pickFile = (file: File | null) => {
        if (!file) return
        if (file.size > 10 * 1024 * 1024) {
            pushToast('danger', 'File too large', 'Maximum file size is 10 MB.')
            return
        }
        setSelectedFile(file)
    }

    const handleUpload = async () => {
        if (!selectedFile) {
            pushToast('danger', 'Validation', 'Choose a file to upload.')
            return
        }
        setUploading(true)
        try {
            await supplierService.uploadDocument(supplierId, selectedFile, docType)
            pushToast('success', 'Uploaded', 'Document saved successfully.')
            setUploadOpen(false)
            resetUpload()
            load()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string | string[] } } }
            const msg = e?.response?.data?.message || 'Upload failed'
            pushToast(
                'danger',
                'Error',
                Array.isArray(msg) ? msg.join(', ') : msg,
            )
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try {
            await supplierService.removeDocument(supplierId, deleting.id)
            pushToast('success', 'Deleted', 'Document removed.')
            setDeleting(null)
            load()
        } catch {
            pushToast('danger', 'Error', 'Delete failed')
        }
    }

    const openExternal = useCallback(
        (doc: SupplierDocumentRow) => {
            const path = getDocumentApiPath(supplierId, doc.id)
            window.open(`${ErpAxiosBase.defaults.baseURL}${path}`, '_blank')
        },
        [supplierId],
    )

    const viewingMime = viewing
        ? inferMimeType(viewing.fileName, viewing.mimeType)
        : ''
    const viewingKind = viewing
        ? getFileKind(viewing.fileName, viewingMime)
        : 'generic'
    const previewable = viewing
        ? canPreviewFile(viewing.fileName, viewing.mimeType)
        : false

    const columns = useMemo<ColumnDef<SupplierDocumentRow>[]>(
        () => [
            {
                header: 'File name',
                accessorKey: 'fileName',
                size: 280,
                cell: ({ row }) => (
                    <DocumentFileDisplay
                        inline
                        fileName={row.original.fileName}
                        mimeType={row.original.mimeType}
                        compact
                    />
                ),
            },
            {
                header: 'Type',
                accessorKey: 'docType',
                size: 120,
                cell: ({ row }) => (
                    <span className="text-sm">
                        {DOC_TYPES.find((o) => o.value === row.original.docType)
                            ?.label ??
                            row.original.docType ??
                            '—'}
                    </span>
                ),
            },
            {
                header: 'Uploaded',
                accessorKey: 'uploadedAt',
                size: 160,
                cell: ({ row }) => (
                    <span className="text-xs">
                        {new Date(row.original.uploadedAt).toLocaleString()}
                    </span>
                ),
            },
            {
                id: 'actions',
                header: '',
                size: 96,
                cell: ({ row }) => (
                    <div className="flex items-center gap-1">
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiOutlineEye />}
                            disabled={!hasStoredFile(row.original)}
                            onClick={() => setViewing(row.original)}
                        />
                        <Button
                            size="xs"
                            variant="plain"
                            icon={
                                <HiOutlineTrash className="text-red-500" />
                            }
                            onClick={() => setDeleting(row.original)}
                        />
                    </div>
                ),
            },
        ],
        [],
    )

    return (
        <div>
            {showHeader ? (
                <div className="mb-4 flex items-center justify-between">
                    <h5 className="text-sm font-semibold">Documents</h5>
                    <Button
                        size="sm"
                        icon={<HiOutlinePlus />}
                        variant="solid"
                        onClick={() => {
                            resetUpload()
                            setUploadOpen(true)
                        }}
                    >
                        Upload document
                    </Button>
                </div>
            ) : null}

            <DataTable
                columns={columns}
                data={items}
                compact={compact}
                fit={compact}
                loading={loading}
                noData={!loading && items.length === 0}
            />

            <FormDialog
                isOpen={uploadOpen}
                onClose={() => {
                    setUploadOpen(false)
                    resetUpload()
                }}
                size="md"
                title="Upload Document"
                description="Drag and drop a file or browse from your computer."
                icon={<HiOutlineUpload />}
                footer={
                    <>
                        <Button
                            size="sm"
                            onClick={() => {
                                setUploadOpen(false)
                                resetUpload()
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={uploading}
                            disabled={!selectedFile}
                            onClick={handleUpload}
                        >
                            Upload
                        </Button>
                    </>
                }
            >
                <FormItem label="Document type">
                    <Select
                        options={DOC_TYPES}
                        value={DOC_TYPES.find((o) => o.value === docType)}
                        onChange={(opt: { value: string } | null) =>
                            setDocType(opt?.value ?? 'OTHER')
                        }
                    />
                </FormItem>

                <FormItem label="File" asterisk>
                    <div
                        className={classNames(
                            'upload upload-draggable relative w-full',
                            dragOver && 'border-primary',
                        )}
                        onDragEnter={(e) => {
                            e.preventDefault()
                            setDragOver(true)
                        }}
                        onDragOver={(e) => {
                            e.preventDefault()
                            setDragOver(true)
                        }}
                        onDragLeave={(e) => {
                            e.preventDefault()
                            setDragOver(false)
                        }}
                        onDrop={(e) => {
                            e.preventDefault()
                            setDragOver(false)
                            pickFile(e.dataTransfer.files?.[0] ?? null)
                        }}
                        onClick={() => inputRef.current?.click()}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            accept={ACCEPT}
                            className="upload-input draggable"
                            onChange={(e) =>
                                pickFile(e.target.files?.[0] ?? null)
                            }
                        />
                        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                            <HiOutlineUpload className="text-2xl text-primary" />
                            <p className="text-sm font-medium heading-text">
                                Drag & drop your file here
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                or click to browse · PDF, images, Office docs ·
                                max 10 MB
                            </p>
                        </div>
                    </div>

                    {selectedFile ? (
                        <div className="upload-file-list mt-3">
                            <div className="upload-file">
                                <FileItem file={selectedFile} />
                                <CloseButton
                                    className="upload-file-remove"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedFile(null)
                                        if (inputRef.current) {
                                            inputRef.current.value = ''
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    ) : null}
                </FormItem>
            </FormDialog>

            <Dialog
                isOpen={Boolean(viewing)}
                onClose={() => setViewing(null)}
                width={900}
            >
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-700">
                    {viewing ? (
                        <DocumentFileDisplay
                            className="flex-1 border-0 bg-transparent p-0"
                            fileName={viewing.fileName}
                            mimeType={viewingMime}
                        />
                    ) : null}
                    {viewing ? (
                        <Button
                            size="sm"
                            variant="plain"
                            onClick={() => openExternal(viewing)}
                        >
                            Open in new tab
                        </Button>
                    ) : null}
                </div>

                <div className="mt-4 min-h-[420px]">
                    {previewLoading ? (
                        <div className="flex h-[420px] items-center justify-center">
                            <Spinner size={36} />
                        </div>
                    ) : previewError ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <p className="text-sm text-red-500">{previewError}</p>
                            {viewing ? (
                                <Button
                                    variant="solid"
                                    onClick={() => openExternal(viewing)}
                                >
                                    Open in new tab
                                </Button>
                            ) : null}
                        </div>
                    ) : !viewing || !hasStoredFile(viewing) ? (
                        <p className="text-sm text-gray-500">
                            No file available to preview.
                        </p>
                    ) : previewable && previewUrl && viewingKind === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={previewUrl}
                            alt={viewing.fileName}
                            className="mx-auto max-h-[70vh] max-w-full rounded-lg"
                        />
                    ) : previewable && previewUrl && viewingKind === 'pdf' ? (
                        <iframe
                            title={viewing.fileName}
                            src={previewUrl}
                            className="h-[70vh] w-full rounded-lg border border-gray-200 dark:border-gray-700"
                        />
                    ) : previewable &&
                      previewSpreadsheet &&
                      viewingKind === 'excel' ? (
                        <SpreadsheetPreview data={previewSpreadsheet} />
                    ) : previewable &&
                      previewText !== null &&
                      (viewingKind === 'text' || viewingKind === 'csv') ? (
                        <pre className="max-h-[70vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs whitespace-pre-wrap dark:border-gray-700 dark:bg-gray-800">
                            {previewText}
                        </pre>
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                            {viewing ? (
                                <DocumentFileDisplay
                                    className="max-w-lg border-0 bg-gray-50 dark:bg-gray-800"
                                    fileName={viewing.fileName}
                                    mimeType={viewingMime}
                                />
                            ) : null}
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                In-browser preview is not supported for{' '}
                                {viewingKind === 'word'
                                    ? 'Word documents'
                                    : 'this file type'}
                                . Open or download the file instead.
                            </p>
                            {viewing ? (
                                <Button
                                    variant="solid"
                                    onClick={() => openExternal(viewing)}
                                >
                                    Download / open file
                                </Button>
                            ) : null}
                        </div>
                    )}
                </div>
            </Dialog>

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                type="danger"
                title="Delete document?"
                confirmText="Delete"
                onRequestClose={() => setDeleting(null)}
                onCancel={() => setDeleting(null)}
                onConfirm={handleDelete}
            >
                <p>
                    Remove{' '}
                    <span className="font-semibold">{deleting?.fileName}</span>{' '}
                    from this supplier?
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default SupplierDocumentsPanel
