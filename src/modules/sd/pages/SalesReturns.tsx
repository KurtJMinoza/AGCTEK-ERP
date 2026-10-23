'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { HiOutlineExternalLink, HiOutlineReply } from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { type ColumnDef } from '@/components/shared/DataTable'
import SdDataTable from '../components/SdDataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Radio from '@/components/ui/Radio'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { warehouseService } from '@/modules/mm/warehouse/services/warehouseService'
import {
    salesReturnService,
    type SdSalesReturn,
    type SdSalesReturnLine,
    type SdSalesReturnSettlement,
} from '../services/salesReturnService'
import { toApiError } from '../services/apiError'

const ROUTE = '/modules/sd/sales-returns'

const SETTLEMENT_OPTIONS: Array<{
    value: SdSalesReturnSettlement
    label: string
    help: string
}> = [
    {
        value: 'CREDIT_AND_RETURN',
        label: 'Credit and return the goods',
        help: 'Customer pays only for the good qty; damaged goods come back through the MM intake.',
    },
    {
        value: 'CREDIT_NO_RETURN',
        label: 'Credit without return',
        help: 'Customer pays only for the good qty; damaged goods stay with the customer (no MM intake).',
    },
    {
        value: 'KEEP_AND_PAY_FULL',
        label: 'Customer keeps the goods and pays in full',
        help: 'No credit and no return — the return is closed as rejected.',
    },
]

const SETTLEMENT_LABEL: Record<SdSalesReturnSettlement, string> = {
    CREDIT_AND_RETURN: 'Credit + return',
    CREDIT_NO_RETURN: 'Credit, no return',
    KEEP_AND_PAY_FULL: 'Keep, pay in full',
}

const formatCredit = (value: string | number | null) =>
    value == null
        ? 'No order price — billing decides'
        : new Intl.NumberFormat('en-PH', {
              style: 'currency',
              currency: 'PHP',
          }).format(Number(value))

const STATUS_TONE: Record<
    string,
    'success' | 'default' | 'warning' | 'danger' | 'info'
> = {
    REQUESTED: 'warning',
    AUTHORIZED: 'success',
    REJECTED: 'danger',
    CANCELLED: 'default',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'REQUESTED', label: 'Requested' },
    { value: 'AUTHORIZED', label: 'Authorized' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

type RefProps = {
    label: string
    value?: string | null
    href?: string | null
    hint?: string | null
}

const Ref = ({ label, value, href, hint }: RefProps) => (
    <div className="min-w-0 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-600">
        <p className="text-xs text-gray-500">{label}</p>
        {value ? (
            href ? (
                <Link
                    href={href}
                    title={value}
                    className="flex max-w-full items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                    <span className="truncate">{value}</span>
                    <HiOutlineExternalLink className="shrink-0" />
                </Link>
            ) : (
                <p className="truncate text-sm font-medium" title={value}>
                    {value}
                </p>
            )
        ) : (
            <p className="truncate text-sm font-medium text-gray-400">—</p>
        )}
        {hint ? <p className="truncate text-xs text-gray-500">{hint}</p> : null}
    </div>
)

const SalesReturns = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const searchParams = useSearchParams()

    const [statusFilter, setStatusFilter] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<SdSalesReturn[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    const [detail, setDetail] = useState<SdSalesReturn | null>(null)

    const [warehouses, setWarehouses] = useState<
        Array<{ id: string; code: string; name: string }>
    >([])
    const [intakeOpen, setIntakeOpen] = useState(false)
    const [intakeWarehouse, setIntakeWarehouse] = useState('')
    const [intakeBusy, setIntakeBusy] = useState(false)
    const [settleOpen, setSettleOpen] = useState(false)
    const [settlement, setSettlement] =
        useState<SdSalesReturnSettlement>('CREDIT_AND_RETURN')
    const [settleNote, setSettleNote] = useState('')
    const [settleBusy, setSettleBusy] = useState(false)

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await salesReturnService.list({
                page,
                pageSize,
                status: statusFilter || undefined,
            })
            setRows(res.data)
            setTotal(res.total)
        } catch (e) {
            pushToast('danger', 'Error', toApiError(e, 'Failed to load sales returns').message)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, statusFilter])

    useEffect(() => {
        fetchList()
    }, [fetchList])

    useEffect(() => {
        warehouseService
            .list({ limit: 500 })
            .then((r: any) => setWarehouses(Array.isArray(r) ? r : (r?.data ?? [])))
            .catch(() => {})
    }, [])

    const warehouseOpts = useMemo(
        () => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
        [warehouses],
    )

    const openDetail = useCallback(async (id: string) => {
        try {
            setDetail(await salesReturnService.get(id))
        } catch (e) {
            pushToast('danger', 'Error', toApiError(e, 'Failed to load the return').message)
        }
    }, [])

    // Deep link from SCM (damage report → sales return).
    const linkedReturnId = searchParams?.get('returnId') ?? null
    useEffect(() => {
        if (linkedReturnId) void openDetail(linkedReturnId)
    }, [linkedReturnId, openDetail])

    const refreshDetail = useCallback(async () => {
        if (!detail) return
        setDetail(await salesReturnService.get(detail.id))
    }, [detail])

    const run = async (label: string, fn: () => Promise<unknown>) => {
        try {
            await fn()
            pushToast('success', label, 'Done')
            await refreshDetail()
            await fetchList()
        } catch (e) {
            pushToast('danger', 'Failed', toApiError(e, 'Request failed').message)
        }
    }

    const submitSettlement = async () => {
        if (!detail) return
        setSettleBusy(true)
        try {
            const updated = await salesReturnService.settle(
                detail.id,
                settlement,
                settleNote.trim() || undefined,
            )
            pushToast(
                'success',
                'Settlement recorded',
                `${SETTLEMENT_LABEL[settlement]} — return is ${updated.status}`,
            )
            setSettleOpen(false)
            setSettleNote('')
            await refreshDetail()
            await fetchList()
        } catch (e) {
            pushToast('danger', 'Failed', toApiError(e, 'Request failed').message)
        } finally {
            setSettleBusy(false)
        }
    }

    const submitIntake = async () => {
        if (!detail) return
        setIntakeBusy(true)
        try {
            const result = await salesReturnService.initiateMmIntake(detail.id, {
                warehouseId: intakeWarehouse || undefined,
            })
            pushToast(
                'success',
                result.created ? 'MM intake opened' : 'Intake already exists',
                `MM return ${result.customerReturn.returnNumber} (${result.customerReturn.status})`,
            )
            setIntakeOpen(false)
            setIntakeWarehouse('')
            await refreshDetail()
            await fetchList()
        } catch (e) {
            pushToast('danger', 'Failed', toApiError(e, 'Request failed').message)
        } finally {
            setIntakeBusy(false)
        }
    }

    const lineColumns = useMemo<ColumnDef<SdSalesReturnLine>[]>(
        () => [
            {
                header: 'Material / SKU',
                cell: ({ row }) =>
                    row.original.sku ?? row.original.materialId ?? '—',
            },
            {
                header: 'Description',
                cell: ({ row }) => row.original.description ?? '—',
            },
            {
                header: 'Qty',
                size: 80,
                cell: ({ row }) => Number(row.original.quantity),
            },
        ],
        [],
    )

    const columns = useMemo<ColumnDef<SdSalesReturn>[]>(
        () => [
            { header: 'Return #', accessorKey: 'returnNumber', size: 120 },
            {
                header: 'Customer',
                cell: ({ row }) =>
                    row.original.customer?.companyName ??
                    row.original.customerId ??
                    '—',
            },
            {
                header: 'Sales order',
                cell: ({ row }) =>
                    row.original.salesOrder?.orderNumber ??
                    row.original.salesOrderId ??
                    '—',
            },
            {
                header: 'Damage report',
                cell: ({ row }) => row.original.damageReport?.reference ?? '—',
            },
            {
                header: 'Settlement',
                cell: ({ row }) =>
                    row.original.settlement
                        ? SETTLEMENT_LABEL[row.original.settlement]
                        : '—',
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                        {row.original.status}
                    </StatusBadge>
                ),
            },
            {
                header: '',
                id: 'act',
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
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Sales Returns"
                description="Customer return requests from damaged deliveries — record the customer's settlement, then open the MM intake when goods come back."
                icon={<HiOutlineReply />}
            />

            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => {
                            setStatusFilter(opt?.value ?? '')
                            setPage(1)
                        }}
                    />
                </div>

                <SdDataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={setPage}
                    onSelectChange={setPageSize}
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={!!detail}
                onClose={() => setDetail(null)}
                title={detail ? `Sales return ${detail.returnNumber}` : 'Sales return'}
                size="xl"
                icon={<HiOutlineReply />}
                headerExtra={
                    detail ? (
                        <StatusBadge tone={STATUS_TONE[detail.status] ?? 'default'}>
                            {detail.status}
                        </StatusBadge>
                    ) : undefined
                }
                bodyClassName="overflow-x-hidden"
                footerClassName="!justify-between"
                footer={
                    detail ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                {detail.status === 'REQUESTED' && (
                                    <>
                                        <Button
                                            size="sm"
                                            variant="solid"
                                            onClick={() => {
                                                setSettlement('CREDIT_AND_RETURN')
                                                setSettleNote('')
                                                setSettleOpen(true)
                                            }}
                                        >
                                            Record settlement
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() =>
                                                run('Reject claim', async () => {
                                                    const reason = window.prompt('Reason (optional)') ?? undefined
                                                    return salesReturnService.reject(detail.id, reason)
                                                })
                                            }
                                        >
                                            Reject claim
                                        </Button>
                                    </>
                                )}
                                {detail.status === 'AUTHORIZED' &&
                                    detail.settlement !== 'CREDIT_NO_RETURN' && (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={() => {
                                            setIntakeWarehouse(detail.warehouseId ?? '')
                                            setIntakeOpen(true)
                                        }}
                                    >
                                        Open MM intake
                                    </Button>
                                )}
                                {['REQUESTED', 'AUTHORIZED'].includes(detail.status) && (
                                    <Button
                                        size="sm"
                                        onClick={() =>
                                            run('Cancel', async () => {
                                                const reason = window.prompt('Reason (optional)') ?? undefined
                                                return salesReturnService.cancel(detail.id, reason)
                                            })
                                        }
                                    >
                                        Cancel
                                    </Button>
                                )}
                            </div>
                            <Button size="sm" onClick={() => setDetail(null)}>
                                Close
                            </Button>
                        </>
                    ) : null
                }
            >
                {detail ? (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <Ref
                                label="Customer"
                                value={
                                    detail.customer?.companyName ??
                                    detail.customer?.customerNumber ??
                                    detail.customerId
                                }
                            />
                            <Ref
                                label="Original sales order"
                                value={
                                    detail.salesOrder?.orderNumber ??
                                    detail.salesOrderId
                                }
                            />
                            <Ref label="Reason" value={detail.reason ?? '—'} />
                            <Ref
                                label="SCM damage report"
                                value={detail.damageReport?.reference ?? 'Manual / none'}
                                href={detail.damageReport ? '/scm/shipments' : null}
                                hint={
                                    detail.damageReport?.source === 'DRIVER'
                                        ? 'Reported by driver'
                                        : null
                                }
                            />
                            <Ref
                                label="Settlement"
                                value={
                                    detail.settlement
                                        ? SETTLEMENT_LABEL[detail.settlement]
                                        : detail.status === 'REQUESTED'
                                          ? 'Not decided yet'
                                          : null
                                }
                            />
                            <Ref
                                label="Credit (intent, not yet billed)"
                                value={
                                    detail.settlement
                                        ? formatCredit(detail.creditAmount)
                                        : null
                                }
                            />
                            <Ref
                                label="MM customer return intake"
                                value={detail.customerReturn?.returnNumber ?? 'Not opened yet'}
                                href={
                                    detail.customerReturn
                                        ? `/modules/mm/returns-disposal/customer-return-intake?returnId=${detail.customerReturn.id}`
                                        : null
                                }
                            />
                            <Ref
                                label="Intake status"
                                value={detail.customerReturn?.status ?? '—'}
                            />
                        </div>

                        {detail.notes ? (
                            <AdaptiveCard className="!p-3">
                                <p className="text-xs text-gray-500">Notes</p>
                                <p className="mt-0.5 text-sm">{detail.notes}</p>
                            </AdaptiveCard>
                        ) : null}

                        <div>
                            <h6 className="mb-3 text-sm font-semibold heading-text">
                                Return lines
                            </h6>
                            <SdDataTable
                                columns={lineColumns}
                                data={detail.lines ?? []}
                                compact
                                fit
                                hidePagination
                                noData={(detail.lines ?? []).length === 0}
                            />
                        </div>
                    </div>
                ) : null}
            </FormDialog>

            <FormDialog
                isOpen={intakeOpen}
                onClose={() => setIntakeOpen(false)}
                title="Open MM customer return intake"
                description="The MM intake records the physical receipt, inspection and disposition. Nothing is posted to inventory by this step."
                size="md"
                icon={<HiOutlineReply />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setIntakeOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" variant="solid" loading={intakeBusy} onClick={submitIntake}>
                            Open intake
                        </Button>
                    </>
                }
            >
                <FormItem label="Receiving warehouse">
                    <Select
                        placeholder="Select warehouse"
                        options={warehouseOpts}
                        value={warehouseOpts.find((o) => o.value === intakeWarehouse) ?? null}
                        onChange={(o: { value?: string } | null) =>
                            setIntakeWarehouse(o?.value ?? '')
                        }
                    />
                </FormItem>
            </FormDialog>

            <FormDialog
                isOpen={settleOpen}
                onClose={() => setSettleOpen(false)}
                title="Record settlement"
                description="What did the customer agree to for the damaged quantity? Credit is recorded as intent at the order price; no credit memo is posted yet."
                size="md"
                icon={<HiOutlineReply />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setSettleOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={settleBusy}
                            onClick={submitSettlement}
                        >
                            Record settlement
                        </Button>
                    </>
                }
            >
                <FormItem label="Settlement">
                    <Radio.Group
                        vertical
                        value={settlement}
                        onChange={(value: SdSalesReturnSettlement) => setSettlement(value)}
                    >
                        {SETTLEMENT_OPTIONS.map((option) => (
                            <Radio key={option.value} value={option.value}>
                                <span className="font-medium">{option.label}</span>
                                <span className="block text-xs text-gray-500">
                                    {option.help}
                                </span>
                            </Radio>
                        ))}
                    </Radio.Group>
                </FormItem>
                <FormItem label="Note (optional)">
                    <Input
                        textArea
                        rows={3}
                        value={settleNote}
                        onChange={(e) => setSettleNote(e.target.value)}
                        placeholder="e.g. Customer agreed by phone to pay for 8 of 10"
                    />
                </FormItem>
            </FormDialog>
        </PageContainer>
    )
}

export default SalesReturns
