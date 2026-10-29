'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import SupportingOpsResponsiveTable, {
    type ColumnDef,
} from '../components/SupportingOpsResponsiveTable'
import {
    SOP_DOCUMENT_STATUS,
    SopAnimatedStatus,
    SopDocCell,
    SopMethodTag,
    SopPlainCell,
    sopStatusTone,
} from '../components/supportingOpsTableUi'
import { supportingOpsParentBreadcrumbs } from '../utils/supportingOpsPageUi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FormDialog from '@/components/shared/FormDialog'
import { FormItem } from '@/components/ui/Form'
import { supportingOpsService } from '../services/supportingOpsService'

const ROUTE = '/modules/mm/supporting-operations/document-management'

type DocRow = {
    id: string
    documentNumber: string
    title?: string
    documentType?: string
    status?: string
    currentRevision?: string | number
}

const DocumentManagementPage = () => {
    const parentBreadcrumbs = supportingOpsParentBreadcrumbs(ROUTE)
    const [companyId, setCompanyId] = useState('')
    const [rows, setRows] = useState<DocRow[]>([])
    const [loading, setLoading] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)
    const [detail, setDetail] = useState<any | null>(null)
    const [form, setForm] = useState({
        companyId: '',
        title: '',
        documentType: 'WORK_INSTRUCTION',
        department: '',
    })
    const [upload, setUpload] = useState({
        revisionNumber: '1.0',
        changeSummary: '',
        file: null as File | null,
    })

    const load = useCallback(async () => {
        if (!companyId.trim()) return
        setLoading(true)
        try {
            const res = await supportingOpsService.listDocuments({
                companyId: companyId.trim(),
                pageSize: 50,
            })
            setRows(res.data)
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const openDetail = useCallback(async (id: string) => {
        const doc = await supportingOpsService.getDocument(id)
        setDetail(doc)
    }, [])

    const fileToBase64 = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                const s = String(reader.result ?? '')
                resolve(s.includes(',') ? s.split(',')[1] : s)
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
        })

    const columns: ColumnDef<DocRow>[] = useMemo(
        () => [
            {
                header: 'Document',
                cell: ({ row }) => (
                    <SopDocCell
                        icon="document"
                        primary={row.original.documentNumber}
                        secondary={row.original.title}
                    />
                ),
            },
            {
                header: 'Type',
                cell: ({ row }) => (
                    <SopMethodTag label={row.original.documentType} />
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) =>
                    row.original.status ? (
                        <SopAnimatedStatus
                            status={row.original.status}
                            tone={sopStatusTone(row.original.status, SOP_DOCUMENT_STATUS)}
                        />
                    ) : (
                        <SopPlainCell muted>—</SopPlainCell>
                    ),
            },
            {
                header: 'Revision',
                cell: ({ row }) => (
                    <SopPlainCell mono>
                        {row.original.currentRevision != null
                            ? String(row.original.currentRevision)
                            : '—'}
                    </SopPlainCell>
                ),
            },
            {
                header: '',
                id: 'view',
                cell: ({ row }) => (
                    <Button size="xs" onClick={() => openDetail(row.original.id)}>
                        Open
                    </Button>
                ),
            },
        ],
        [openDetail],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Document Management"
                description="Controlled documents — approved revisions are immutable; effective version is not overwritten."
                breadcrumbs={parentBreadcrumbs}
                actions={
                    <Button
                        variant="solid"
                        onClick={() => {
                            setForm((f) => ({ ...f, companyId: companyId.trim() }))
                            setCreateOpen(true)
                        }}
                    >
                        New document
                    </Button>
                }
            />
            <AdaptiveCard>
                <Input
                    className="mb-4 max-w-md"
                    placeholder="Company ID"
                    value={companyId}
                    onChange={(e: any) => setCompanyId(e.target.value)}
                />
                <SupportingOpsResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    hidePagination
                    tableMinWidthClass="min-w-[880px]"
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Create controlled document"
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            onClick={async () => {
                                await supportingOpsService.createDocument(form)
                                setCreateOpen(false)
                                load()
                            }}
                        >
                            Create
                        </Button>
                    </>
                }
            >
                <FormItem label="Company ID">
                    <Input
                        value={form.companyId}
                        onChange={(e: any) => setForm((f) => ({ ...f, companyId: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Title">
                    <Input
                        value={form.title}
                        onChange={(e: any) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Document type">
                    <Input
                        value={form.documentType}
                        onChange={(e: any) =>
                            setForm((f) => ({ ...f, documentType: e.target.value }))
                        }
                    />
                </FormItem>
            </FormDialog>

            <FormDialog
                isOpen={!!detail}
                onClose={() => setDetail(null)}
                title={detail?.documentNumber ?? 'Document'}
                footer={
                    detail ? (
                        <>
                            <Button
                                size="sm"
                                onClick={async () => {
                                    await supportingOpsService.submitDocument(detail.id, 'current-user')
                                    openDetail(detail.id)
                                    load()
                                }}
                            >
                                Submit for review
                            </Button>
                            <Button
                                size="sm"
                                variant="solid"
                                onClick={async () => {
                                    if (!upload.file) return
                                    const contentBase64 = await fileToBase64(upload.file)
                                    await supportingOpsService.uploadDocumentVersion(detail.id, {
                                        revisionNumber: upload.revisionNumber,
                                        fileName: upload.file.name,
                                        contentBase64,
                                        mimeType: upload.file.type,
                                        changeSummary: upload.changeSummary,
                                    })
                                    openDetail(detail.id)
                                }}
                            >
                                Upload revision
                            </Button>
                        </>
                    ) : null
                }
            >
                {detail && (
                    <>
                        <p className="mb-2 text-sm text-gray-600">
                            {detail.title} · {detail.status}
                        </p>
                        <FormItem label="Revision">
                            <Input
                                value={upload.revisionNumber}
                                onChange={(e: any) =>
                                    setUpload((u) => ({ ...u, revisionNumber: e.target.value }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Change summary">
                            <Input
                                value={upload.changeSummary}
                                onChange={(e: any) =>
                                    setUpload((u) => ({ ...u, changeSummary: e.target.value }))
                                }
                            />
                        </FormItem>
                        <FormItem label="File">
                            <Input
                                type="file"
                                onChange={(e: any) =>
                                    setUpload((u) => ({
                                        ...u,
                                        file: e.target.files?.[0] ?? null,
                                    }))
                                }
                            />
                        </FormItem>
                        <ul className="mt-4 text-sm">
                            {(detail.versions ?? []).map((v: any) => (
                                <li key={v.id}>
                                    Rev {v.revisionNumber} — {v.status} — checksum{' '}
                                    {v.fileChecksum?.slice(0, 8)}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </FormDialog>
        </PageContainer>
    )
}

export default DocumentManagementPage
