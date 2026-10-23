'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    HiOutlineClipboardList,
    HiOutlineRefresh,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { type ColumnDef } from '@/components/shared/DataTable'
import SdDataTable from '../components/SdDataTable'
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
    BoCustomerCell,
    BoEtaCell,
    BoNotifyActionCell,
    BoOpenQtyCell,
    BoOrderCell,
    BoOrderDateCell,
    BoOrderedQtyCell,
    BoProductCell,
    formatBackorderDate,
} from '../components/BackorderReportTableCells'
import {
    listBackorders,
    type Backorder,
    type BackorderListResult,
} from '../services/backorderService'

const ROUTE_PATH = '/modules/sd/backorder-report'
const AGING_DAYS = 3
const NOTIFY_SIMULATION_MS = 800

type Option = { value: string; label: string }

const formatPhp = (amount: number, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(
        amount,
    )

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
    delayMs = 0,
}: {
    label: string
    value: string | number
    hint?: string
    delayMs?: number
}) => (
    <Card
        className={`animate-mm-row-in motion-reduce:animate-none opacity-0 ${delayMs ? `[animation-delay:${delayMs}ms]` : ''}`}
    >
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
                    ? ` until about ${formatBackorderDate(notifyTarget.expectedRestockDate)}`
                    : ''
            }.`,
        )
        setNotifying(false)
        setNotifyTarget(null)
    }

    const columns = useMemo<ColumnDef<Backorder>[]>(
        () => [
            {
                id: 'order',
                header: 'Sales order',
                size: 168,
                minSize: 140,
                cell: ({ row }) => <BoOrderCell row={row.original} />,
            },
            {
                id: 'customer',
                header: 'Customer',
                size: 160,
                minSize: 120,
                meta: { className: 'hidden sm:table-cell' },
                cell: ({ row }) => <BoCustomerCell row={row.original} />,
            },
            {
                id: 'product',
                header: 'SKU / product',
                size: 200,
                minSize: 160,
                cell: ({ row }) => <BoProductCell row={row.original} />,
            },
            {
                id: 'orderedQty',
                header: 'Ordered',
                size: 100,
                minSize: 88,
                meta: { className: 'hidden md:table-cell' },
                cell: ({ row }) => <BoOrderedQtyCell row={row.original} />,
            },
            {
                id: 'openQty',
                header: 'Open / reason',
                size: 140,
                minSize: 120,
                cell: ({ row }) => <BoOpenQtyCell row={row.original} />,
            },
            {
                id: 'orderDate',
                header: 'Order date',
                size: 128,
                minSize: 110,
                meta: { className: 'hidden lg:table-cell' },
                cell: ({ row }) => <BoOrderDateCell row={row.original} />,
            },
            {
                id: 'eta',
                header: 'Restock ETA',
                size: 140,
                minSize: 120,
                meta: { className: 'hidden xl:table-cell' },
                cell: ({ row }) => <BoEtaCell row={row.original} />,
            },
            {
                id: 'actions',
                header: '',
                size: 120,
                minSize: 88,
                cell: ({ row }) => (
                    <BoNotifyActionCell
                        row={row.original}
                        notified={notifiedIds.has(row.original.id)}
                        onNotify={() => setNotifyTarget(row.original)}
                    />
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
                    delayMs={40}
                />
                <StatCard
                    label="Total Affected Orders"
                    value={summary?.affectedOrders ?? 0}
                    delayMs={90}
                />
                <StatCard
                    label="Critical Shortages"
                    value={summary?.criticalShortages ?? 0}
                    hint="Items missing for more than 7 days"
                    delayMs={140}
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

                <SdDataTable
                    columns={columns}
                    data={result?.data ?? []}
                    loading={loading && !result}
                    noData={!loading && !result?.data.length}
                    getRowId={(row) => row.id}
                    rowClassName={(row) => rowTint(row)}
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
