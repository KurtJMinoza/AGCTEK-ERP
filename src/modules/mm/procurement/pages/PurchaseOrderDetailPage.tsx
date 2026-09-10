'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineClipboardList,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineDocumentText,
    HiOutlineBan,
    HiOutlineXCircle,
    HiOutlineReply,
    HiOutlineLockClosed,
    HiOutlineClipboardCheck,
    HiOutlinePaperAirplane,
    HiOutlineTruck,
    HiOutlineReceiptTax,
    HiOutlineCalculator,
    HiOutlinePaperClip,
    HiOutlineSwitchHorizontal,
    HiOutlinePlus,
    HiOutlineInboxIn,
    HiOutlineInformationCircle,
} from 'react-icons/hi'
import { purchaseOrderService } from '../services/purchaseOrderService'
import { workflowService } from '../services/workflowService'
import { goodsReceiptService } from '@/modules/mm/inventory/services/goodsReceiptService'
import type {
    MmPurchaseOrder,
    MmPurchaseOrderLine,
    MmPurchaseOrderAudit,
    MmPurchaseOrderAttachment,
    PoDocumentFlow,
    WorkflowInstance,
    ApprovalTask,
} from '../types'
import { poOpenQty } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { required, positiveNumber, firstError, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'

const ROUTE_PATH = '/modules/mm/procurement/purchase-orders'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    SENT: 'info',
    PARTIALLY_RECEIVED: 'info',
    FULLY_RECEIVED: 'success',
    CLOSED: 'default',
    CANCELLED: 'danger',
    REJECTED: 'danger',
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString()
}

function fmtMoney(n: number | string | null | undefined) {
    return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const PurchaseOrderDetailPage = () => {
    const params = useParams()
    const router = useRouter()
    const id = params?.id as string

    const [po, setPo] = useState<MmPurchaseOrder | null>(null)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState('overview')
    const [audits, setAudits] = useState<MmPurchaseOrderAudit[]>([])
    const [attachments, setAttachments] = useState<MmPurchaseOrderAttachment[]>([])
    const [docFlow, setDocFlow] = useState<PoDocumentFlow | null>(null)
    const [workflow, setWorkflow] = useState<WorkflowInstance | null>(null)
    const [confirmAction, setConfirmAction] = useState<{ action: string; fn: () => Promise<void> } | null>(null)
    const [confirming, setConfirming] = useState(false)

    const [grOpen, setGrOpen] = useState(false)
    const [grSubmitting, setGrSubmitting] = useState(false)
    const [grLines, setGrLines] = useState<Record<string, string>>({})
    const [grTouched, setGrTouched] = useState<Record<string, boolean>>({})
    const [grForce, setGrForce] = useState(false)

    const [attachOpen, setAttachOpen] = useState(false)
    const [attachForm, setAttachForm] = useState({ fileName: '', fileUrl: '' })
    const [attachSubmitting, setAttachSubmitting] = useState(false)
    const [attachTouched, setAttachTouched] = useState<Record<string, boolean>>({})
    const [attachForce, setAttachForce] = useState(false)

    const [reasonOpen, setReasonOpen] = useState(false)
    const [reasonAction, setReasonAction] = useState<'reject' | 'return' | 'cancel'>('reject')
    const [reasonText, setReasonText] = useState('')
    const [reasonSubmitting, setReasonSubmitting] = useState(false)

    const fetchPo = useCallback(async () => {
        setLoading(true)
        try {
            const data = await purchaseOrderService.get(id)
            setPo(data)
            setWorkflow(data.workflowInstance ?? null)
            setAttachments(data.attachments ?? [])
        } catch {
            pushToast('danger', 'Error', 'Failed to load purchase order')
            setPo(null)
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => { fetchPo() }, [fetchPo])

    useEffect(() => {
        if (tab === 'audit') {
            purchaseOrderService.getAudit(id).then(setAudits).catch(() => setAudits([]))
        }
        if (tab === 'approval') {
            workflowService.getInstance('PURCHASE_ORDER', id).then(setWorkflow).catch(() => {})
        }
        if (tab === 'attachments') {
            purchaseOrderService.listAttachments(id).then(setAttachments).catch(() => setAttachments([]))
        }
        if (tab === 'flow') {
            purchaseOrderService.getDocumentFlow(id).then(setDocFlow).catch(() => setDocFlow(null))
        }
    }, [tab, id])

    const runConfirm = useCallback(async () => {
        if (!confirmAction) return
        setConfirming(true)
        try {
            await confirmAction.fn()
            pushToast('success', confirmAction.action, `${confirmAction.action} completed.`)
            setConfirmAction(null)
            fetchPo()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Action failed')
        } finally {
            setConfirming(false)
        }
    }, [confirmAction, fetchPo])

    const openReason = (action: 'reject' | 'return' | 'cancel') => {
        setReasonAction(action)
        setReasonText('')
        setReasonOpen(true)
    }

    const submitReason = async () => {
        if (!po) return
        setReasonSubmitting(true)
        try {
            if (reasonAction === 'reject') {
                await purchaseOrderService.reject(po.id, reasonText || 'Rejected')
            } else if (reasonAction === 'return') {
                await purchaseOrderService.returnPo(po.id, reasonText || 'Returned for revision')
            } else {
                await purchaseOrderService.cancel(po.id, reasonText || undefined)
            }
            pushToast('success', reasonAction === 'reject' ? 'Rejected' : reasonAction === 'return' ? 'Returned' : 'Cancelled', 'Done.')
            setReasonOpen(false)
            fetchPo()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Action failed')
        } finally {
            setReasonSubmitting(false)
        }
    }

    const openQtyLines = useMemo(
        () => (po?.lines ?? []).filter((l) => poOpenQty(l) > 0),
        [po],
    )

    const openGr = () => {
        const init: Record<string, string> = {}
        for (const l of openQtyLines) {
            init[l.id] = String(poOpenQty(l))
        }
        setGrLines(init)
        setGrTouched({})
        setGrForce(false)
        setGrOpen(true)
    }

    const grErrors = useMemo<FieldErrors>(() => {
        const errs: FieldErrors = {}
        for (const l of openQtyLines) {
            const qty = grLines[l.id] ?? ''
            errs[l.id] = firstError(required(qty, 'Qty'), positiveNumber(qty, 'Qty'))
            const n = Number(qty)
            if (!errs[l.id] && n > poOpenQty(l)) {
                errs[l.id] = `Cannot exceed open qty ${poOpenQty(l)}`
            }
        }
        return errs
    }, [openQtyLines, grLines])

    const handleCreateGr = async () => {
        if (!po) return
        setGrForce(true)
        if (Object.values(grErrors).some(Boolean)) {
            pushToast('danger', 'Validation', 'Fix receipt quantities.')
            return
        }
        setGrSubmitting(true)
        try {
            const selected = openQtyLines.filter((l) => Number(grLines[l.id]) > 0)
            if (selected.length === 0) {
                pushToast('danger', 'Validation', 'Enter at least one quantity.')
                return
            }
            const today = new Date().toISOString().slice(0, 10)
            const gr = await goodsReceiptService.create({
                companyId: po.companyId,
                warehouseId: po.warehouseId || selected[0].warehouseId || '',
                purchaseOrderId: po.id,
                postingDate: today,
                documentDate: today,
                stockStatus: 'UNRESTRICTED',
                remarks: `GR against ${po.poNumber}`,
                lines: selected.map((l) => ({
                    materialId: l.materialId,
                    quantity: Number(grLines[l.id]),
                    uomId: l.uomId,
                    unitCost: Number(l.unitPrice),
                    totalCost: Number(grLines[l.id]) * Number(l.unitPrice),
                    purchaseOrderLineId: l.id,
                    storageBinId: l.storageBinId || undefined,
                })),
            })
            await goodsReceiptService.post(gr.id)
            pushToast('success', 'Received', `${gr.documentNumber} created and posted.`)
            setGrOpen(false)
            fetchPo()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string | string[] } } }
            const msg = e?.response?.data?.message || 'Goods receipt failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setGrSubmitting(false)
        }
    }

    const attachErrors = useMemo<FieldErrors>(() => ({
        fileName: required(attachForm.fileName, 'File name'),
    }), [attachForm])

    const handleAttach = async () => {
        setAttachForce(true)
        if (Object.values(attachErrors).some(Boolean)) return
        setAttachSubmitting(true)
        try {
            await purchaseOrderService.addAttachment(id, {
                fileName: attachForm.fileName,
                fileUrl: attachForm.fileUrl || undefined,
            })
            pushToast('success', 'Attached', 'Attachment added.')
            setAttachOpen(false)
            setAttachForm({ fileName: '', fileUrl: '' })
            const list = await purchaseOrderService.listAttachments(id)
            setAttachments(list)
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Upload failed')
        } finally {
            setAttachSubmitting(false)
        }
    }

    const lineColumns = useMemo<ColumnDef<MmPurchaseOrderLine>[]>(() => [
        {
            header: '#',
            accessorKey: 'lineNumber',
            size: 50,
        },
        {
            header: 'Material',
            id: 'material',
            cell: ({ row }) => {
                const m = row.original.material
                return m
                    ? <span className="text-sm font-medium">{m.materialCode} — {m.materialName}</span>
                    : <span>{row.original.materialId}</span>
            },
        },
        { header: 'Qty', accessorKey: 'quantity', cell: ({ row }) => <span>{Number(row.original.quantity)}</span> },
        { header: 'UOM', id: 'uom', cell: ({ row }) => <span>{row.original.uom?.code || '—'}</span> },
        { header: 'Unit Price', accessorKey: 'unitPrice', cell: ({ row }) => <span>{fmtMoney(row.original.unitPrice)}</span> },
        { header: 'Discount', accessorKey: 'discount', cell: ({ row }) => <span>{fmtMoney(row.original.discount)}</span> },
        { header: 'Tax', accessorKey: 'tax', cell: ({ row }) => <span>{fmtMoney(row.original.tax)}</span> },
        { header: 'Freight', accessorKey: 'freight', cell: ({ row }) => <span>{fmtMoney(row.original.freight)}</span> },
        { header: 'Line Total', accessorKey: 'lineTotal', cell: ({ row }) => <span className="font-semibold">{fmtMoney(row.original.lineTotal)}</span> },
        { header: 'Received', accessorKey: 'receivedQuantity', cell: ({ row }) => <span>{Number(row.original.receivedQuantity || 0)}</span> },
        { header: 'Invoiced', accessorKey: 'invoicedQuantity', cell: ({ row }) => <span>{Number(row.original.invoicedQuantity || 0)}</span> },
    ], [])

    const deliveryColumns = useMemo<ColumnDef<MmPurchaseOrderLine>[]>(() => [
        { header: '#', accessorKey: 'lineNumber', size: 50 },
        {
            header: 'Material',
            id: 'material',
            cell: ({ row }) => (
                <span className="text-sm">
                    {row.original.material?.materialCode ?? row.original.materialId}
                </span>
            ),
        },
        {
            header: 'Warehouse',
            id: 'wh',
            cell: ({ row }) => <span>{row.original.warehouse?.name || po?.warehouse?.name || '—'}</span>,
        },
        {
            header: 'Bin',
            id: 'bin',
            cell: ({ row }) => <span>{row.original.storageBin?.code || '—'}</span>,
        },
        {
            header: 'Required',
            accessorKey: 'requiredDate',
            cell: ({ row }) => <span className="text-xs">{fmtDate(row.original.requiredDate)}</span>,
        },
        {
            header: 'Expected',
            accessorKey: 'expectedDeliveryDate',
            cell: ({ row }) => <span className="text-xs">{fmtDate(row.original.expectedDeliveryDate)}</span>,
        },
        {
            header: 'Open Qty',
            id: 'open',
            cell: ({ row }) => <span className="font-medium text-primary">{poOpenQty(row.original)}</span>,
        },
    ], [po])

    const auditColumns = useMemo<ColumnDef<MmPurchaseOrderAudit>[]>(() => [
        { header: 'Date', accessorKey: 'performedAt', cell: ({ row }) => <span className="text-xs">{new Date(row.original.performedAt).toLocaleString()}</span> },
        { header: 'Action', accessorKey: 'action' },
        { header: 'Field', accessorKey: 'field', cell: ({ row }) => <span>{row.original.field || '—'}</span> },
        { header: 'Old', accessorKey: 'oldValue', cell: ({ row }) => <span className="text-xs">{row.original.oldValue || '—'}</span> },
        { header: 'New', accessorKey: 'newValue', cell: ({ row }) => <span className="text-xs">{row.original.newValue || '—'}</span> },
        { header: 'By', accessorKey: 'performedBy', cell: ({ row }) => <span>{row.original.performedBy || '—'}</span> },
    ], [])

    const attachColumns = useMemo<ColumnDef<MmPurchaseOrderAttachment>[]>(() => [
        { header: 'File', accessorKey: 'fileName' },
        {
            header: 'URL',
            accessorKey: 'fileUrl',
            cell: ({ row }) => row.original.fileUrl
                ? <a href={row.original.fileUrl} target="_blank" rel="noreferrer" className="text-primary text-sm hover:underline">Open</a>
                : <span>—</span>,
        },
        { header: 'Uploaded By', accessorKey: 'uploadedBy', cell: ({ row }) => <span>{row.original.uploadedBy || '—'}</span> },
        { header: 'When', accessorKey: 'uploadedAt', cell: ({ row }) => <span className="text-xs">{new Date(row.original.uploadedAt).toLocaleString()}</span> },
        {
            id: 'actions',
            header: '',
            size: 80,
            cell: ({ row }) => (
                <Button
                    size="xs"
                    variant="plain"
                    onClick={async () => {
                        try {
                            await purchaseOrderService.deleteAttachment(id, row.original.id)
                            setAttachments((prev) => prev.filter((a) => a.id !== row.original.id))
                            pushToast('success', 'Deleted', 'Attachment removed.')
                        } catch {
                            pushToast('danger', 'Error', 'Delete failed')
                        }
                    }}
                >
                    Remove
                </Button>
            ),
        },
    ], [id])

    const breadcrumbItems = useMemo(
        () =>
            buildErpBreadcrumbs(`${ROUTE_PATH}/${id}`, {
                detailLabel: po?.poNumber,
            }),
        [id, po?.poNumber],
    )

    if (loading) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-96 items-center justify-center"><Spinner size={40} /></div>
            </PageContainer>
        )
    }

    if (!po) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-96 flex-col items-center justify-center gap-2">
                    <p className="text-lg font-semibold">Purchase order not found</p>
                    <Button onClick={() => router.back()}>Go back</Button>
                </div>
            </PageContainer>
        )
    }

    const hasReceipts = (po.goodsReceipts ?? []).length > 0
        || (po.lines ?? []).some((l) => Number(l.receivedQuantity || 0) > 0)
    const canCancel = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(String(po.status)) && !hasReceipts
    const canClose = ['FULLY_RECEIVED', 'PARTIALLY_RECEIVED'].includes(String(po.status))
    const canReceive = ['SENT', 'PARTIALLY_RECEIVED', 'APPROVED'].includes(String(po.status)) && openQtyLines.length > 0

    const tasks: ApprovalTask[] = workflow?.tasks ?? po.workflowInstance?.tasks ?? []

    const lifecycleActions = (
        <div className="flex flex-wrap items-center gap-2">
            {po.status === 'DRAFT' && (
                <Button size="sm" variant="solid" icon={<HiOutlineClipboardCheck />} onClick={() => setConfirmAction({
                    action: 'Submit',
                    fn: async () => { await purchaseOrderService.submit(po.id) },
                })}>
                    Submit
                </Button>
            )}
            {po.status === 'PENDING_APPROVAL' && (
                <>
                    <Button size="sm" variant="solid" icon={<HiOutlineCheckCircle />} onClick={() => setConfirmAction({
                        action: 'Approve',
                        fn: async () => { await purchaseOrderService.approve(po.id) },
                    })}>
                        Approve
                    </Button>
                    <Button size="sm" icon={<HiOutlineXCircle />} onClick={() => openReason('reject')}>
                        Reject
                    </Button>
                    <Button size="sm" icon={<HiOutlineReply />} onClick={() => openReason('return')}>
                        Return
                    </Button>
                </>
            )}
            {po.status === 'APPROVED' && (
                <Button size="sm" variant="solid" icon={<HiOutlinePaperAirplane />} onClick={() => setConfirmAction({
                    action: 'Send',
                    fn: async () => { await purchaseOrderService.send(po.id) },
                })}>
                    Send
                </Button>
            )}
            {canCancel && (
                <Button size="sm" icon={<HiOutlineBan />} onClick={() => openReason('cancel')}>
                    Cancel
                </Button>
            )}
            {canClose && (
                <Button size="sm" icon={<HiOutlineLockClosed />} onClick={() => setConfirmAction({
                    action: 'Close',
                    fn: async () => { await purchaseOrderService.close(po.id) },
                })}>
                    Close
                </Button>
            )}
        </div>
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title={
                    <div className="flex flex-wrap items-center gap-3">
                        <span>{po.poNumber}</span>
                        <StatusBadge tone={STATUS_TONE[po.status] ?? 'default'}>
                            {String(po.status).replace(/_/g, ' ')}
                        </StatusBadge>
                    </div>
                }
                description={
                    po.supplier
                        ? `${po.supplier.supplierCode} — ${po.supplier.supplierName}`
                        : `Supplier ${po.supplierId}`
                }
                actions={lifecycleActions}
            />

            <AdaptiveCard className="mt-4">
                <Tabs value={tab} onChange={setTab}>
                    <Tabs.TabList className="!overflow-x-auto">
                        <Tabs.TabNav value="overview" icon={<HiOutlineInformationCircle />}>Overview</Tabs.TabNav>
                        <Tabs.TabNav value="items" icon={<HiOutlineClipboardList />}>Items</Tabs.TabNav>
                        <Tabs.TabNav value="delivery" icon={<HiOutlineTruck />}>Delivery</Tabs.TabNav>
                        <Tabs.TabNav value="approval" icon={<HiOutlineCheckCircle />}>Approval</Tabs.TabNav>
                        <Tabs.TabNav value="receiving" icon={<HiOutlineInboxIn />}>Receiving</Tabs.TabNav>
                        <Tabs.TabNav value="invoice" icon={<HiOutlineReceiptTax />}>Invoice</Tabs.TabNav>
                        <Tabs.TabNav value="accounting" icon={<HiOutlineCalculator />}>Accounting</Tabs.TabNav>
                        <Tabs.TabNav value="attachments" icon={<HiOutlinePaperClip />}>Attachments</Tabs.TabNav>
                        <Tabs.TabNav value="audit" icon={<HiOutlineClock />}>Audit</Tabs.TabNav>
                        <Tabs.TabNav value="flow" icon={<HiOutlineSwitchHorizontal />}>Document Flow</Tabs.TabNav>
                    </Tabs.TabList>

                    <div className="p-5">
                        {tab === 'overview' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <InfoCard label="Company" value={po.company?.name || po.companyId} />
                                    <InfoCard label="Buyer" value={po.buyerId} />
                                    <InfoCard label="Warehouse" value={po.warehouse?.name || '—'} />
                                    <InfoCard label="Currency" value={po.currency?.code || '—'} />
                                    <InfoCard label="Total Amount" value={fmtMoney(po.totalAmount)} />
                                    <InfoCard label="Expected Delivery" value={fmtDate(po.expectedDeliveryDate)} />
                                    <InfoCard label="Payment Terms" value={po.paymentTerms?.name || '—'} />
                                    <InfoCard label="Delivery Terms" value={po.deliveryTerms || '—'} />
                                    <InfoCard label="Created" value={fmtDate(po.createdAt)} />
                                    <InfoCard label="Submitted" value={fmtDate(po.submittedAt)} />
                                    <InfoCard label="Approved" value={fmtDate(po.approvedAt)} />
                                    <InfoCard label="Sent" value={fmtDate(po.sentAt)} />
                                </div>
                                {(po.rejectionReason || po.returnedReason || po.cancelReason) && (
                                    <AdaptiveCard>
                                        <p className="text-sm text-gray-600 dark:text-gray-300">
                                            {po.rejectionReason || po.returnedReason || po.cancelReason}
                                        </p>
                                    </AdaptiveCard>
                                )}
                            </div>
                        )}

                        {tab === 'items' && (
                            <DataTable<MmPurchaseOrderLine>
                                columns={lineColumns}
                                data={po.lines ?? []}
                                compact
                                fit
                                noData={(po.lines ?? []).length === 0}
                            />
                        )}

                        {tab === 'delivery' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <InfoCard label="Header Warehouse" value={po.warehouse?.name || '—'} />
                                    <InfoCard label="Expected Delivery" value={fmtDate(po.expectedDeliveryDate)} />
                                    <InfoCard label="Delivery Terms" value={po.deliveryTerms || '—'} />
                                </div>
                                <DataTable<MmPurchaseOrderLine>
                                    columns={deliveryColumns}
                                    data={po.lines ?? []}
                                    compact
                                    fit
                                    noData={(po.lines ?? []).length === 0}
                                />
                            </div>
                        )}

                        {tab === 'approval' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <InfoCard label="Workflow Status" value={workflow?.status || po.workflowInstance?.status || '—'} />
                                    <InfoCard label="Initiated By" value={workflow?.initiatedBy || '—'} />
                                    <InfoCard label="Approved By" value={po.approvedBy || '—'} />
                                    <InfoCard label="Rejection / Return" value={po.rejectionReason || po.returnedReason || '—'} />
                                </div>
                                {po.status === 'PENDING_APPROVAL' && (
                                    <div className="flex flex-wrap gap-2">
                                        <Button size="sm" variant="solid" icon={<HiOutlineCheckCircle />} onClick={() => setConfirmAction({
                                            action: 'Approve',
                                            fn: async () => { await purchaseOrderService.approve(po.id) },
                                        })}>
                                            Approve
                                        </Button>
                                        <Button size="sm" icon={<HiOutlineXCircle />} onClick={() => openReason('reject')}>Reject</Button>
                                        <Button size="sm" icon={<HiOutlineReply />} onClick={() => openReason('return')}>Return</Button>
                                    </div>
                                )}
                                {tasks.length === 0 ? (
                                    <p className="text-sm text-gray-500">No approval tasks yet. Submit the PO to start the workflow.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-600">
                                                    <th className="pb-2 pr-4">Step</th>
                                                    <th className="pb-2 pr-4">Role</th>
                                                    <th className="pb-2 pr-4">Status</th>
                                                    <th className="pb-2 pr-4">Comment</th>
                                                    <th className="pb-2">Decided</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tasks.map((t) => (
                                                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700">
                                                        <td className="py-2 pr-4">{t.stepNumber}</td>
                                                        <td className="py-2 pr-4">{t.approverRole}</td>
                                                        <td className="py-2 pr-4">
                                                            <StatusBadge tone={t.status === 'APPROVED' ? 'success' : t.status === 'REJECTED' || t.status === 'RETURNED' ? 'danger' : 'warning'}>
                                                                {t.status}
                                                            </StatusBadge>
                                                        </td>
                                                        <td className="py-2 pr-4">{t.comment || '—'}</td>
                                                        <td className="py-2 text-xs">{t.decidedAt ? new Date(t.decidedAt).toLocaleString() : '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === 'receiving' && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm text-gray-500">
                                        Open quantity across lines:{' '}
                                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                                            {openQtyLines.reduce((s, l) => s + poOpenQty(l), 0)}
                                        </span>
                                    </p>
                                    {canReceive && (
                                        <Button size="sm" variant="solid" icon={<HiOutlineInboxIn />} onClick={openGr}>
                                            Create Goods Receipt
                                        </Button>
                                    )}
                                </div>
                                <DataTable<MmPurchaseOrderLine>
                                    columns={[
                                        { header: '#', accessorKey: 'lineNumber', size: 50 },
                                        {
                                            header: 'Material',
                                            id: 'm',
                                            cell: ({ row }) => (
                                                <span className="text-sm">
                                                    {row.original.material?.materialCode ?? row.original.materialId}
                                                </span>
                                            ),
                                        },
                                        { header: 'Ordered', accessorKey: 'quantity', cell: ({ row }) => <span>{Number(row.original.quantity)}</span> },
                                        { header: 'Received', accessorKey: 'receivedQuantity', cell: ({ row }) => <span>{Number(row.original.receivedQuantity || 0)}</span> },
                                        { header: 'Open', id: 'open', cell: ({ row }) => <span className="font-medium text-primary">{poOpenQty(row.original)}</span> },
                                    ]}
                                    data={po.lines ?? []}
                                    compact
                                    fit
                                    noData={(po.lines ?? []).length === 0}
                                />
                                <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Receipt History</p>
                                    {(po.goodsReceipts ?? []).length === 0 ? (
                                        <p className="text-sm text-gray-500">No goods receipts yet.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {(po.goodsReceipts ?? []).map((gr) => (
                                                <li key={gr.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600">
                                                    <span className="font-mono font-semibold">{gr.documentNumber}</span>
                                                    <StatusBadge tone={gr.status === 'POSTED' ? 'success' : 'default'}>{gr.status}</StatusBadge>
                                                    <span className="text-xs text-gray-500">{fmtDate(gr.postingDate)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}

                        {tab === 'invoice' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <InfoCard
                                        label="Ordered Qty"
                                        value={String((po.lines ?? []).reduce((s, l) => s + Number(l.quantity), 0))}
                                    />
                                    <InfoCard
                                        label="Invoiced Qty"
                                        value={String((po.lines ?? []).reduce((s, l) => s + Number(l.invoicedQuantity || 0), 0))}
                                    />
                                    <InfoCard
                                        label="Remaining to Invoice"
                                        value={String((po.lines ?? []).reduce(
                                            (s, l) => s + Math.max(0, Number(l.quantity) - Number(l.invoicedQuantity || 0)),
                                            0,
                                        ))}
                                    />
                                </div>
                                <AdaptiveCard>
                                    <div className="flex items-start gap-3 p-2">
                                        <HiOutlineDocumentText className="mt-0.5 text-xl text-gray-400" />
                                        <div className="space-y-2">
                                            <p className="font-medium">Three-way match</p>
                                            <p className="text-sm text-gray-500">
                                                Capture supplier invoices and match against this PO and
                                                posted goods receipts. Payment execution stays in AP/FI.
                                            </p>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="solid"
                                                    onClick={() =>
                                                        router.push(
                                                            '/modules/mm/procurement/supplier-invoices',
                                                        )
                                                    }
                                                >
                                                    Supplier Invoices
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        router.push(
                                                            '/modules/mm/procurement/three-way-match',
                                                        )
                                                    }
                                                >
                                                    Run Match
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </AdaptiveCard>
                            </div>
                        )}

                        {tab === 'accounting' && (
                            <div className="space-y-4">
                                <AdaptiveCard>
                                    <p className="mb-2 text-sm font-medium">Posting keys / cost objects (placeholder)</p>
                                    <p className="text-sm text-gray-500">
                                        Cost center, project, and GL posting key rollup will appear here once FI integration is wired.
                                    </p>
                                </AdaptiveCard>
                                <DataTable<MmPurchaseOrderLine>
                                    columns={[
                                        { header: '#', accessorKey: 'lineNumber', size: 50 },
                                        {
                                            header: 'Material',
                                            id: 'm',
                                            cell: ({ row }) => (
                                                <span className="text-sm">
                                                    {row.original.material?.materialCode ?? row.original.materialId}
                                                </span>
                                            ),
                                        },
                                        { header: 'Cost Center', accessorKey: 'costCenterId', cell: ({ row }) => <span>{row.original.costCenterId || '—'}</span> },
                                        { header: 'Project', accessorKey: 'projectId', cell: ({ row }) => <span>{row.original.projectId || '—'}</span> },
                                        { header: 'Line Total', accessorKey: 'lineTotal', cell: ({ row }) => <span>{fmtMoney(row.original.lineTotal)}</span> },
                                    ]}
                                    data={po.lines ?? []}
                                    compact
                                    fit
                                    noData={(po.lines ?? []).length === 0}
                                />
                            </div>
                        )}

                        {tab === 'attachments' && (
                            <div className="space-y-4">
                                <div className="flex justify-end">
                                    <Button size="sm" icon={<HiOutlinePlus />} onClick={() => {
                                        setAttachForm({ fileName: '', fileUrl: '' })
                                        setAttachTouched({})
                                        setAttachForce(false)
                                        setAttachOpen(true)
                                    }}>
                                        Add Attachment
                                    </Button>
                                </div>
                                <DataTable<MmPurchaseOrderAttachment>
                                    columns={attachColumns}
                                    data={attachments}
                                    compact
                                    fit
                                    noData={attachments.length === 0}
                                />
                            </div>
                        )}

                        {tab === 'audit' && (
                            <DataTable<MmPurchaseOrderAudit>
                                columns={auditColumns}
                                data={audits}
                                compact
                                fit
                                noData={audits.length === 0}
                            />
                        )}

                        {tab === 'flow' && (
                            <div className="space-y-3">
                                {!docFlow ? (
                                    <p className="text-sm text-gray-500">Loading document flow…</p>
                                ) : (
                                    <ul className="space-y-2 text-sm">
                                        <FlowRow
                                            label="Purchase Requisition"
                                            value={docFlow.purchaseRequisition?.number}
                                            href={docFlow.purchaseRequisition
                                                ? `/modules/mm/procurement/purchase-requisitions/${docFlow.purchaseRequisition.id}`
                                                : undefined}
                                        />
                                        <FlowRow
                                            label="RFQ"
                                            value={docFlow.rfq?.number}
                                            href={docFlow.rfq ? `/modules/mm/procurement/rfqs/${docFlow.rfq.id}` : undefined}
                                        />
                                        <FlowRow
                                            label="Quotation"
                                            value={docFlow.quotation?.number}
                                            href={docFlow.quotation
                                                ? `/modules/mm/procurement/supplier-quotations?quotationId=${docFlow.quotation.id}`
                                                : undefined}
                                        />
                                        <FlowRow
                                            label="Award"
                                            value={docFlow.award ? docFlow.award.id.slice(0, 8) : undefined}
                                            href={docFlow.rfq ? `/modules/mm/procurement/rfqs/${docFlow.rfq.id}` : undefined}
                                        />
                                        <FlowRow
                                            label="Purchase Order"
                                            value={docFlow.purchaseOrder.number}
                                        />
                                        {(docFlow.goodsReceipts ?? []).map((gr) => (
                                            <FlowRow
                                                key={gr.id}
                                                label="Goods Receipt"
                                                value={`${gr.number} (${gr.status})`}
                                                href={`/modules/mm/inventory-management/goods-receipt`}
                                            />
                                        ))}
                                        {(docFlow.goodsReceipts ?? []).length === 0 && (
                                            <FlowRow label="Goods Receipt" value={undefined} />
                                        )}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                </Tabs>
            </AdaptiveCard>

            <ConfirmDialog
                isOpen={Boolean(confirmAction)}
                type="warning"
                title={`${confirmAction?.action ?? 'Confirm'}?`}
                confirmText={confirmAction?.action ?? 'Confirm'}
                onRequestClose={() => setConfirmAction(null)}
                onCancel={() => setConfirmAction(null)}
                onConfirm={runConfirm}
                confirmButtonProps={{ loading: confirming }}
            >
                <p>Are you sure you want to {confirmAction?.action?.toLowerCase()} this purchase order?</p>
            </ConfirmDialog>

            <FormDialog
                isOpen={reasonOpen}
                onClose={() => setReasonOpen(false)}
                title={reasonAction === 'reject' ? 'Reject PO' : reasonAction === 'return' ? 'Return PO' : 'Cancel PO'}
                width={480}
                footer={
                    <>
                        <Button size="sm" onClick={() => setReasonOpen(false)}>Close</Button>
                        <Button size="sm" variant="solid" loading={reasonSubmitting} onClick={submitReason}>
                            Confirm
                        </Button>
                    </>
                }
            >
                <FormItem label="Reason">
                    <Input
                        textArea
                        value={reasonText}
                        onChange={(e) => setReasonText(e.target.value)}
                        placeholder="Optional reason"
                    />
                </FormItem>
            </FormDialog>

            <FormDialog
                isOpen={grOpen}
                onClose={() => setGrOpen(false)}
                title="Create Goods Receipt"
                description={`Receive against ${po.poNumber}`}
                width={640}
                icon={<HiOutlineInboxIn />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setGrOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={grSubmitting} onClick={handleCreateGr}>
                            Create & Post
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    {openQtyLines.map((l) => {
                        const err = visibleError(grErrors, grTouched, l.id, grForce)
                        return (
                            <FormItem
                                key={l.id}
                                label={`${l.material?.materialCode ?? l.materialId} (open ${poOpenQty(l)})`}
                                asterisk
                                invalid={Boolean(err)}
                                errorMessage={err}
                            >
                                <Input
                                    type="number"
                                    value={grLines[l.id] ?? ''}
                                    onChange={(e) => {
                                        setGrLines((p) => ({ ...p, [l.id]: e.target.value }))
                                        setGrTouched((t) => ({ ...t, [l.id]: true }))
                                    }}
                                />
                            </FormItem>
                        )
                    })}
                </div>
            </FormDialog>

            <FormDialog
                isOpen={attachOpen}
                onClose={() => setAttachOpen(false)}
                title="Add Attachment"
                width={480}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAttachOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={attachSubmitting} onClick={handleAttach}>
                            Save
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <FormItem
                        label="File name"
                        asterisk
                        invalid={Boolean(visibleError(attachErrors, attachTouched, 'fileName', attachForce))}
                        errorMessage={visibleError(attachErrors, attachTouched, 'fileName', attachForce)}
                    >
                        <Input
                            value={attachForm.fileName}
                            onChange={(e) => {
                                setAttachForm((p) => ({ ...p, fileName: e.target.value }))
                                setAttachTouched((t) => ({ ...t, fileName: true }))
                            }}
                        />
                    </FormItem>
                    <FormItem label="File URL">
                        <Input
                            value={attachForm.fileUrl}
                            onChange={(e) => setAttachForm((p) => ({ ...p, fileUrl: e.target.value }))}
                            placeholder="https://..."
                        />
                    </FormItem>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

const InfoCard = ({ label, value }: { label: string; value?: string | null }) => (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-600">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="truncate text-sm font-medium">{value || '—'}</p>
    </div>
)

const FlowRow = ({
    label,
    value,
    href,
}: {
    label: string
    value?: string | null
    href?: string
}) => (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-600">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
        {value && href ? (
            <Link href={href} className="font-mono text-sm font-semibold text-primary hover:underline">{value}</Link>
        ) : (
            <span className="font-mono text-sm">{value || '—'}</span>
        )}
    </li>
)

export default PurchaseOrderDetailPage
