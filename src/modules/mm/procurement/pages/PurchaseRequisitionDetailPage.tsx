'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import Select from '@/components/ui/Select'
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
    HiOutlineSwitchHorizontal,
    HiOutlinePlus,
} from 'react-icons/hi'
import { purchaseRequisitionService } from '../services/purchaseRequisitionService'
import { purchaseOrderService } from '../services/purchaseOrderService'
import { rfqService } from '../services/rfqService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import { workflowService } from '../services/workflowService'
import type {
    PurchaseRequisition,
    PrLine,
    PrConversion,
    PrAudit,
    WorkflowInstance,
    ApprovalTask,
} from '../types'
import { prRemainingQty, prTotalAmount } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    SUBMITTED: 'info',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    RETURNED: 'warning',
    PARTIALLY_CONVERTED: 'info',
    FULLY_CONVERTED: 'success',
    CANCELLED: 'danger',
    CLOSED: 'default',
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const PurchaseRequisitionDetailPage = () => {
    const params = useParams()
    const router = useRouter()
    const id = params?.id as string

    const [pr, setPr] = useState<PurchaseRequisition | null>(null)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState('lines')
    const [audits, setAudits] = useState<PrAudit[]>([])
    const [workflow, setWorkflow] = useState<WorkflowInstance | null>(null)
    const [confirmAction, setConfirmAction] = useState<{ action: string; fn: () => Promise<void> } | null>(null)
    const [confirming, setConfirming] = useState(false)
    const [convertOpen, setConvertOpen] = useState(false)
    const [convertLineId, setConvertLineId] = useState('')
    const [convertQty, setConvertQty] = useState('')
    const [convertTarget, setConvertTarget] = useState<'RFQ' | 'PO'>('PO')
    const [convertBuyerId, setConvertBuyerId] = useState('current-user')
    const [convertSupplierId, setConvertSupplierId] = useState('')
    const [convertDeadline, setConvertDeadline] = useState(
        () => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    )
    const [convertSubmitting, setConvertSubmitting] = useState(false)
    const [supplierOpts, setSupplierOpts] = useState<{ value: string; label: string }[]>([])

    useEffect(() => {
        supplierService
            .list({ page: 1, pageSize: 200, status: 'ACTIVE' })
            .then((res) =>
                setSupplierOpts(
                    res.data.map((s) => ({
                        value: s.id,
                        label: `${s.supplierCode} — ${s.supplierName}`,
                    })),
                ),
            )
            .catch(() => setSupplierOpts([]))
    }, [])

    const fetchPr = useCallback(async () => {
        setLoading(true)
        try {
            const data = await purchaseRequisitionService.get(id)
            setPr(data)
            setWorkflow(data.workflowInstance ?? null)
        } catch {
            pushToast('danger', 'Error', 'Failed to load purchase requisition')
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => { fetchPr() }, [fetchPr])

    useEffect(() => {
        if (tab === 'audit') {
            purchaseRequisitionService.getAudit(id).then(setAudits).catch(() => setAudits([]))
        }
        if (tab === 'approval') {
            workflowService.getInstance('PURCHASE_REQUISITION', id).then(setWorkflow).catch(() => {})
        }
    }, [tab, id])

    const runConfirm = useCallback(async () => {
        if (!confirmAction) return
        setConfirming(true)
        try {
            await confirmAction.fn()
            pushToast('success', confirmAction.action, `${confirmAction.action} completed.`)
            setConfirmAction(null)
            fetchPr()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Action failed')
        } finally {
            setConfirming(false)
        }
    }, [confirmAction, fetchPr])

    const handleConvert = useCallback(async () => {
        if (!pr || !convertLineId || !convertQty) return
        const qty = parseFloat(convertQty)
        if (!Number.isFinite(qty) || qty <= 0) {
            pushToast('danger', 'Error', 'Enter a valid quantity')
            return
        }
        setConvertSubmitting(true)
        try {
            if (convertTarget === 'RFQ') {
                if (!convertBuyerId || !convertDeadline) {
                    pushToast('danger', 'Error', 'Buyer and response deadline are required for RFQ')
                    return
                }
                const preferred = pr.lines.find((l) => l.id === convertLineId)?.preferredSupplierId
                const created = await rfqService.createFromPr({
                    purchaseRequisitionId: pr.id,
                    buyerId: convertBuyerId,
                    responseDeadline: convertDeadline,
                    purpose: pr.purpose,
                    createdBy: convertBuyerId,
                    prLineIds: [convertLineId],
                    supplierIds: [
                        ...new Set(
                            [convertSupplierId, preferred].filter(Boolean) as string[],
                        ),
                    ],
                    autoSelectCheapest: false,
                })
                pushToast('success', 'RFQ created', created.rfqNumber)
                setConvertOpen(false)
                router.push(`/modules/mm/procurement/rfqs/${created.id}`)
                return
            }

            if (!convertSupplierId || !convertBuyerId) {
                pushToast('danger', 'Error', 'Supplier and buyer are required for PO')
                return
            }
            const created = await purchaseOrderService.createFromPr({
                purchaseRequisitionId: pr.id,
                supplierId: convertSupplierId,
                buyerId: convertBuyerId,
                createdBy: convertBuyerId,
                lineIds: [{ lineId: convertLineId, quantity: qty }],
            })
            pushToast('success', 'PO created', created.poNumber)
            setConvertOpen(false)
            router.push(`/modules/mm/procurement/purchase-orders/${created.id}`)
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Conversion failed')
        } finally {
            setConvertSubmitting(false)
        }
    }, [
        pr,
        convertLineId,
        convertQty,
        convertTarget,
        convertBuyerId,
        convertSupplierId,
        convertDeadline,
        router,
    ])

    const lineColumns = useMemo<ColumnDef<PrLine>[]>(() => [
        {
            header: 'Material',
            accessorKey: 'materialId',
            cell: ({ row }) => {
                const m = row.original.material
                return m ? <span className="text-sm font-medium">{m.materialCode} — {m.materialName}</span> : <span>—</span>
            },
        },
        { header: 'Description', accessorKey: 'description', cell: ({ row }) => <span className="text-sm">{row.original.description || '—'}</span> },
        { header: 'Requested', accessorKey: 'requestedQuantity', cell: ({ row }) => <span>{Number(row.original.requestedQuantity)}</span> },
        { header: 'UOM', accessorKey: 'uomId', cell: ({ row }) => <span>{row.original.uom?.code || '—'}</span> },
        { header: 'Unit Price', accessorKey: 'estimatedUnitPrice', cell: ({ row }) => <span>{Number(row.original.estimatedUnitPrice).toFixed(2)}</span> },
        { header: 'Total', accessorKey: 'estimatedTotal', cell: ({ row }) => <span className="font-semibold">{Number(row.original.estimatedTotal).toFixed(2)}</span> },
        { header: 'Converted', accessorKey: 'convertedQty', cell: ({ row }) => <span>{Number(row.original.convertedQty)}</span> },
        { header: 'Remaining', id: 'remaining', cell: ({ row }) => <span className="font-medium text-primary">{prRemainingQty(row.original)}</span> },
        {
            header: 'Required',
            accessorKey: 'requiredDate',
            cell: ({ row }) => <span className="text-xs">{new Date(row.original.requiredDate).toLocaleDateString()}</span>,
        },
    ], [])

    const conversionColumns = useMemo<ColumnDef<PrConversion>[]>(() => [
        { header: 'Target', accessorKey: 'targetType' },
        { header: 'Target ID', accessorKey: 'targetId', cell: ({ row }) => <span>{row.original.targetId || '—'}</span> },
        { header: 'Qty', accessorKey: 'convertedQty', cell: ({ row }) => <span>{Number(row.original.convertedQty)}</span> },
        { header: 'By', accessorKey: 'convertedBy', cell: ({ row }) => <span>{row.original.convertedBy || '—'}</span> },
        { header: 'When', accessorKey: 'convertedAt', cell: ({ row }) => <span className="text-xs">{new Date(row.original.convertedAt).toLocaleString()}</span> },
    ], [])

    const auditColumns = useMemo<ColumnDef<PrAudit>[]>(() => [
        { header: 'Date', accessorKey: 'performedAt', cell: ({ row }) => <span className="text-xs">{new Date(row.original.performedAt).toLocaleString()}</span> },
        { header: 'Action', accessorKey: 'action' },
        { header: 'Field', accessorKey: 'field', cell: ({ row }) => <span>{row.original.field || '—'}</span> },
        { header: 'Old', accessorKey: 'oldValue', cell: ({ row }) => <span className="text-xs">{row.original.oldValue || '—'}</span> },
        { header: 'New', accessorKey: 'newValue', cell: ({ row }) => <span className="text-xs">{row.original.newValue || '—'}</span> },
        { header: 'By', accessorKey: 'performedBy', cell: ({ row }) => <span>{row.original.performedBy || '—'}</span> },
    ], [])

    const breadcrumbItems = useMemo(
        () =>
            buildErpBreadcrumbs(`/modules/mm/procurement/purchase-requisitions/${id}`, {
                detailLabel: pr?.requisitionNumber,
            }),
        [id, pr?.requisitionNumber],
    )

    if (loading) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-96 items-center justify-center"><Spinner size={40} /></div>
            </PageContainer>
        )
    }

    if (!pr) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-96 flex-col items-center justify-center gap-2">
                    <p className="text-lg font-semibold">Purchase requisition not found</p>
                    <Button onClick={() => router.back()}>Go back</Button>
                </div>
            </PageContainer>
        )
    }

    const convertible = ['APPROVED', 'PARTIALLY_CONVERTED'].includes(pr.status)
    const convertLineOptions = (pr.lines ?? [])
        .filter((l) => prRemainingQty(l) > 0)
        .map((l) => ({
            value: l.id,
            label: `${l.material?.materialCode ?? l.materialId} (remaining ${prRemainingQty(l)})`,
        }))

    const lifecycleActions = (
        <div className="flex flex-wrap items-center gap-2">
            {pr.status === 'DRAFT' && (
                <Button size="sm" variant="solid" icon={<HiOutlineClipboardCheck />} onClick={() => setConfirmAction({
                    action: 'Submit',
                    fn: async () => { await purchaseRequisitionService.submit(pr.id, pr.requesterId) },
                })}>
                    Submit
                </Button>
            )}
            {pr.status === 'PENDING_APPROVAL' && (
                <>
                    <Button size="sm" variant="solid" icon={<HiOutlineCheckCircle />} onClick={() => setConfirmAction({
                        action: 'Approve',
                        fn: async () => { await purchaseRequisitionService.approve(pr.id) },
                    })}>
                        Approve
                    </Button>
                    <Button size="sm" icon={<HiOutlineXCircle />} onClick={() => setConfirmAction({
                        action: 'Reject',
                        fn: async () => { await purchaseRequisitionService.reject(pr.id, 'Rejected') },
                    })}>
                        Reject
                    </Button>
                    <Button size="sm" icon={<HiOutlineReply />} onClick={() => setConfirmAction({
                        action: 'Return',
                        fn: async () => { await purchaseRequisitionService.return(pr.id, 'Returned for revision') },
                    })}>
                        Return
                    </Button>
                </>
            )}
            {convertible && (
                <Button size="sm" variant="solid" icon={<HiOutlineSwitchHorizontal />} onClick={() => {
                    setConvertLineId(convertLineOptions[0]?.value ?? '')
                    setConvertQty('')
                    setConvertOpen(true)
                }}>
                    Convert
                </Button>
            )}
            {['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'REJECTED', 'RETURNED'].includes(pr.status) && (
                <Button size="sm" icon={<HiOutlineBan />} onClick={() => setConfirmAction({
                    action: 'Cancel',
                    fn: async () => { await purchaseRequisitionService.cancel(pr.id) },
                })}>
                    Cancel
                </Button>
            )}
            {convertible && (
                <Button size="sm" icon={<HiOutlineLockClosed />} onClick={() => setConfirmAction({
                    action: 'Close',
                    fn: async () => { await purchaseRequisitionService.close(pr.id) },
                })}>
                    Close
                </Button>
            )}
        </div>
    )

    const tasks: ApprovalTask[] = workflow?.tasks ?? pr.workflowInstance?.tasks ?? []

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title={
                    <div className="flex flex-wrap items-center gap-3">
                        <span>{pr.requisitionNumber}</span>
                        <StatusBadge tone={STATUS_TONE[pr.status] ?? 'default'}>
                            {pr.status.replace(/_/g, ' ')}
                        </StatusBadge>
                    </div>
                }
                description={pr.purpose}
                actions={lifecycleActions}
            />

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InfoCard label="Requester" value={pr.requesterId} />
                <InfoCard label="Department" value={pr.departmentId || '—'} />
                <InfoCard label="Required Date" value={new Date(pr.requiredDate).toLocaleDateString()} />
                <InfoCard label="Est. Amount" value={prTotalAmount(pr).toLocaleString(undefined, { minimumFractionDigits: 2 })} />
            </div>

            <AdaptiveCard className="mt-4">
                <Tabs value={tab} onChange={setTab}>
                    <Tabs.TabList className="!overflow-x-auto">
                        <Tabs.TabNav value="lines" icon={<HiOutlineClipboardList />}>Lines</Tabs.TabNav>
                        <Tabs.TabNav value="approval" icon={<HiOutlineCheckCircle />}>Approval</Tabs.TabNav>
                        <Tabs.TabNav value="conversion" icon={<HiOutlineSwitchHorizontal />}>Conversion</Tabs.TabNav>
                        <Tabs.TabNav value="documents" icon={<HiOutlineDocumentText />}>Documents</Tabs.TabNav>
                        <Tabs.TabNav value="audit" icon={<HiOutlineClock />}>Audit</Tabs.TabNav>
                    </Tabs.TabList>

                    <div className="p-5">
                        {tab === 'lines' && (
                            <DataTable<PrLine>
                                columns={lineColumns}
                                data={pr.lines ?? []}
                                compact
                                fit
                                noData={(pr.lines ?? []).length === 0}
                            />
                        )}

                        {tab === 'approval' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <InfoCard label="Workflow Status" value={workflow?.status || pr.workflowInstance?.status || '—'} />
                                    <InfoCard label="Initiated By" value={workflow?.initiatedBy || '—'} />
                                    <InfoCard label="Approved By" value={pr.approvedBy || '—'} />
                                    <InfoCard label="Rejection Reason" value={pr.rejectionReason || pr.returnedReason || '—'} />
                                </div>
                                {tasks.length === 0 ? (
                                    <p className="text-sm text-gray-500">No approval tasks yet. Submit the PR to start the workflow.</p>
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

                        {tab === 'conversion' && (
                            <div className="space-y-4">
                                {convertible && convertLineOptions.length > 0 && (
                                    <div className="flex justify-end">
                                        <Button size="sm" icon={<HiOutlinePlus />} variant="solid" onClick={() => {
                                            setConvertLineId(convertLineOptions[0]?.value ?? '')
                                            setConvertOpen(true)
                                        }}>
                                            Convert Lines
                                        </Button>
                                    </div>
                                )}
                                <DataTable<PrConversion>
                                    columns={conversionColumns}
                                    data={pr.conversions ?? []}
                                    compact
                                    fit
                                    noData={(pr.conversions ?? []).length === 0}
                                />
                            </div>
                        )}

                        {tab === 'documents' && (
                            <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
                                <HiOutlineDocumentText className="text-4xl" />
                                <p className="text-sm font-medium">Documents — Coming soon</p>
                            </div>
                        )}

                        {tab === 'audit' && (
                            <DataTable<PrAudit>
                                columns={auditColumns}
                                data={audits}
                                compact
                                fit
                                noData={audits.length === 0}
                            />
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
                <p>Are you sure you want to {confirmAction?.action?.toLowerCase()} this purchase requisition?</p>
            </ConfirmDialog>

            <FormDialog
                isOpen={convertOpen}
                onClose={() => setConvertOpen(false)}
                size="md"
                title="Convert PR Line"
                description="Creates an RFQ or DRAFT PO from remaining quantity (document conversion)."
                icon={<HiOutlineClipboardCheck />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setConvertOpen(false)}>Cancel</Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={convertSubmitting}
                            onClick={handleConvert}
                        >
                            Create {convertTarget}
                        </Button>
                    </>
                }
            >
                <FormItem label="Line">
                    <Select
                        options={convertLineOptions}
                        value={convertLineOptions.find((o) => o.value === convertLineId) ?? null}
                        onChange={(opt: any) => {
                            setConvertLineId(opt?.value ?? '')
                            const line = pr.lines.find((l) => l.id === opt?.value)
                            if (line) {
                                setConvertQty(String(prRemainingQty(line)))
                                if (line.preferredSupplierId) {
                                    setConvertSupplierId(line.preferredSupplierId)
                                }
                            }
                        }}
                    />
                </FormItem>
                <FormItem label="Target Type">
                    <Select
                        options={[
                            { value: 'PO', label: 'Purchase Order' },
                            { value: 'RFQ', label: 'RFQ' },
                        ]}
                        value={{ value: convertTarget, label: convertTarget === 'PO' ? 'Purchase Order' : 'RFQ' }}
                        onChange={(opt: any) => setConvertTarget(opt?.value ?? 'PO')}
                    />
                </FormItem>
                {convertTarget === 'PO' && (
                    <FormItem label="Quantity">
                        <Input type="number" value={convertQty} onChange={(e) => setConvertQty(e.target.value)} />
                    </FormItem>
                )}
                <FormItem label="Buyer">
                    <Input value={convertBuyerId} onChange={(e) => setConvertBuyerId(e.target.value)} />
                </FormItem>
                <FormItem label={convertTarget === 'PO' ? 'Supplier' : 'Supplier (optional invites)'}>
                    <Select
                        options={supplierOpts}
                        value={supplierOpts.find((o) => o.value === convertSupplierId) ?? null}
                        onChange={(opt: any) => setConvertSupplierId(opt?.value ?? '')}
                        isClearable={convertTarget === 'RFQ'}
                    />
                </FormItem>
                {convertTarget === 'RFQ' && (
                    <FormItem label="Response deadline">
                        <Input
                            type="date"
                            value={convertDeadline}
                            onChange={(e) => setConvertDeadline(e.target.value)}
                        />
                    </FormItem>
                )}
            </FormDialog>
        </PageContainer>
    )
}

const InfoCard = ({ label, value }: { label: string; value: string }) => (
    <AdaptiveCard>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </AdaptiveCard>
)

export default PurchaseRequisitionDetailPage
