'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Dialog from '@/components/ui/Dialog'
import Dropdown from '@/components/ui/Dropdown'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineRefresh, HiOutlineDotsVertical } from 'react-icons/hi'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    customerReturnRequestService,
    DEMO_REFUND_PAYMENT_ENABLED,
    displayStatuses,
    isCommercialResolutionBlocked,
    REFUND_STATUS_LABEL,
    RESOLUTION_LABEL,
    RESOLUTION_TONE,
    RETURN_STATUS_TONE,
    type CustomerReturnRequestRow,
} from '../services/customerReturnRequestService'
import { apiOpenReturnCase } from '@/modules/crm/services/crmApi'
import { ticketHref } from '@/modules/crm/utils/deepLinks'
import usePermissions from '@/utils/hooks/usePermissions'

const ROUTE = '/modules/sd/customer-returns'

const REFUND_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    REQUESTED: 'warning',
    NONE: 'default',
    NOT_REQUIRED: 'default',
    PENDING_REFUND: 'warning',
    APPROVED: 'warning',
    PAID: 'success',
    FAILED: 'danger',
}

/** Quick filters (Phase 9): Requested · Approved · Received · Damaged · Refunded · Closed */
const QUICK_FILTERS = [
    { value: 'REQUESTED', label: 'Requested' },
    { value: 'AWAITING_RETURN', label: 'Approved' },
    { value: 'RECEIVED', label: 'Received' },
    { value: 'MARKED_DAMAGED', label: 'Damaged' },
    { value: 'REFUNDED', label: 'Refunded' },
    { value: 'CLOSED', label: 'Closed' },
] as const

const STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'REQUESTED', label: 'Requested' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'AWAITING_RETURN', label: 'Awaiting Return' },
    { value: 'RECEIVED', label: 'Received' },
    { value: 'UNDER_INSPECTION', label: 'Under Inspection' },
    { value: 'RESTOCKED', label: 'Restocked' },
    { value: 'MARKED_DAMAGED', label: 'Marked as Damaged' },
    { value: 'SCRAPPED', label: 'Scrapped' },
    { value: 'REFUNDED', label: 'Refunded' },
    { value: 'CLOSED', label: 'Closed' },
]

const REFUND_STATUS_OPTIONS = [
    { value: '', label: 'All refund states' },
    { value: 'NONE', label: 'Not started' },
    { value: 'NOT_REQUIRED', label: 'Not required' },
    { value: 'PENDING_REFUND', label: 'Pending refund' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'PAID', label: 'Paid' },
    { value: 'FAILED', label: 'Failed' },
]

const fmtDate = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString() : '—'

const num = (v: string | number | null | undefined) => Number(v ?? 0)

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const errMsg = (err: unknown, fallback: string) =>
    (err as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message ??
    (err as { message?: string })?.message ??
    fallback

type ConfirmState = {
    title: string
    message: string
    run: () => Promise<void>
} | null

const EllipsisButton = () => (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">
        <HiOutlineDotsVertical />
    </span>
)

const CustomerReturnsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [companies, setCompanies] = useState<Array<{ value: string; label: string }>>([])
    const [companyId, setCompanyId] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [refundFilter, setRefundFilter] = useState('')
    const [rows, setRows] = useState<CustomerReturnRequestRow[]>([])
    const [loading, setLoading] = useState(true)
    const [confirm, setConfirm] = useState<ConfirmState>(null)
    const [detail, setDetail] = useState<CustomerReturnRequestRow | null>(null)
    const router = useRouter()
    const { can } = usePermissions()
    const canOpenCase = can('crm.tickets', 'create')

    const openCrmCase = useCallback(
        async (requestId: string) => {
            try {
                const { ticket } = await apiOpenReturnCase(requestId)
                router.push(ticketHref(ticket.id))
            } catch (err) {
                pushToast('danger', 'CRM case', errMsg(err, 'Could not open the CRM case'))
            }
        },
        [router],
    )

    useEffect(() => {
        let alive = true
        orgService
            .companies()
            .then((list: { id: string; name: string }[]) => {
                if (!alive) return
                const opts = list.map((c) => ({ value: c.id, label: c.name }))
                setCompanies(opts)
                if (!companyId && opts[0]) setCompanyId(opts[0].value)
            })
            .catch(() => undefined)
        return () => {
            alive = false
        }
    }, [companyId])

    const fetchList = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await customerReturnRequestService.list({
                companyId,
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(refundFilter ? { refundStatus: refundFilter } : {}),
            })
            setRows(res)
        } catch (err) {
            pushToast('danger', 'Load failed', errMsg(err, 'Failed to load returns'))
        } finally {
            setLoading(false)
        }
    }, [companyId, statusFilter, refundFilter])

    useEffect(() => {
        fetchList()
    }, [fetchList])

    const columns: ColumnDef<CustomerReturnRequestRow>[] = useMemo(
        () => [
            {
                header: 'Return #',
                accessorKey: 'requestNumber',
                size: 150,
                cell: ({ row }) => (
                    <span className="flex flex-col items-start gap-1">
                        {row.original.requestNumber}
                        {row.original.crmTicket ? (
                            <StatusBadge tone="info">CRM case · decided on the ticket</StatusBadge>
                        ) : null}
                    </span>
                ),
            },
            {
                header: 'Sales Order',
                accessorKey: 'salesOrder.orderNumber',
                cell: ({ row }) => row.original.salesOrder?.orderNumber ?? '—',
            },
            {
                header: 'Customer',
                accessorKey: 'salesOrder.customerName',
                cell: ({ row }) => row.original.salesOrder?.customerName ?? '—',
            },
            {
                header: 'Company',
                accessorKey: 'salesOrder.company.name',
                cell: ({ row }) => row.original.salesOrder?.company?.name ?? '—',
            },
            {
                header: 'Product',
                id: 'product',
                cell: ({ row }) => {
                    const names = row.original.lines
                        .map(
                            (l) =>
                                l.salesOrderLine?.productNameSnapshot ??
                                l.salesOrderLine?.materialCodeSnapshot ??
                                l.salesOrderLine?.sku ??
                                'Item',
                        )
                        .join(', ')
                    return <span className="line-clamp-2">{names}</span>
                },
            },
            {
                header: 'Qty',
                id: 'quantity',
                cell: ({ row }) =>
                    row.original.lines.reduce((s, l) => s + num(l.quantity), 0),
            },
            {
                header: 'Reason',
                accessorKey: 'reason',
                cell: ({ row }) =>
                    (row.original.reason ?? '—').replace(/_/g, ' '),
            },
            {
                header: 'Request',
                id: 'preferredResolution',
                cell: ({ row }) => {
                    const r = row.original
                    if (isCommercialResolutionBlocked(r.refundStatus)) {
                        return (
                            <StatusBadge tone="default">
                                On-spot (no refund)
                            </StatusBadge>
                        )
                    }
                    const res = r.preferredResolution
                    if (!res || !(res in RESOLUTION_LABEL)) {
                        return <span className="text-gray-400">—</span>
                    }
                    return (
                        <StatusBadge tone={RESOLUTION_TONE[res] ?? 'default'}>
                            {RESOLUTION_LABEL[res]}
                        </StatusBadge>
                    )
                },
            },
            {
                header: 'Return Status',
                accessorKey: 'status',
                cell: ({ row }) => {
                    const { returnStatus } = displayStatuses(row.original)
                    if (!returnStatus) {
                        return <span className="text-gray-400">—</span>
                    }
                    return (
                        <StatusBadge tone={RETURN_STATUS_TONE[returnStatus] ?? 'default'}>
                            {returnStatus.replace(/_/g, ' ')}
                        </StatusBadge>
                    )
                },
            },
            {
                header: 'Refund Status',
                accessorKey: 'refundStatus',
                cell: ({ row }) => {
                    const { refundStatus } = displayStatuses(row.original)
                    if (!refundStatus) {
                        return <span className="text-gray-400">—</span>
                    }
                    return (
                        <StatusBadge tone={REFUND_TONE[refundStatus] ?? 'default'}>
                            {REFUND_STATUS_LABEL[refundStatus] ?? refundStatus.replace(/_/g, ' ')}
                        </StatusBadge>
                    )
                },
            },
            {
                header: 'Created',
                accessorKey: 'createdAt',
                cell: ({ row }) => fmtDate(row.original.createdAt),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => {
                    const r = row.original
                    const company = companyId
                    const items: Array<{ label: string; run: () => void; danger?: boolean }> = []
                    const confirmRun = (
                        title: string,
                        message: string,
                        fn: () => Promise<unknown>,
                    ) => {
                        setConfirm({
                            title,
                            message,
                            run: async () => {
                                await fn()
                                void fetchList()
                            },
                        })
                    }
                    if (r.status === 'REQUESTED' && !r.crmTicket) {
                        const blocked = isCommercialResolutionBlocked(
                            r.refundStatus,
                        )
                        if (!blocked) {
                            items.push({
                                label: 'Refund request',
                                run: () =>
                                    void confirmRun(
                                        'Refund request',
                                        'Approve as Refund (red). Opens MM intake; refund after goods are received.',
                                        () =>
                                            customerReturnRequestService.approve(
                                                r.id,
                                                {
                                                    companyId: company,
                                                    preferredResolution: 'REFUND',
                                                },
                                            ),
                                    ),
                            })
                            items.push({
                                label: 'Replace request',
                                run: () =>
                                    void confirmRun(
                                        'Replace request',
                                        'Approve as Replace (orange). Opens MM intake and a $0 replacement sales order (pick/pack outbound).',
                                        () =>
                                            customerReturnRequestService.approve(
                                                r.id,
                                                {
                                                    companyId: company,
                                                    preferredResolution:
                                                        'REPLACEMENT',
                                                },
                                            ),
                                    ),
                            })
                        }
                        items.push({
                            label: 'Reject',
                            danger: true,
                            run: () =>
                                void confirmRun(
                                    'Reject return',
                                    blocked
                                        ? 'Close this on-spot refuse record? No refund or replacement applies.'
                                        : 'Reject this return request? The customer will not be refunded.',
                                    () =>
                                        customerReturnRequestService.reject(r.id, {
                                            companyId: company,
                                            reason: 'Rejected by sales',
                                        }),
                                ),
                        })
                    }
                    if (r.status === 'AWAITING_RETURN') {
                        items.push({
                            label: 'Receive item',
                            run: () =>
                                void confirmRun(
                                    'Receive item',
                                    'Mark the returned item as received at the warehouse?',
                                    () =>
                                        customerReturnRequestService.receive(r.id, {
                                            companyId: company,
                                        }),
                                ),
                        })
                    }
                    if (r.status === 'RECEIVED') {
                        items.push({
                            label: 'Inspect item',
                            run: () =>
                                void confirmRun(
                                    'Inspect item',
                                    'Start the warehouse inspection of the returned item?',
                                    () =>
                                        customerReturnRequestService.inspect(r.id, {
                                            companyId: company,
                                        }),
                                ),
                        })
                    }
                    if (r.status === 'UNDER_INSPECTION') {
                        items.push({
                            label: 'Mark restockable',
                            run: () =>
                                void confirmRun(
                                    'Mark restockable',
                                    'Return the item to sellable stock? This is the only path back to available inventory.',
                                    () =>
                                        customerReturnRequestService.markRestock(r.id, {
                                            companyId: company,
                                        }),
                                ),
                        })
                        items.push({
                            label: 'Mark damaged',
                            danger: true,
                            run: () =>
                                void confirmRun(
                                    'Mark damaged',
                                    'Move the item to damaged/blocked stock? It will NOT become sellable.',
                                    () =>
                                        customerReturnRequestService.markDamaged(r.id, {
                                            companyId: company,
                                        }),
                                ),
                        })
                        items.push({
                            label: 'Mark needs inspection',
                            run: () =>
                                void confirmRun(
                                    'Mark needs inspection',
                                    'Move the item to quality-inspection stock for a later decision?',
                                    () =>
                                        customerReturnRequestService.markNeedsInspection(r.id, {
                                            companyId: company,
                                        }),
                                ),
                        })
                        items.push({
                            label: 'Mark scrap',
                            danger: true,
                            run: () =>
                                void confirmRun(
                                    'Mark scrap',
                                    'Scrap this returned item? It is removed from usable inventory.',
                                    () =>
                                        customerReturnRequestService.markScrap(r.id, {
                                            companyId: company,
                                        }),
                                ),
                        })
                    }
                    if (
                        ['RESTOCKED', 'MARKED_DAMAGED', 'SCRAPPED'].includes(r.status)
                    ) {
                        if ((r.preferredResolution ?? 'REFUND') === 'REFUND') {
                            if (r.refundStatus === 'NONE') {
                                items.push({
                                    label: 'Create refund',
                                    run: () =>
                                        void confirmRun(
                                            'Create refund',
                                            'Create the refund record? Finance (FICO) pays it; nothing is paid from SD.',
                                            () =>
                                                customerReturnRequestService.createRefund(r.id, {
                                                    companyId: company,
                                                    refundMethod: 'CASH_REFUND',
                                                }),
                                        ),
                                })
                                items.push({
                                    label: 'Refund not required',
                                    run: () =>
                                        void confirmRun(
                                            'Refund not required',
                                            'Mark this return as having no refund payable (unpaid cash on delivery)?',
                                            () =>
                                                customerReturnRequestService.refundNotRequired(r.id, {
                                                    companyId: company,
                                                }),
                                        ),
                                })
                            } else if (r.refundStatus === 'PENDING_REFUND') {
                                items.push({
                                    label: 'Approve refund',
                                    run: () =>
                                        void confirmRun(
                                            'Approve refund',
                                            'Approve the refund? A credit memo is issued against the original invoice.',
                                            () =>
                                                customerReturnRequestService.refundApprove(r.id, {
                                                    companyId: company,
                                                }),
                                        ),
                                })
                                items.push({
                                    label: 'Fail refund',
                                    danger: true,
                                    run: () =>
                                        void confirmRun(
                                            'Fail refund',
                                            'Mark the refund as failed? No payment changes.',
                                            () =>
                                                customerReturnRequestService.refundFail(r.id, {
                                                    companyId: company,
                                                }),
                                        ),
                                })
                            } else if (r.refundStatus === 'APPROVED') {
                                if (DEMO_REFUND_PAYMENT_ENABLED) items.push({
                                    label: 'Mark refund paid (demo)',
                                    run: () =>
                                        void confirmRun(
                                            'Mark refund paid',
                                            'DEMO settlement: flip the Paid payment to Refunded and mark the invoice REFUNDED?',
                                            () =>
                                                customerReturnRequestService.refundPay(r.id, {
                                                    companyId: company,
                                                }),
                                        ),
                                })
                                items.push({
                                    label: 'Fail refund',
                                    danger: true,
                                    run: () =>
                                        void confirmRun(
                                            'Fail refund',
                                            'Mark the refund as failed? No payment changes.',
                                            () =>
                                                customerReturnRequestService.refundFail(r.id, {
                                                    companyId: company,
                                                }),
                                        ),
                                })
                            } else if (r.refundStatus === 'FAILED') {
                                items.push({
                                    label: 'Retry refund',
                                    run: () =>
                                        void confirmRun(
                                            'Retry refund',
                                            'Reset the failed refund to Pending Refund?',
                                            () =>
                                                customerReturnRequestService.createRefund(r.id, {
                                                    companyId: company,
                                                }),
                                        ),
                                })
                            } else if (
                                ['PAID', 'NOT_REQUIRED'].includes(r.refundStatus)
                            ) {
                                items.push({
                                    label: 'Close',
                                    run: () =>
                                        void confirmRun(
                                            'Close return',
                                            'Close this return?',
                                            () =>
                                                customerReturnRequestService.close(r.id, {
                                                    companyId: company,
                                                }),
                                        ),
                                })
                            }
                        } else {
                            items.push({
                                label: 'Close',
                                run: () =>
                                    void confirmRun(
                                        'Close return',
                                        `Close this return as ${r.preferredResolution}?`,
                                        () =>
                                            customerReturnRequestService.close(r.id, {
                                                companyId: company,
                                            }),
                                    ),
                            })
                        }
                    }
                    if (r.status === 'REFUNDED' || r.status === 'REJECTED') {
                        items.push({
                            label: 'Close',
                            run: () =>
                                void confirmRun(
                                    'Close return',
                                    'Close this return?',
                                    () =>
                                        customerReturnRequestService.close(r.id, {
                                            companyId: company,
                                        }),
                                ),
                        })
                    }
                    if (canOpenCase) {
                        items.unshift({
                            label: 'Open CRM case',
                            run: () => void openCrmCase(r.id),
                        })
                    }
                    items.unshift({
                        label: 'View details',
                        run: () => setDetail(r),
                    })
                    if (!items.length) return null
                    return (
                        <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                            {items.map((item) => (
                                <Dropdown.Item
                                    key={item.label}
                                    eventKey={item.label}
                                    onClick={() => void item.run()}
                                >
                                    <span className={item.danger ? 'text-rose-600' : ''}>
                                        {item.label}
                                    </span>
                                </Dropdown.Item>
                            ))}
                        </Dropdown>
                    )
                },
            },
        ],
        [companyId, fetchList, canOpenCase, openCrmCase],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Customer Returns"
                description="Sales return requests from delivered orders — approve, receive, inspect, disposition, refund, and close."
                actions={
                    <button
                        className="inline-flex items-center gap-2 rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-1.5 text-sm font-semibold dark:bg-gray-700 dark:hover:bg-gray-600"
                        onClick={() => void fetchList()}
                    >
                        <HiOutlineRefresh /> Refresh
                    </button>
                }
            />

            <AdaptiveCard className="mb-4">
                {/* Phase 9 quick filters */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Quick filters
                    </span>
                    {QUICK_FILTERS.map((f) => (
                        <button
                            key={f.value}
                            onClick={() =>
                                setStatusFilter((current) =>
                                    current === f.value ? '' : f.value,
                                )
                            }
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                statusFilter === f.value
                                    ? 'bg-primary text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                            Company
                        </label>
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId) ?? null}
                            onChange={(option: { value: string; label: string } | null) =>
                                setCompanyId(option?.value ?? '')
                            }
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                            Return status
                        </label>
                        <Select
                            options={STATUS_OPTIONS}
                            value={STATUS_OPTIONS.find((o) => o.value === statusFilter)}
                            onChange={(option: { value: string; label: string } | null) =>
                                setStatusFilter(option?.value ?? '')
                            }
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                            Refund status
                        </label>
                        <Select
                            options={REFUND_STATUS_OPTIONS}
                            value={REFUND_STATUS_OPTIONS.find((o) => o.value === refundFilter)}
                            onChange={(option: { value: string; label: string } | null) =>
                                setRefundFilter(option?.value ?? '')
                            }
                        />
                    </div>
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            {confirm && (
                <ConfirmDialog
                    isOpen
                    type="danger"
                    title={confirm.title}
                    confirmText="Confirm"
                    cancelText="Cancel"
                    onClose={() => setConfirm(null)}
                    onRequestClose={() => setConfirm(null)}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => {
                        const run = confirm.run
                        setConfirm(null)
                        void run().catch((err: unknown) =>
                            pushToast('danger', confirm.title, errMsg(err, 'Action failed')),
                        )
                    }}
                >
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {confirm.message}
                    </p>
                </ConfirmDialog>
            )}

            {/* Phase 9 — detail modal: approval · receiving · inspection · refund */}
            {detail && (
                <Dialog
                    isOpen
                    width={680}
                    onClose={() => setDetail(null)}
                    onRequestClose={() => setDetail(null)}
                >
                    <div className="p-6">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold heading-text">
                                    {detail.requestNumber}
                                </h2>
                                <p className="text-sm text-gray-500">
                                    Sales order {detail.salesOrder?.orderNumber ?? '—'} ·{' '}
                                    {detail.salesOrder?.customerName ?? detail.customerId}
                                </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                {isCommercialResolutionBlocked(
                                    detail.refundStatus,
                                ) ? (
                                    <StatusBadge tone="default">
                                        On-spot (no refund)
                                    </StatusBadge>
                                ) : detail.preferredResolution &&
                                  detail.preferredResolution in
                                      RESOLUTION_LABEL ? (
                                    <StatusBadge
                                        tone={
                                            RESOLUTION_TONE[
                                                detail.preferredResolution
                                            ] ?? 'default'
                                        }
                                    >
                                        {
                                            RESOLUTION_LABEL[
                                                detail.preferredResolution
                                            ]
                                        }
                                    </StatusBadge>
                                ) : null}
                                {(() => {
                                    const shown = displayStatuses(detail)
                                    return (
                                        <>
                                            {shown.returnStatus ? (
                                                <StatusBadge
                                                    tone={
                                                        RETURN_STATUS_TONE[
                                                            shown.returnStatus
                                                        ] ?? 'default'
                                                    }
                                                >
                                                    {shown.returnStatus.replace(
                                                        /_/g,
                                                        ' ',
                                                    )}
                                                </StatusBadge>
                                            ) : null}
                                            {shown.refundStatus ? (
                                                <StatusBadge
                                                    tone={
                                                        REFUND_TONE[
                                                            shown.refundStatus
                                                        ] ?? 'default'
                                                    }
                                                >
                                                    Refund:{' '}
                                                    {REFUND_STATUS_LABEL[shown.refundStatus] ??
                                                        shown.refundStatus.replace(/_/g, ' ')}
                                                </StatusBadge>
                                            ) : null}
                                        </>
                                    )
                                })()}
                            </div>
                        </div>

                        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
                            <div>
                                <dt className="text-xs text-gray-500">Reason</dt>
                                <dd className="font-medium">
                                    {(detail.reason ?? '—').replace(/_/g, ' ')}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-gray-500">Request</dt>
                                <dd className="font-medium">
                                    {isCommercialResolutionBlocked(
                                        detail.refundStatus,
                                    )
                                        ? 'On-spot (no refund)'
                                        : detail.preferredResolution
                                          ? (RESOLUTION_LABEL[
                                                detail.preferredResolution
                                            ] ?? detail.preferredResolution)
                                          : '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-gray-500">Replacement SO</dt>
                                <dd className="font-medium font-mono text-xs">
                                    {detail.replacementSalesOrderId ?? '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-gray-500">Company</dt>
                                <dd className="font-medium">
                                    {detail.salesOrder?.company?.name ?? '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-gray-500">Invoice</dt>
                                <dd className="font-medium">{detail.invoiceNumber ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-gray-500">Branch</dt>
                                <dd className="font-medium">{detail.branchId ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-gray-500">Warehouse</dt>
                                <dd className="font-medium">{detail.warehouseId ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-gray-500">Created</dt>
                                <dd className="font-medium">{fmtDate(detail.createdAt)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-gray-500">Refund amount</dt>
                                <dd className="font-medium">
                                    {detail.refundAmount
                                        ? Number(detail.refundAmount).toLocaleString()
                                        : '—'}
                                </dd>
                            </div>
                        </dl>

                        <div className="mb-4">
                            <h3 className="mb-2 text-sm font-semibold">Items returned</h3>
                            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-800">
                                        <tr>
                                            <th className="px-3 py-2">Product</th>
                                            <th className="px-3 py-2">Qty</th>
                                            <th className="px-3 py-2">Disposition</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.lines.map((line) => (
                                            <tr
                                                key={line.id}
                                                className="border-t border-gray-100 dark:border-gray-800"
                                            >
                                                <td className="px-3 py-2">
                                                    {line.salesOrderLine
                                                        ?.productNameSnapshot ??
                                                        line.salesOrderLine
                                                            ?.materialCodeSnapshot ??
                                                        'Item'}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {num(line.quantity)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {line.disposition?.replace(/_/g, ' ') ?? '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {detail.refunds[0] && (
                            <div className="mb-4 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
                                <div className="mb-1 flex items-center justify-between">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        Refund record {detail.refunds[0].refundNumber}
                                        {detail.refunds[0].isDemo ? ' · DEMO ONLY' : ''}
                                    </span>
                                    <StatusBadge tone={REFUND_TONE[detail.refunds[0].status] ?? 'default'}>
                                        {detail.refunds[0].status.replace(/_/g, ' ')}
                                    </StatusBadge>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-300">
                                    <span>
                                        Amount:{' '}
                                        <strong>
                                            {Number(detail.refunds[0].amount).toLocaleString()}
                                        </strong>
                                    </span>
                                    <span>
                                        Method:{' '}
                                        <strong>
                                            {detail.refunds[0].refundMethod ?? '—'}
                                        </strong>
                                    </span>
                                    <span>
                                        Credit memo:{' '}
                                        <strong>
                                            {detail.refunds[0].creditMemo?.creditMemoNumber ??
                                                '—'}
                                        </strong>
                                    </span>
                                </div>
                            </div>
                        )}
                        {detail.conditionNote && (
                            <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
                                <span className="font-semibold">Condition note:</span>{' '}
                                {detail.conditionNote}
                            </p>
                        )}
                    </div>
                </Dialog>
            )}
        </PageContainer>
    )
}

export default CustomerReturnsPage