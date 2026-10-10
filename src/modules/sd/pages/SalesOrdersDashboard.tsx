'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
    HiOutlineCheck,
    HiOutlineDesktopComputer,
    HiOutlineEye,
    HiOutlineGlobeAlt,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineX,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    PAYMENT_METHOD_LABEL,
    markOrderPaymentPaid,
    summarizeSalesOrders,
    type RetailStatusTarget,
    type SalesOrderChannel,
    type SalesOrderDateRange,
    type SalesOrderRecord,
} from '../services/salesOrderDashboardService'
import { useSalesOrdersStore } from '../store/useSalesOrdersStore'
import { useSalesBranches } from '../hooks/useSalesBranches'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import useResourceAccess from '@/utils/hooks/useResourceAccess'

const { TabList, TabNav } = Tabs

type ChannelFilter = 'all' | SalesOrderChannel

const ROUTE_PATH = '/modules/sd/sales-orders'
const REFRESH_INTERVAL_MS = 30_000
const SEARCH_DEBOUNCE_MS = 350

type DateRangeOption = { value: SalesOrderDateRange; label: string }

const DATE_RANGE_OPTIONS: DateRangeOption[] = [
    { value: 'all', label: 'All time' },
    { value: 'today', label: 'Today' },
    { value: 'last7days', label: 'Last 7 days' },
    { value: 'last30days', label: 'Last 30 days' },
]

type BranchFilterOption = { value: string; label: string }

type CompanyFilterOption = { value: string; label: string }

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
    }).format(value)

const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
    })

const ChannelBadge = ({ channel }: { channel: SalesOrderChannel }) => {
    if (channel === 'POS') {
        return (
            <StatusBadge
                tone="warning"
                prefix={<HiOutlineDesktopComputer className="mr-1" />}
            >
                POS Fast-Track
            </StatusBadge>
        )
    }
    if (channel === 'E-commerce') {
        return (
            <StatusBadge
                tone="info"
                prefix={<HiOutlineGlobeAlt className="mr-1" />}
            >
                E-commerce
            </StatusBadge>
        )
    }
    return <StatusBadge>Standard</StatusBadge>
}

const STATUS_TONE: Record<SalesOrderRecord['status'], StatusTone> = {
    Completed: 'success',
    Delivered: 'success',
    Dispatched: 'info',
    'Pending Delivery': 'warning',
    Draft: 'default',
    Cancelled: 'danger',
}

/** Admin-only payment collection follows commercial state, not UI visibility. */
const canRecordPayment = (order: SalesOrderRecord) => {
    if (order.channel !== 'E-commerce' || !order.payment) return false
    if (['Completed', 'Cancelled'].includes(order.status)) return false
    if (
        ['Paid', 'Failed', 'Cancelled', 'Refunded'].includes(
            order.payment.status ?? '',
        )
    ) {
        return false
    }
    // A delivery-stage collection is specifically for unpaid COD orders.
    return order.status !== 'Delivered' || order.payment.method === 'COD'
}

const StatusCell = ({ status }: { status: SalesOrderRecord['status'] }) => (
    <StatusBadge tone={STATUS_TONE[status]}>{status}</StatusBadge>
)

const lineColumns: ColumnDef<SalesOrderRecord['lines'][number]>[] = [
    {
        header: 'SKU',
        id: 'sku',
        cell: ({ row }) => (
            <div>
                <div className="font-mono text-xs">{row.original.sku}</div>
                <div className="text-xs text-gray-500">{row.original.name}</div>
            </div>
        ),
    },
    { header: 'Qty', id: 'quantity', cell: ({ row }) => row.original.quantity },
    {
        header: 'Unit Price',
        id: 'unitPrice',
        cell: ({ row }) => (
            <span className="whitespace-nowrap">
                {formatPrice(row.original.unitPrice)}
            </span>
        ),
    },
    {
        header: 'Line Total',
        id: 'lineTotal',
        cell: ({ row }) => (
            <span className="whitespace-nowrap">
                {formatPrice(row.original.lineTotal)}
            </span>
        ),
    },
]

const SummaryStat = ({
    label,
    value,
    className,
}: {
    label: string
    value: string | number
    className?: string
}) => (
    <Card className={className}>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 break-words text-xl font-bold sm:text-2xl">
            {value}
        </div>
    </Card>
)

const SalesOrdersDashboard = () => {
    const orders = useSalesOrdersStore((s) => s.orders)
    const loading = useSalesOrdersStore((s) => s.loading)
    const error = useSalesOrdersStore((s) => s.error)
    const lastFetchedAt = useSalesOrdersStore((s) => s.lastFetchedAt)
    const fetchOrders = useSalesOrdersStore((s) => s.fetchOrders)

    const filters = useSalesOrdersStore((s) => s.filters)
    const setFilters = useSalesOrdersStore((s) => s.setFilters)
    const updatingId = useSalesOrdersStore((s) => s.updatingId)
    const updateOrderStatus = useSalesOrdersStore((s) => s.updateOrderStatus)
    const confirmOrder = useSalesOrdersStore((s) => s.confirmOrder)
    const { canUpdate } = useResourceAccess('sd.sales-orders')

    /** Branch filter + labels come from the MM Organization Branch master. */
    const { branches } = useSalesBranches()
    const branchFilterOptions = useMemo<BranchFilterOption[]>(
        () => [
            { value: 'all', label: 'All branches' },
            ...branches.map((branch) => ({
                value: branch.id,
                label: branch.label,
            })),
        ],
        [branches],
    )
    const branchNameOf = useCallback(
        (branchId: string | null | undefined) =>
            branchId
                ? (branches.find((branch) => branch.id === branchId)?.label ??
                  branchId)
                : '—',
        [branches],
    )

    /** Organization / MM companies for the company scope filter. */
    const [companyOptions, setCompanyOptions] = useState<CompanyFilterOption[]>(
        [],
    )
    useEffect(() => {
        let alive = true
        orgService
            .companies()
            .then((rows: { id: string; name: string }[]) => {
                if (!alive) return
                setCompanyOptions(
                    rows.map((company) => ({
                        value: company.id,
                        label: company.name,
                    })),
                )
            })
            .catch(() => undefined)
        return () => {
            alive = false
        }
    }, [])
    const companyFilterOptions = useMemo<CompanyFilterOption[]>(
        () => [{ value: 'all', label: 'All companies' }, ...companyOptions],
        [companyOptions],
    )

    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])
    const [channel, setChannel] = useState<ChannelFilter>('all')
    const [selectedSnapshot, setSelectedSnapshot] =
        useState<SalesOrderRecord | null>(null)
    const [searchInput, setSearchInput] = useState(filters.search)
    const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)

    const selected = selectedSnapshot
        ? (orders.find((order) => order.id === selectedSnapshot.id) ??
          selectedSnapshot)
        : null
    const setSelected = setSelectedSnapshot

    useEffect(() => {
        if (searchInput.trim() === filters.search.trim()) return
        const timer = window.setTimeout(
            () => void setFilters({ search: searchInput }),
            SEARCH_DEBOUNCE_MS,
        )
        return () => window.clearTimeout(timer)
    }, [searchInput, filters.search, setFilters])

    const changeStatus = async (status: RetailStatusTarget) => {
        if (!selected) return
        try {
            const updated = await updateOrderStatus(selected.id, status)
            setSelectedSnapshot(updated)
            notify(
                'success',
                'Status updated',
                `${updated.orderId} is now ${updated.status}.`,
            )
        } catch (error) {
            notify(
                'danger',
                'Status not updated',
                error instanceof Error ? error.message : 'Please try again.',
            )
        }
    }

    /** Approve a Draft order through the canonical SD to MM confirmation pipeline. */
    const approveOrder = useCallback(
        async (order: SalesOrderRecord) => {
            try {
                const updated = await confirmOrder(order.id)
                setSelectedSnapshot((current) =>
                    current?.id === updated.id ? updated : current,
                )
                notify(
                    'success',
                    'Order approved',
                    `${updated.orderId} is now ${updated.status}.`,
                )
            } catch (error) {
                notify(
                    'danger',
                    'Order not approved',
                    error instanceof Error
                        ? error.message
                        : 'Please try again.',
                )
            }
        },
        [confirmOrder],
    )

    const [paymentUpdatingId, setPaymentUpdatingId] = useState<string | null>(
        null,
    )

    /** Admin: verify a bank transfer / collect COD — then picking may start. */
    const markPaid = async (order: SalesOrderRecord) => {
        setPaymentUpdatingId(order.id)
        try {
            const updated = await markOrderPaymentPaid(order.id)
            setSelectedSnapshot(updated)
            await fetchOrders({ force: true })
            notify(
                'success',
                'Payment recorded',
                `${updated.orderId} is now Paid — the warehouse pipeline can proceed.`,
            )
        } catch (error) {
            notify(
                'danger',
                'Payment not updated',
                error instanceof Error ? error.message : 'Please try again.',
            )
        } finally {
            setPaymentUpdatingId(null)
        }
    }

    const hasActiveFilters =
        filters.search.trim() !== '' ||
        filters.dateRange !== 'all' ||
        filters.branchId !== 'all' ||
        filters.companyId !== 'all'

    useEffect(() => {
        void fetchOrders({ force: true })
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                void fetchOrders({ force: true })
            }
        }, REFRESH_INTERVAL_MS)
        return () => window.clearInterval(timer)
    }, [fetchOrders])

    useEffect(() => {
        if (lastFetchedAt === null) void fetchOrders()
    }, [lastFetchedAt, fetchOrders])

    const summary = useMemo(() => summarizeSalesOrders(orders), [orders])
    const visibleOrders = useMemo(
        () =>
            channel === 'all'
                ? orders
                : orders.filter((order) => order.channel === channel),
        [orders, channel],
    )

    const columns = useMemo<ColumnDef<SalesOrderRecord>[]>(
        () => [
            {
                header: 'Order ID',
                id: 'orderId',
                cell: ({ row }) => (
                    <div className="whitespace-nowrap">
                        <div className="font-mono font-semibold">
                            {row.original.orderId}
                        </div>
                        <div className="text-xs text-gray-500">
                            {formatDateTime(row.original.createdAt)}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Channel',
                id: 'channel',
                cell: ({ row }) => (
                    <ChannelBadge channel={row.original.channel} />
                ),
            },
            {
                header: 'Company',
                id: 'company',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap">
                        {row.original.company?.name ?? '—'}
                    </span>
                ),
            },
            {
                // Organization / MM branch master (created per company).
                header: 'Branch',
                id: 'branch',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap">
                        {branchNameOf(row.original.branchId)}
                    </span>
                ),
            },
            {
                header: 'Customer',
                id: 'customer',
                cell: ({ row }) => {
                    const { channel: orderChannel, customer } = row.original
                    const name =
                        (customer.name.trim() || '') === ''
                            ? orderChannel === 'POS'
                                ? 'Walk-in Customer'
                                : '—'
                            : customer.name
                    return (
                        <div className="min-w-[10rem]">
                            <div className="font-semibold">{name}</div>
                            <div className="text-xs text-gray-500">
                                {customer.email ?? '—'}
                            </div>
                        </div>
                    )
                },
            },
            {
                header: 'Total Amount',
                id: 'totalAmount',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-semibold">
                        {formatPrice(row.original.totalAmount)}
                    </span>
                ),
            },
            {
                header: 'Order Status',
                id: 'orderStatus',
                cell: ({ row }) => <StatusCell status={row.original.status} />,
            },
            {
                header: 'Payment Method',
                id: 'paymentMethod',
                cell: ({ row }) => {
                    const payment = row.original.payment
                    if (!payment)
                        return <span className="text-gray-400">—</span>
                    return (
                        <div className="whitespace-nowrap">
                            <span>
                                {payment.method &&
                                payment.method in PAYMENT_METHOD_LABEL
                                    ? PAYMENT_METHOD_LABEL[
                                          payment.method as keyof typeof PAYMENT_METHOD_LABEL
                                      ]
                                    : payment.method}
                            </span>
                            {payment.isDemo ? (
                                <span className="ml-1.5 rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:bg-gray-800">
                                    Demo
                                </span>
                            ) : null}
                        </div>
                    )
                },
            },
            {
                header: 'Payment Status',
                id: 'paymentStatus',
                cell: ({ row }) => {
                    const payment = row.original.payment
                    if (!payment)
                        return <span className="text-gray-400">—</span>
                    return (
                        <StatusBadge
                            tone={
                                payment.status === 'Paid'
                                    ? 'success'
                                    : payment.status === 'Failed'
                                      ? 'danger'
                                      : 'warning'
                            }
                        >
                            {payment.status ?? '—'}
                        </StatusBadge>
                    )
                },
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex items-center gap-2 whitespace-nowrap">
                        <Button
                            size="xs"
                            variant="default"
                            icon={<HiOutlineEye />}
                            onClick={() => setSelected(row.original)}
                        >
                            View Details
                        </Button>
                        {row.original.status === 'Draft' && canUpdate ? (
                            <Button
                                size="xs"
                                variant="solid"
                                customColorClass={() =>
                                    'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }
                                icon={<HiOutlineCheck />}
                                loading={updatingId === row.original.id}
                                disabled={updatingId !== null}
                                onClick={() => void approveOrder(row.original)}
                            >
                                Approve Order
                            </Button>
                        ) : null}
                    </div>
                ),
            },
        ],
        [approveOrder, branchNameOf, canUpdate, setSelected, updatingId],
    )

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Sales Orders & Billing - Mission Control"
                description="POS fast-track sales and e-commerce standard orders for the retail division."
                actions={
                    <Button
                        size="sm"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={() => void fetchOrders({ force: true })}
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

            <Tabs
                value={channel}
                onChange={(value) => setChannel(value as ChannelFilter)}
            >
                <TabList>
                    <TabNav value="all" className="shrink-0 whitespace-nowrap">
                        All Orders ({summary.orderCount})
                    </TabNav>
                    <TabNav value="POS" className="shrink-0 whitespace-nowrap">
                        POS
                        <span className="hidden sm:inline">
                            &nbsp;Fast-Track
                        </span>
                        &nbsp;({summary.posCount})
                    </TabNav>
                    <TabNav
                        value="E-commerce"
                        className="shrink-0 whitespace-nowrap"
                    >
                        E-commerce
                        <span className="hidden sm:inline">&nbsp;Standard</span>
                        &nbsp;({summary.ecommerceCount})
                    </TabNav>
                </TabList>
            </Tabs>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                    className="md:max-w-md"
                    prefix={<HiOutlineSearch className="text-lg" />}
                    placeholder="Search order ID, customer name or email..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                />
                <div className="md:w-48">
                    <Select<DateRangeOption>
                        isSearchable={false}
                        options={DATE_RANGE_OPTIONS}
                        value={DATE_RANGE_OPTIONS.find(
                            (option) => option.value === filters.dateRange,
                        )}
                        onChange={(option) =>
                            void setFilters({
                                dateRange: option?.value ?? 'all',
                            })
                        }
                    />
                </div>
                <div className="md:w-56">
                    <Select<BranchFilterOption>
                        isSearchable={false}
                        options={branchFilterOptions}
                        value={branchFilterOptions.find(
                            (option) => option.value === filters.branchId,
                        )}
                        onChange={(option) =>
                            void setFilters({
                                branchId: option?.value ?? 'all',
                            })
                        }
                    />
                </div>
                <div className="md:w-56">
                    <Select<CompanyFilterOption>
                        isSearchable={false}
                        options={companyFilterOptions}
                        value={companyFilterOptions.find(
                            (option) => option.value === filters.companyId,
                        )}
                        onChange={(option) =>
                            void setFilters({
                                companyId: option?.value ?? 'all',
                            })
                        }
                    />
                </div>
                {hasActiveFilters ? (
                    <Button
                        size="sm"
                        variant="plain"
                        className="self-start md:self-auto"
                        onClick={() => {
                            setSearchInput('')
                            void setFilters({
                                search: '',
                                dateRange: 'all',
                                branchId: 'all',
                                companyId: 'all',
                            })
                        }}
                    >
                        Clear filters
                    </Button>
                ) : null}
            </div>

            <div className="my-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <SummaryStat label="Orders" value={summary.orderCount} />
                <SummaryStat
                    label="Pending Delivery"
                    value={summary.pendingDeliveryCount}
                />
                <SummaryStat
                    className="col-span-2 sm:col-span-1"
                    label="Gross Sales"
                    value={formatPrice(summary.totalRevenue)}
                />
            </div>

            <Card>
                <DataTable
                    columns={columns}
                    data={visibleOrders}
                    loading={loading && orders.length === 0}
                    noData={!loading && visibleOrders.length === 0}
                    hidePagination
                />
            </Card>

            <Dialog
                isOpen={selected !== null}
                width={640}
                onClose={() => setSelected(null)}
                onRequestClose={() => setSelected(null)}
            >
                {selected ? (
                    <div>
                        <div className="mb-4 flex flex-wrap items-center gap-2 pr-8">
                            <h5 className="font-mono">{selected.orderId}</h5>
                            <ChannelBadge channel={selected.channel} />
                            <StatusCell status={selected.status} />
                        </div>
                        <div className="mb-4 grid gap-1 break-words text-sm sm:grid-cols-2">
                            <div>
                                <span className="text-gray-500">
                                    Customer:{' '}
                                </span>
                                {selected.customer.name}
                            </div>
                            <div>
                                <span className="text-gray-500">Email: </span>
                                {selected.customer.email ?? '—'}
                            </div>
                            <div>
                                <span className="text-gray-500">Company: </span>
                                {selected.company?.name ?? '—'}
                            </div>
                            <div>
                                <span className="text-gray-500">Branch: </span>
                                {branchNameOf(selected.branchId)}
                            </div>
                            <div>
                                <span className="text-gray-500">Created: </span>
                                {formatDateTime(selected.createdAt)}
                            </div>
                        </div>
                        <div className="sm:max-h-[40vh] sm:overflow-y-auto">
                            <DataTable
                                columns={lineColumns}
                                data={selected.lines}
                                hidePagination
                            />
                        </div>
                        <div className="mt-4 ml-auto flex w-full flex-col gap-1 text-sm sm:max-w-xs">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Subtotal</span>
                                <span>{formatPrice(selected.subtotal)}</span>
                            </div>
                            {selected.promoCode ? (
                                <div className="flex justify-between text-emerald-600">
                                    <span>Promo ({selected.promoCode})</span>
                                    <span>
                                        −{formatPrice(selected.discountAmount)}
                                    </span>
                                </div>
                            ) : null}
                            {selected.channel === 'E-commerce' ? (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">
                                        Shipping
                                    </span>
                                    <span>
                                        {formatPrice(selected.shipping)}
                                    </span>
                                </div>
                            ) : null}
                            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold dark:border-gray-700">
                                <span>Total</span>
                                <span>{formatPrice(selected.totalAmount)}</span>
                            </div>
                            {selected.paymentReceived !== null ? (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">
                                            Cash
                                        </span>
                                        <span>
                                            {formatPrice(
                                                selected.paymentReceived,
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">
                                            Change
                                        </span>
                                        <span>
                                            {formatPrice(selected.change ?? 0)}
                                        </span>
                                    </div>
                                </>
                            ) : null}
                        </div>
                        {selected.payment ? (
                            <div className="mt-3 flex flex-col gap-0.5 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-gray-500">
                                        Payment Method
                                    </span>
                                    <span className="flex items-center gap-2 font-medium">
                                        {selected.payment.method &&
                                        selected.payment.method in
                                            PAYMENT_METHOD_LABEL
                                            ? PAYMENT_METHOD_LABEL[
                                                  selected.payment
                                                      .method as keyof typeof PAYMENT_METHOD_LABEL
                                              ]
                                            : selected.payment.method}
                                        {selected.payment.isDemo ? (
                                            <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:bg-gray-800">
                                                Demo
                                            </span>
                                        ) : null}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-gray-500">
                                        Payment Status
                                    </span>
                                    <StatusBadge
                                        tone={
                                            selected.payment.status === 'Paid'
                                                ? 'success'
                                                : selected.payment.status ===
                                                    'Failed'
                                                  ? 'danger'
                                                  : 'warning'
                                        }
                                    >
                                        {selected.payment.status ?? '—'}
                                    </StatusBadge>
                                </div>
                                {selected.payment.reference ? (
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-gray-500">
                                            Reference
                                        </span>
                                        <span className="font-mono text-xs">
                                            {selected.payment.reference}
                                        </span>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                            {canUpdate && selected.status === 'Draft' ? (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    className="flex-1 sm:flex-none"
                                    customColorClass={() =>
                                        'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    }
                                    icon={<HiOutlineCheck />}
                                    loading={updatingId === selected.id}
                                    disabled={updatingId !== null}
                                    onClick={() => void approveOrder(selected)}
                                >
                                    Approve Order
                                </Button>
                            ) : null}
                            {canUpdate && canRecordPayment(selected) ? (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    className="flex-1 sm:flex-none"
                                    icon={<HiOutlineCheck />}
                                    loading={paymentUpdatingId === selected.id}
                                    onClick={() => void markPaid(selected)}
                                >
                                    {selected.payment?.status ===
                                    'Pending Verification'
                                        ? 'Verify & Mark Paid'
                                        : 'Mark Paid'}
                                </Button>
                            ) : null}
                            {canUpdate &&
                            selected.channel === 'E-commerce' &&
                            (selected.status === 'Pending Delivery' ||
                                selected.status === 'Delivered') ? (
                                <>
                                    {selected.status === 'Pending Delivery' ? (
                                        <>
                                            <div className="w-full text-xs text-gray-500 sm:mr-auto sm:w-auto">
                                                Fulfillment proceeds through
                                                picking, packing, dispatch, and
                                                delivery. Mark Completed is
                                                available only after delivery.
                                            </div>
                                            <Link href="/modules/mm/warehouse-management/picking">
                                                <Button
                                                    size="sm"
                                                    className="flex-1 sm:flex-none"
                                                >
                                                    Go to Picking
                                                </Button>
                                            </Link>
                                            {selected.customerCancel
                                                ?.canCancel ? (
                                                <Button
                                                    size="sm"
                                                    variant="solid"
                                                    className="flex-1 sm:flex-none"
                                                    customColorClass={() =>
                                                        'bg-red-500 hover:bg-red-600 text-white'
                                                    }
                                                    icon={<HiOutlineX />}
                                                    disabled={
                                                        updatingId ===
                                                        selected.id
                                                    }
                                                    onClick={() =>
                                                        setConfirmCancelOpen(
                                                            true,
                                                        )
                                                    }
                                                >
                                                    Cancel Order
                                                </Button>
                                            ) : null}
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-full text-xs text-gray-500 sm:mr-auto sm:w-auto">
                                                Shipment delivered. Close the
                                                commercial order when all
                                                delivery evidence is accepted.
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="solid"
                                                className="flex-1 sm:flex-none"
                                                icon={<HiOutlineCheck />}
                                                loading={
                                                    updatingId === selected.id
                                                }
                                                onClick={() =>
                                                    void changeStatus(
                                                        'Completed',
                                                    )
                                                }
                                            >
                                                Mark Completed
                                            </Button>
                                        </>
                                    )}
                                </>
                            ) : null}
                            <Button
                                size="sm"
                                className="w-full sm:w-auto"
                                onClick={() => setSelected(null)}
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Dialog>

            <ConfirmDialog
                isOpen={confirmCancelOpen}
                type="danger"
                title="Cancel this order?"
                cancelText="Keep order"
                confirmText="Cancel Order"
                confirmButtonProps={{
                    customColorClass: () =>
                        'bg-red-500 hover:bg-red-600 text-white',
                }}
                onClose={() => setConfirmCancelOpen(false)}
                onRequestClose={() => setConfirmCancelOpen(false)}
                onCancel={() => setConfirmCancelOpen(false)}
                onConfirm={() => {
                    setConfirmCancelOpen(false)
                    void changeStatus('Cancelled')
                }}
            >
                <p>
                    {selected?.orderId} will be marked Cancelled. This cannot be
                    undone from the dashboard.
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default SalesOrdersDashboard
