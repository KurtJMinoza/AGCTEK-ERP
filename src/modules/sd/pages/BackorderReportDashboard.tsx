'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    HiOutlineBell,
    HiOutlineClipboardList,
    HiOutlineRefresh,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { productDivisionLabel } from '../catalogs/productDivisions'
import {
    listBackorders,
    type Backorder,
    type BackorderListResult,
    type BackorderReason,
} from '../services/backorderService'

const ROUTE_PATH = '/modules/sd/backorder-report'
const AGING_DAYS = 3
const NOTIFY_SIMULATION_MS = 800

const REASON_META: Record<
    BackorderReason,
    { label: string; tone: StatusTone }
> = {
    STOCK_SHORTAGE: { label: 'Stock shortage', tone: 'danger' },
    AWAITING_RESERVATION: { label: 'Awaiting reservation', tone: 'warning' },
    NO_MATERIAL: { label: 'No MM material', tone: 'default' },
}

type Option = { value: string; label: string }

const formatPhp = (amount: number, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(
        amount,
    )

const formatDate = (value: string | null) =>
    value
        ? new Date(value).toLocaleDateString('en-PH', { dateStyle: 'medium' })
        : null

const formatQty = (qty: number, uom: string | null) =>
    `${qty.toLocaleString('en-PH', { maximumFractionDigits: 3 })}${uom ? ` ${uom}` : ''}`

/** Red tint past the critical age, yellow while aging. */
const rowTint = (row: Backorder) =>
    row.critical
        ? 'bg-red-50/70 dark:bg-red-500/10'
        : row.ageDays > AGING_DAYS
          ? 'bg-amber-50/70 dark:bg-amber-500/10'
          : undefined

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const StatCard = ({
    label,
    value,
    hint,
}: {
    label: string
    value: string | number
    hint?: string
}) => (
    <Card>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-bold sm:text-2xl">{value}</div>
        {hint ? <div className="mt-1 text-xs text-gray-400">{hint}</div> : null}
    </Card>
)

const BackorderReportDashboard = () => {
    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])
    const [customerId, setCustomerId] = useState('')
    const [divisionId, setDivisionId] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [result, setResult] = useState<BackorderListResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [notifyTarget, setNotifyTarget] = useState<Backorder | null>(null)
    const [notifying, setNotifying] = useState(false)
    const [notifiedIds, setNotifiedIds] = useState<Set<string>>(() => new Set())

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            setResult(
                await listBackorders({
                    customerId,
                    divisionId,
                    page,
                    pageSize,
                }),
            )
            setError(null)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unable to load backorders',
            )
        } finally {
            setLoading(false)
        }
    }, [customerId, divisionId, page, pageSize])

    useEffect(() => {
        void fetchList()
    }, [fetchList])

    const customerOptions = useMemo<Option[]>(
        () => [
            { value: '', label: 'All customers' },
            ...(result?.filters.customers ?? []).map((c) => ({
                value: c.id,
                label: c.name,
            })),
        ],
        [result?.filters.customers],
    )
    const divisionOptions = useMemo<Option[]>(
        () => [
            { value: '', label: 'All categories' },
            ...(result?.filters.divisions ?? []).map((d) => ({
                value: d,
                label: productDivisionLabel(d),
            })),
        ],
        [result?.filters.divisions],
    )

    /** Simulated delay notice: no email/SMS provider is called. */
    const sendNotice = async () => {
        if (!notifyTarget) return
        setNotifying(true)
        await new Promise((resolve) =>
            window.setTimeout(resolve, NOTIFY_SIMULATION_MS),
        )
        const contact =
            [notifyTarget.customerEmail, notifyTarget.customerPhone]
                .filter(Boolean)
                .join(' / ') || 'the customer on file'
        setNotifiedIds((prev) => new Set(prev).add(notifyTarget.id))
        notify(
            'success',
            'Delay update sent (simulated)',
            `${notifyTarget.orderNumber}: ${contact} was told ${notifyTarget.productName} is delayed${
                notifyTarget.expectedRestockDate
                    ? ` until about ${formatDate(notifyTarget.expectedRestockDate)}`
                    : ''
            }.`,
        )
        setNotifying(false)
        setNotifyTarget(null)
    }

    const columns = useMemo<ColumnDef<Backorder>[]>(
        () => [
            {
                header: 'Sales Order #',
                id: 'orderNumber',
                cell: ({ row }) => (
                    <div>
                        <div className="font-mono font-semibold">
                            {row.original.orderNumber}
                        </div>
                        {row.original.critical ? (
                            <div className="text-xs font-semibold text-red-600 dark:text-red-400">
                                {row.original.ageDays} days open
                            </div>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'Customer Name',
                id: 'customer',
                cell: ({ row }) => (
                    <div className="min-w-[8rem]">
                        <div className="font-semibold">
                            {row.original.customerName ?? '—'}
                        </div>
                        {row.original.customerCode ? (
                            <div className="font-mono text-xs text-gray-500">
                                {row.original.customerCode}
                            </div>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'SKU / Product',
                id: 'product',
                cell: ({ row }) => (
                    <div className="min-w-[10rem]">
                        <div className="font-mono text-xs text-gray-500">
                            {row.original.sku ?? '—'}
                        </div>
                        <div>{row.original.productName}</div>
                        {row.original.divisionId ? (
                            <div className="text-xs text-gray-400">
                                {productDivisionLabel(row.original.divisionId)}
                            </div>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'Ordered Qty',
                id: 'orderedQty',
                cell: ({ row }) =>
                    formatQty(row.original.orderedQty, row.original.uom),
            },
            {
                header: 'Missing / Open Qty',
                id: 'openQty',
                cell: ({ row }) => (
                    <div className="flex flex-col items-start gap-1">
                        <span className="font-semibold">
                            {formatQty(row.original.openQty, row.original.uom)}
                        </span>
                        <StatusBadge
                            tone={REASON_META[row.original.reason].tone}
                        >
                            {REASON_META[row.original.reason].label}
                        </StatusBadge>
                    </div>
                ),
            },
            {
                header: 'Order Date',
                id: 'orderDate',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap">
                        {formatDate(row.original.orderDate)}
                    </span>
                ),
            },
            {
                header: 'Expected Restock (ETA)',
                id: 'eta',
                cell: ({ row }) =>
                    row.original.expectedRestockDate ? (
                        <span className="whitespace-nowrap">
                            {formatDate(row.original.expectedRestockDate)}
                        </span>
                    ) : (
                        <span className="text-xs text-gray-400">
                            {row.original.reason === 'NO_MATERIAL'
                                ? 'Link an MM material'
                                : 'No incoming PO'}
                        </span>
                    ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) =>
                    notifiedIds.has(row.original.id) ? (
                        <span className="whitespace-nowrap text-xs text-emerald-600">
                            Notified
                        </span>
                    ) : (
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiOutlineBell />}
                            className="whitespace-nowrap"
                            onClick={() => setNotifyTarget(row.original)}
                        >
                            Notify Customer
                        </Button>
                    ),
            },
        ],
        [notifiedIds],
    )

    const summary = result?.summary

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Backorder Report"
                description="Track open sales order quantities and fulfillment bottlenecks."
                icon={<HiOutlineClipboardList />}
                actions={
                    <Button
                        size="sm"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={() => void fetchList()}
                    >
                        Refresh
                    </Button>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard
                    label="Total Backordered Value"
                    value={formatPhp(
                        summary?.totalBackorderedValue ?? 0,
                        summary?.currency,
                    )}
                />
                <StatCard
                    label="Total Affected Orders"
                    value={summary?.affectedOrders ?? 0}
                />
                <StatCard
                    label="Critical Shortages"
                    value={summary?.criticalShortages ?? 0}
                    hint="Items missing for more than 7 days"
                />
            </div>

            <Card>
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="md:w-64">
                        <Select<Option>
                            size="sm"
                            options={customerOptions}
                            value={customerOptions.find(
                                (o) => o.value === customerId,
                            )}
                            onChange={(o) => {
                                setCustomerId(o?.value ?? '')
                                setPage(1)
                            }}
                        />
                    </div>
                    <div className="md:w-56">
                        <Select<Option>
                            size="sm"
                            isSearchable={false}
                            options={divisionOptions}
                            value={divisionOptions.find(
                                (o) => o.value === divisionId,
                            )}
                            onChange={(o) => {
                                setDivisionId(o?.value ?? '')
                                setPage(1)
                            }}
                        />
                    </div>
                    <p className="text-xs text-gray-500 md:ml-auto">
                        Rows turn yellow after {AGING_DAYS} days and red after 7
                        days open.
                    </p>
                </div>

                <DataTable
                    columns={columns}
                    data={result?.data ?? []}
                    loading={loading && !result}
                    noData={!loading && !result?.data.length}
                    getRowId={(row) => row.id}
                    rowClassName={rowTint}
                    pagingData={{
                        total: result?.total ?? 0,
                        pageIndex: page,
                        pageSize,
                    }}
                    onPaginationChange={setPage}
                    onSelectChange={(size) => {
                        setPageSize(size)
                        setPage(1)
                    }}
                />
            </Card>

            <ConfirmDialog
                isOpen={notifyTarget !== null}
                type="info"
                title="Notify customer of delay"
                confirmText="Send update"
                confirmButtonProps={{ loading: notifying }}
                onClose={() => setNotifyTarget(null)}
                onCancel={() => setNotifyTarget(null)}
                onConfirm={() => void sendNotice()}
            >
                {notifyTarget ? (
                    <p>
                        Send {notifyTarget.customerName ?? 'the customer'} a
                        delay update for{' '}
                        <strong>{notifyTarget.productName}</strong> on{' '}
                        {notifyTarget.orderNumber}? This is a simulation — no
                        email or SMS is sent yet.
                    </p>
                ) : null}
            </ConfirmDialog>
        </PageContainer>
    )
}

export default BackorderReportDashboard
