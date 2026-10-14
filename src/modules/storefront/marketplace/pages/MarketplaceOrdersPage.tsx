'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
    HiOutlineCheck,
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineCreditCard,
    HiOutlineCurrencyDollar,
    HiOutlineDuplicate,
    HiOutlineExclamationCircle,
    HiOutlineLocationMarker,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineShare,
    HiOutlineShoppingBag,
    HiOutlineTruck,
    HiOutlineX,
    HiOutlineXCircle,
} from 'react-icons/hi'
import type { IconType } from 'react-icons'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import MarketplaceHeader from '../components/MarketplaceHeader'
import {
    CUSTOMER_CANCEL_REASONS,
    PAYMENT_METHOD_LABEL,
    cancelCustomerOrder,
    createOrderTrackingLink,
    getOrderTracking,
    getOrderTrackingBatch,
    getSalesOrders,
    type CustomerOrderStatus,
    type OrderTracking,
    type SalesOrderRecord,
} from '@/modules/sd/services/salesOrderDashboardService'
import { RetailSessionExpiredError } from '@/services/storefront/retailClientService'
import OrderTrackingTimeline from '../components/OrderTrackingTimeline'
import {
    DeliveryMapPanel,
    OrderProgressStepper,
    TrackingStatusPill,
} from '../components/OrderTrackingParts'
import { useMarketplaceProducts } from '@/modules/sd/hooks/useMarketplaceProducts'
import StorefrontReturnDialog from '@/modules/storefront/shared/components/StorefrontReturnDialog'
import { useMarketplace } from '../MarketplaceProvider'
import {
    MARKETPLACE_ORDERS_PATH,
    MARKETPLACE_PATH,
    MARKETPLACE_SIGN_IN_PATH,
    marketplaceAuthHref,
    marketplaceTrackHref,
} from '../host'
import { formatPrice } from '../marketplaceUi'

const TRACKING_POLL_MS = 45_000

const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(iso))

type OrdersFilter =
    | 'all'
    | 'Pending Delivery'
    | 'In Transit'
    | 'Delivered'
    | 'Completed'
    | 'Cancelled'

const FILTER_CONFIG: Record<
    OrdersFilter,
    { label: string; icon: IconType; color: string }
> = {
    all: { label: 'All orders', icon: HiOutlineShoppingBag, color: 'emerald' },
    'Pending Delivery': {
        label: 'To be delivered',
        icon: HiOutlineClock,
        color: 'amber',
    },
    'In Transit': { label: 'In transit', icon: HiOutlineTruck, color: 'blue' },
    Delivered: {
        label: 'Delivered',
        icon: HiOutlineCheckCircle,
        color: 'teal',
    },
    Completed: {
        label: 'Completed',
        icon: HiOutlineCheckCircle,
        color: 'emerald',
    },
    Cancelled: { label: 'Cancelled', icon: HiOutlineXCircle, color: 'rose' },
}

const FILTERS: OrdersFilter[] = [
    'all',
    'Pending Delivery',
    'In Transit',
    'Delivered',
    'Completed',
    'Cancelled',
]

const productLookupKey = (divisionId: string | null, sku: string) =>
    `${divisionId ?? '?'}:${sku}`

const paymentLabel = (method: string | null) =>
    method && method in PAYMENT_METHOD_LABEL
        ? PAYMENT_METHOD_LABEL[method as keyof typeof PAYMENT_METHOD_LABEL]
        : (method ?? '—')

/**
 * Tab bucket. "In transit" comes only from the server tracking status (trip
 * started); SO SHIPPED (goods issue) alone stays "To be delivered".
 */
const orderBucket = (
    order: SalesOrderRecord,
    tracking: OrderTracking | undefined,
): Exclude<OrdersFilter, 'all'> => {
    if (order.status === 'Cancelled' || tracking?.customerStatus === 'CANCELLED')
        return 'Cancelled'
    if (order.status === 'Completed') return 'Completed'
    if (order.status === 'Delivered' || tracking?.customerStatus === 'DELIVERED')
        return 'Delivered'
    if (tracking?.customerStatus === 'IN_TRANSIT') return 'In Transit'
    return 'Pending Delivery'
}

const FALLBACK_PILL: Record<
    Exclude<OrdersFilter, 'all'>,
    { status: CustomerOrderStatus; label: string }
> = {
    'Pending Delivery': { status: 'CONFIRMED', label: 'To be delivered' },
    'In Transit': { status: 'IN_TRANSIT', label: 'In transit' },
    Delivered: { status: 'DELIVERED', label: 'Delivered' },
    Completed: { status: 'DELIVERED', label: 'Completed' },
    Cancelled: { status: 'CANCELLED', label: 'Cancelled' },
}

function OrderStatusPill({
    tracking,
    bucket,
}: {
    tracking: OrderTracking | undefined
    bucket: Exclude<OrdersFilter, 'all'>
}) {
    return (
        <TrackingStatusPill
            status={tracking?.customerStatus ?? FALLBACK_PILL[bucket].status}
            label={tracking?.customerStatusLabel ?? FALLBACK_PILL[bucket].label}
        />
    )
}

const MarketplaceOrdersPage = () => {
    const { signedInClient, sessionToken } = useMarketplace()
    const catalog = useMarketplaceProducts()
    const customerId = signedInClient?.customerId ?? null

    const [orders, setOrders] = useState<SalesOrderRecord[] | null>(null)
    const [trackingById, setTrackingById] = useState<
        Record<string, OrderTracking>
    >({})
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [trackingLoadingId, setTrackingLoadingId] = useState<string | null>(
        null,
    )
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<OrdersFilter>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null)

    const [returnOrder, setReturnOrder] = useState<SalesOrderRecord | null>(null)
    const [returnMessage, setReturnMessage] = useState<string | null>(null)
    const [cancelOrder, setCancelOrder] = useState<SalesOrderRecord | null>(null)
    const [cancelReason, setCancelReason] = useState<string>(
        CUSTOMER_CANCEL_REASONS[0],
    )
    const [cancelReasonOptions] = useState(
        CUSTOMER_CANCEL_REASONS.map((reason) => ({
            value: reason,
            label: reason,
        })),
    )
    const [cancelError, setCancelError] = useState<string | null>(null)
    const [cancelling, setCancelling] = useState(false)

    const productsByKey = useMemo(
        () =>
            new Map(
                catalog.records.map((product) => [
                    productLookupKey(product.divisionId, product.sku),
                    product,
                ]),
            ),
        [catalog.records],
    )

    const load = useCallback(async () => {
        if (!customerId) return
        setLoading(true)
        setError(null)
        try {
            const rows = await getSalesOrders({ customerId })
            setOrders(rows)
            if (sessionToken) {
                try {
                    const tracking = await getOrderTrackingBatch(
                        rows.map((order) => order.id),
                        sessionToken,
                    )
                    // The list batch carries no map; keep the last single-order map until the next poll.
                    setTrackingById((prev) =>
                        Object.fromEntries(
                            tracking.map((t) => {
                                const kept = prev[t.orderId]
                                return [
                                    t.orderId,
                                    kept?.map
                                        ? { ...t, destination: kept.destination, map: kept.map }
                                        : t,
                                ]
                            }),
                        ),
                    )
                } catch (err) {
                    if (err instanceof RetailSessionExpiredError) {
                        setError(err.message)
                    }
                }
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Unable to load your orders',
            )
        } finally {
            setLoading(false)
        }
    }, [customerId, sessionToken])

    const toggleTracking = useCallback(
        async (orderId: string) => {
            if (expandedId === orderId) {
                setExpandedId(null)
                return
            }
            setExpandedId(orderId)
            if (!sessionToken) return
            setTrackingLoadingId(orderId)
            try {
                const fresh = await getOrderTracking(orderId, sessionToken)
                setTrackingById((prev) => ({ ...prev, [orderId]: fresh }))
            } catch (err) {
                if (err instanceof RetailSessionExpiredError) setError(err.message)
            } finally {
                setTrackingLoadingId(null)
            }
        },
        [expandedId, sessionToken],
    )

    const [sharingId, setSharingId] = useState<string | null>(null)
    const [sharedId, setSharedId] = useState<string | null>(null)

    /** Mint a signed read-only link; native share sheet on mobile, clipboard otherwise. */
    const shareTracking = useCallback(
        async (orderId: string) => {
            if (!sessionToken) return
            setSharingId(orderId)
            try {
                const { token } = await createOrderTrackingLink(orderId, sessionToken)
                const url = `${window.location.origin}${marketplaceTrackHref(token)}`
                if (typeof navigator.share === 'function') {
                    try {
                        await navigator.share({ title: 'Track my order', url })
                        return
                    } catch (err) {
                        if (err instanceof DOMException && err.name === 'AbortError') return
                    }
                }
                await navigator.clipboard.writeText(url)
                setSharedId(orderId)
                window.setTimeout(() => setSharedId(null), 2500)
            } catch (err) {
                if (err instanceof RetailSessionExpiredError) setError(err.message)
                else setError(err instanceof Error ? err.message : 'Unable to share tracking')
            } finally {
                setSharingId(null)
            }
        },
        [sessionToken],
    )

    const expandedInTransit =
        expandedId != null &&
        trackingById[expandedId]?.customerStatus === 'IN_TRANSIT'

    useEffect(() => {
        if (!expandedId || !expandedInTransit || !sessionToken) return
        const id = window.setInterval(() => {
            getOrderTracking(expandedId, sessionToken)
                .then((fresh) =>
                    setTrackingById((prev) => ({ ...prev, [expandedId]: fresh })),
                )
                .catch((err) => {
                    if (err instanceof RetailSessionExpiredError) setError(err.message)
                })
        }, TRACKING_POLL_MS)
        return () => window.clearInterval(id)
    }, [expandedId, expandedInTransit, sessionToken])

    useEffect(() => {
        if (customerId) void load()
    }, [customerId, load])

    const submitCancellation = useCallback(async () => {
        if (!cancelOrder || !sessionToken) return
        setCancelling(true)
        setCancelError(null)
        try {
            await cancelCustomerOrder(
                cancelOrder.id,
                cancelReason.trim() || CUSTOMER_CANCEL_REASONS[0],
                sessionToken,
            )
            setReturnMessage(
                `Order ${cancelOrder.orderId} cancelled — reserved stock has been released.`,
            )
            setCancelOrder(null)
            void load()
        } catch (error) {
            setCancelError(
                error instanceof Error
                    ? error.message
                    : 'Unable to cancel this order',
            )
        } finally {
            setCancelling(false)
        }
    }, [cancelOrder, cancelReason, sessionToken, load])

    useEffect(() => {
        setOrders(null)
        setTrackingById({})
        setExpandedId(null)
        setReturnMessage(null)
    }, [customerId])

    const copyOrderNumber = (orderId: string) => {
        navigator.clipboard.writeText(orderId)
        setCopiedOrderId(orderId)
        setTimeout(() => setCopiedOrderId(null), 2000)
    }

    const bucketById = useMemo(
        () =>
            new Map(
                (orders ?? []).map((order) => [
                    order.id,
                    orderBucket(order, trackingById[order.id]),
                ]),
            ),
        [orders, trackingById],
    )

    const summary = useMemo(() => {
        const rows = orders ?? []
        const count = (bucket: Exclude<OrdersFilter, 'all'>) =>
            rows.filter((o) => bucketById.get(o.id) === bucket).length
        return {
            total: rows.length,
            pending: count('Pending Delivery'),
            inTransit: count('In Transit'),
            delivered: count('Delivered'),
            completed: count('Completed'),
            cancelled: count('Cancelled'),
            spent: rows
                .filter((o) => bucketById.get(o.id) !== 'Cancelled')
                .reduce((sum, o) => sum + o.totalAmount, 0),
        }
    }, [orders, bucketById])

    const visibleOrders = useMemo(() => {
        let list = orders ?? []
        if (filter !== 'all') {
            list = list.filter((order) => bucketById.get(order.id) === filter)
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim()
            list = list.filter(
                (order) =>
                    order.orderId.toLowerCase().includes(q) ||
                    order.lines.some(
                        (l) =>
                            l.name.toLowerCase().includes(q) ||
                            (l.productName &&
                                l.productName.toLowerCase().includes(q)) ||
                            l.sku.toLowerCase().includes(q),
                    ),
            )
        }
        return list
    }, [orders, filter, searchQuery, bucketById])

    const countFor = (value: OrdersFilter) =>
        value === 'all'
            ? summary.total
            : value === 'Pending Delivery'
              ? summary.pending
              : value === 'In Transit'
                ? summary.inTransit
                : value === 'Delivered'
                  ? summary.delivered
                  : value === 'Completed'
                    ? summary.completed
                    : summary.cancelled

    if (!signedInClient) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col">
                <MarketplaceHeader />
                <div className="mx-auto flex flex-1 w-full max-w-md flex-col items-center justify-center gap-5 px-4 py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-inner">
                        <HiOutlineClipboardList className="text-3xl" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                            Track Your Orders
                        </h1>
                        <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
                            Sign in to your account to review live delivery status,
                            order history, and receipts.
                        </p>
                    </div>
                    <Link
                        href={marketplaceAuthHref(
                            MARKETPLACE_SIGN_IN_PATH,
                            MARKETPLACE_ORDERS_PATH,
                        )}
                        className="w-full inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 hover:from-emerald-700 hover:to-teal-700 transition-all hover:scale-[1.02]"
                    >
                        Sign in to view orders &rarr;
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] text-gray-700 flex flex-col antialiased">
            <MarketplaceHeader />

            <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Breadcrumbs & Page Header */}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <nav className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-1.5">
                            <Link
                                href={MARKETPLACE_PATH}
                                className="hover:text-emerald-600 transition-colors"
                            >
                                Marketplace
                            </Link>
                            <span>/</span>
                            <span className="text-gray-700 font-semibold">
                                My Orders
                            </span>
                        </nav>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
                                My Orders
                            </h1>
                            <span className="rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                                {summary.total} {summary.total === 1 ? 'Order' : 'Orders'}
                            </span>
                        </div>
                        <p className="mt-0.5 text-sm text-gray-500">
                            Logged in as{' '}
                            <span className="font-semibold text-gray-800">
                                {signedInClient.fullName ?? signedInClient.email}
                            </span>
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            loading={loading}
                            icon={<HiOutlineRefresh className={loading ? 'animate-spin' : ''} />}
                            onClick={() => void load()}
                            className="!rounded-xl !border-gray-200 !bg-white hover:!bg-gray-50 text-gray-700 shadow-sm"
                        >
                            Refresh
                        </Button>
                        <Link
                            href={MARKETPLACE_PATH}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 transition-all"
                        >
                            <HiOutlineShoppingBag className="text-sm" />
                            Browse Shop
                        </Link>
                    </div>
                </div>

                {/* Elevated Metric Cards */}
                <div className="mb-8 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                    {/* Total Orders */}
                    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                Total Orders
                            </span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                <HiOutlineShoppingBag className="text-lg" />
                            </div>
                        </div>
                        <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900">
                            {summary.total}
                        </div>
                        <span className="mt-1 inline-block text-[11px] font-medium text-gray-400">
                            Lifetime orders placed
                        </span>
                    </div>

                    {/* To Be Delivered */}
                    <div className="relative overflow-hidden rounded-2xl border border-amber-100/80 bg-gradient-to-br from-white via-white to-amber-50/30 p-4 sm:p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                                To Be Delivered
                            </span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100/70 text-amber-600">
                                <HiOutlineClock className="text-lg" />
                            </div>
                        </div>
                        <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-amber-900">
                            {summary.pending}
                        </div>
                        <span className="mt-1 inline-block text-[11px] font-semibold text-amber-600">
                            Confirmed &amp; reserved
                        </span>
                    </div>

                    {/* Delivered & Completed */}
                    <div className="relative overflow-hidden rounded-2xl border border-emerald-100/80 bg-gradient-to-br from-white via-white to-emerald-50/30 p-4 sm:p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                                Completed
                            </span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100/70 text-emerald-600">
                                <HiOutlineCheckCircle className="text-lg" />
                            </div>
                        </div>
                        <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-emerald-900">
                            {summary.completed + summary.delivered}
                        </div>
                        <span className="mt-1 inline-block text-[11px] font-semibold text-emerald-600">
                            Delivered packages
                        </span>
                    </div>

                    {/* Total Spent */}
                    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                Total Spent
                            </span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                                <HiOutlineCurrencyDollar className="text-lg" />
                            </div>
                        </div>
                        <div className="mt-2 text-xl sm:text-2xl font-extrabold text-gray-900 truncate">
                            {formatPrice(summary.spent)}
                        </div>
                        <span className="mt-1 inline-block text-[11px] font-medium text-gray-400">
                            Excludes cancelled
                        </span>
                    </div>
                </div>

                {/* Notifications and Alerts */}
                {error && (
                    <Alert showIcon type="danger" className="mb-6 rounded-2xl">
                        <div className="flex items-center justify-between gap-2">
                            <span>{error}</span>
                            <Button size="xs" onClick={() => void load()}>
                                Retry
                            </Button>
                        </div>
                    </Alert>
                )}

                {returnMessage && (
                    <Alert showIcon type="success" className="mb-6 rounded-2xl">
                        {returnMessage}
                    </Alert>
                )}

                {/* Search & Status Filter Controls */}
                <div className="mb-6 space-y-3.5">
                    {/* Search box */}
                    <div className="relative max-w-md">
                        <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by Order # or item name..."
                            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-9 text-xs sm:text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <HiOutlineX className="text-sm" />
                            </button>
                        )}
                    </div>

                    {/* Custom Pill Tabs Bar */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-2xl bg-gray-100/90 p-1.5">
                        {FILTERS.map((tabKey) => {
                            const config = FILTER_CONFIG[tabKey]
                            const isActive = filter === tabKey
                            const count = countFor(tabKey)
                            const TabIcon = config.icon

                            return (
                                <button
                                    key={tabKey}
                                    type="button"
                                    onClick={() => setFilter(tabKey)}
                                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
                                        isActive
                                            ? 'bg-white text-emerald-800 shadow-sm'
                                            : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
                                    }`}
                                >
                                    <TabIcon
                                        className={`text-sm ${
                                            isActive
                                                ? 'text-emerald-600'
                                                : 'text-gray-400'
                                        }`}
                                    />
                                    <span>{config.label}</span>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                            isActive
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-gray-200/70 text-gray-600'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Orders Content Feed */}
                {loading && !orders ? (
                    <div className="flex h-64 flex-col items-center justify-center gap-3">
                        <Spinner size="lg" />
                        <span className="text-xs font-medium text-gray-400">
                            Loading your orders...
                        </span>
                    </div>
                ) : visibleOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-white py-16 px-4 text-center shadow-sm">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 text-gray-400 mb-3">
                            <HiOutlineClipboardList className="text-3xl" />
                        </div>
                        <h3 className="text-base font-bold text-gray-900">
                            No {FILTER_CONFIG[filter].label.toLowerCase()} found
                        </h3>
                        <p className="mt-1 max-w-sm text-xs text-gray-500 leading-relaxed">
                            {searchQuery
                                ? `No orders matched "${searchQuery}". Try a different keyword.`
                                : "You haven't placed any orders in this category yet."}
                        </p>
                        <Link
                            href={MARKETPLACE_PATH}
                            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 transition-all hover:scale-105"
                        >
                            <HiOutlineShoppingBag className="text-sm" />
                            Start shopping now
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {visibleOrders.map((order) => {
                            const payment = order.payment
                            const ship = order.shippingAddress
                            const tracking = trackingById[order.id]
                            const bucket =
                                bucketById.get(order.id) ?? 'Pending Delivery'
                            const isPending = bucket === 'Pending Delivery'
                            const isCompleted = order.status === 'Completed'
                            const expanded = expandedId === order.id
                            const currentCheckpoint = tracking?.checkpoints.find(
                                (c) => c.current,
                            )

                            return (
                                <article
                                    key={order.id}
                                    className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all duration-200"
                                >
                                    {/* Order Top Ribbon */}
                                    <div className="border-b border-gray-100 bg-gray-50/80 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex flex-wrap items-center gap-3 text-xs">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono font-bold text-gray-900 text-sm">
                                                    #{order.orderId}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => copyOrderNumber(order.orderId)}
                                                    className="rounded p-1 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700 transition-colors"
                                                    title="Copy order number"
                                                >
                                                    {copiedOrderId === order.orderId ? (
                                                        <HiOutlineCheck className="text-emerald-600 text-sm" />
                                                    ) : (
                                                        <HiOutlineDuplicate className="text-sm" />
                                                    )}
                                                </button>
                                            </div>

                                            <span className="text-gray-300">|</span>

                                            <span className="text-gray-500 flex items-center gap-1">
                                                <HiOutlineClock className="text-xs text-gray-400" />
                                                {formatDate(order.createdAt)}
                                            </span>

                                            <span className="text-gray-300">|</span>

                                            <span className="text-gray-500">
                                                Sold by{' '}
                                                <span className="font-semibold text-gray-800">
                                                    {order.company?.name || 'Amalgated Marketplace'}
                                                </span>
                                            </span>
                                        </div>

                                        {/* Status Tag Pill */}
                                        <div className="flex items-center gap-2">
                                            <OrderStatusPill
                                                tracking={tracking}
                                                bucket={bucket}
                                            />
                                        </div>
                                    </div>

                                    {/* Order Tracking */}
                                    <div className="px-5 py-3 border-b border-gray-50 bg-white">
                                        {tracking && (
                                            <div className="mb-2">
                                                <OrderProgressStepper
                                                    checkpoints={tracking.checkpoints}
                                                />
                                            </div>
                                        )}
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="min-w-0 text-xs text-gray-500">
                                                {currentCheckpoint ? (
                                                    <>
                                                        <span className="font-semibold text-gray-800">
                                                            {currentCheckpoint.label}
                                                        </span>
                                                        {currentCheckpoint.at && (
                                                            <> · {formatDate(currentCheckpoint.at)}</>
                                                        )}
                                                    </>
                                                ) : (
                                                    'Tracking details unavailable'
                                                )}
                                            </div>
                                            {sessionToken && (
                                                <div className="flex items-center gap-1">
                                                    {tracking &&
                                                        tracking.customerStatus !== 'CANCELLED' && (
                                                            <Button
                                                                size="xs"
                                                                variant="plain"
                                                                loading={sharingId === order.id}
                                                                icon={
                                                                    sharedId === order.id ? (
                                                                        <HiOutlineCheck />
                                                                    ) : (
                                                                        <HiOutlineShare />
                                                                    )
                                                                }
                                                                onClick={() => void shareTracking(order.id)}
                                                                className="!rounded-lg font-semibold !text-gray-600 hover:!bg-gray-100"
                                                            >
                                                                {sharedId === order.id
                                                                    ? 'Link copied'
                                                                    : 'Share tracking'}
                                                            </Button>
                                                        )}
                                                    <Button
                                                        size="xs"
                                                        variant="plain"
                                                        loading={trackingLoadingId === order.id}
                                                        icon={<HiOutlineTruck />}
                                                        onClick={() => void toggleTracking(order.id)}
                                                        className="!rounded-lg font-semibold !text-emerald-700 hover:!bg-emerald-50"
                                                    >
                                                        {expanded ? 'Hide tracking' : 'Track order'}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        {expanded &&
                                            tracking?.customerStatus === 'IN_TRANSIT' &&
                                            tracking.map && (
                                            <div className="mt-4">
                                                <DeliveryMapPanel tracking={tracking} />
                                            </div>
                                        )}
                                        {expanded && tracking && (
                                            <div className="mt-4 pl-1">
                                                <OrderTrackingTimeline
                                                    checkpoints={tracking.checkpoints}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Products Line Items */}
                                    <div className="px-5 py-4 divide-y divide-gray-100">
                                        {order.lines.map((line) => {
                                            const product = productsByKey.get(
                                                productLookupKey(
                                                    line.divisionId,
                                                    line.sku === '—' ? '' : line.sku,
                                                ),
                                            )
                                            const image =
                                                line.productImage || product?.imageUrl

                                            return (
                                                <div
                                                    key={line.lineId}
                                                    className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0"
                                                >
                                                    {image ? (
                                                        <img
                                                            src={image}
                                                            alt={line.productName ?? line.name}
                                                            className="h-16 w-16 shrink-0 rounded-xl border border-gray-100 bg-gray-50 object-cover shadow-sm"
                                                        />
                                                    ) : (
                                                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-300">
                                                            <HiOutlineShoppingBag className="text-2xl" />
                                                        </div>
                                                    )}

                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="truncate text-sm font-semibold text-gray-900">
                                                            {line.productName ?? line.name}
                                                        </h4>
                                                        {line.variantName &&
                                                            line.variantName.trim().toLowerCase() !==
                                                                (line.productName ?? line.name)
                                                                    .trim()
                                                                    .toLowerCase() && (
                                                                <span className="inline-block mt-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                                                    {line.variantName}
                                                                </span>
                                                            )}
                                                        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 font-mono">
                                                            <span>SKU: {line.sku}</span>
                                                            <span>·</span>
                                                            <span>
                                                                {line.quantity} × {formatPrice(line.unitPrice)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="text-right">
                                                        <div className="text-sm font-bold text-gray-900">
                                                            {formatPrice(line.lineTotal)}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Order Metadata & Summary Bar */}
                                    <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                            {/* Delivery Address */}
                                            <div className="space-y-1">
                                                <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px] flex items-center gap-1">
                                                    <HiOutlineLocationMarker className="text-emerald-600 text-xs" />
                                                    Delivery Address
                                                </span>
                                                {ship ? (
                                                    <div>
                                                        <p className="font-semibold text-gray-900">
                                                            {ship.name}
                                                        </p>
                                                        <p className="text-gray-500 line-clamp-2 leading-relaxed mt-0.5">
                                                            {[
                                                                ship.line1,
                                                                ship.city,
                                                                ship.region,
                                                                ship.postalCode,
                                                            ]
                                                                .filter(Boolean)
                                                                .join(', ')}
                                                        </p>
                                                        {ship.phone && (
                                                            <p className="text-gray-400 font-mono mt-0.5">
                                                                {ship.phone}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="text-gray-400 italic">
                                                        Standard fulfillment address
                                                    </p>
                                                )}
                                            </div>

                                            {/* Payment Information */}
                                            <div className="space-y-1">
                                                <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px] flex items-center gap-1">
                                                    <HiOutlineCreditCard className="text-emerald-600 text-xs" />
                                                    Payment Method
                                                </span>
                                                {payment ? (
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-gray-900">
                                                                {paymentLabel(payment.method)}
                                                            </span>
                                                            {payment.isDemo && (
                                                                <span className="rounded bg-gray-200/70 px-1.5 py-0.2 text-[9px] font-bold uppercase text-gray-500">
                                                                    Demo
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="mt-1 flex items-center gap-1.5">
                                                            <span className="text-gray-400">Status:</span>
                                                            <span
                                                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                                                    payment.status === 'Paid'
                                                                        ? 'bg-emerald-100 text-emerald-800'
                                                                        : 'bg-amber-100 text-amber-800'
                                                                }`}
                                                            >
                                                                {payment.status ?? 'Pending'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-gray-400 italic">
                                                        Standard payment
                                                    </p>
                                                )}
                                            </div>

                                            {/* Price Breakdown */}
                                            <div className="md:text-right space-y-1">
                                                <div className="flex justify-between md:justify-end gap-3 text-gray-500">
                                                    <span>Subtotal:</span>
                                                    <span className="font-medium text-gray-800">
                                                        {formatPrice(order.subtotal)}
                                                    </span>
                                                </div>
                                                {order.discountAmount > 0 && (
                                                    <div className="flex justify-between md:justify-end gap-3 text-emerald-600">
                                                        <span>
                                                            Discount ({order.promoCode ?? 'promo'}):
                                                        </span>
                                                        <span className="font-semibold">
                                                            −{formatPrice(order.discountAmount)}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between md:justify-end gap-3 text-gray-500">
                                                    <span>Delivery Fee:</span>
                                                    <span className="font-medium text-gray-800">
                                                        {order.shipping > 0
                                                            ? formatPrice(order.shipping)
                                                            : 'FREE'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between md:justify-end gap-3 pt-1 border-t border-gray-200 text-sm font-extrabold text-gray-900">
                                                    <span>Total:</span>
                                                    <span className="text-emerald-700 text-base">
                                                        {formatPrice(order.totalAmount)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions Footer */}
                                        <div className="mt-4 pt-3.5 border-t border-gray-200/80 flex flex-wrap items-center justify-between gap-3">
                                            <div className="text-xs text-gray-400">
                                                {isPending && !order.customerCancel?.canCancel && (
                                                    <span className="flex items-center gap-1 text-gray-400">
                                                        <HiOutlineExclamationCircle className="text-amber-500 text-sm" />
                                                        Processing in warehouse · Cannot be cancelled
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2.5 ml-auto">
                                                {order.customerCancel?.canCancel && (
                                                    <Button
                                                        size="xs"
                                                        variant="plain"
                                                        className="!text-rose-600 hover:!bg-rose-50 !rounded-lg px-2.5 font-semibold"
                                                        onClick={() => {
                                                            setCancelOrder(order)
                                                            setCancelReason(CUSTOMER_CANCEL_REASONS[0])
                                                            setCancelError(null)
                                                        }}
                                                    >
                                                        Cancel order
                                                    </Button>
                                                )}

                                                {isCompleted && sessionToken && (
                                                    <Button
                                                        size="xs"
                                                        variant="default"
                                                        className="!rounded-lg !border-emerald-600 !text-emerald-700 hover:!bg-emerald-50 font-semibold"
                                                        onClick={() => {
                                                            setReturnMessage(null)
                                                            setReturnOrder(order)
                                                        }}
                                                    >
                                                        Return items
                                                    </Button>
                                                )}

                                                <Link
                                                    href={MARKETPLACE_PATH}
                                                    className="inline-flex items-center gap-1 rounded-lg bg-gray-100 hover:bg-gray-200/80 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors"
                                                >
                                                    Buy Again &rarr;
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                )}
            </main>

            {/* Cancel Confirmation Dialog */}
            {cancelOrder && (
                <ConfirmDialog
                    isOpen={cancelOrder !== null}
                    type="danger"
                    title="Cancel Sales Order"
                    confirmText={cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                    cancelText="Keep Order"
                    confirmButtonProps={{
                        customColorClass: () =>
                            'bg-rose-600 hover:bg-rose-700 text-white font-semibold',
                    }}
                    onClose={() => {
                        setCancelOrder(null)
                        setCancelError(null)
                    }}
                    onRequestClose={() => {
                        setCancelOrder(null)
                        setCancelError(null)
                    }}
                    onCancel={() => {
                        setCancelOrder(null)
                        setCancelError(null)
                    }}
                    onConfirm={() => void submitCancellation()}
                >
                    <div className="space-y-4 text-sm text-gray-600">
                        <p>
                            Are you sure you want to cancel order{' '}
                            <strong className="text-gray-900 font-mono">
                                #{cancelOrder.orderId}
                            </strong>
                            ? Reserved warehouse items will be returned to available inventory.
                        </p>
                        <FormItem label="Reason for cancellation">
                            <Select
                                value={cancelReasonOptions.find(
                                    (o) => o.value === cancelReason,
                                )}
                                options={cancelReasonOptions}
                                onChange={(option) =>
                                    setCancelReason(option?.value ?? '')
                                }
                            />
                        </FormItem>
                        {cancelError && (
                            <Alert type="danger" showIcon>
                                {cancelError}
                            </Alert>
                        )}
                    </div>
                </ConfirmDialog>
            )}

            {/* Return Request Dialog */}
            {returnOrder && sessionToken && (
                <StorefrontReturnDialog
                    order={returnOrder}
                    token={sessionToken}
                    isOpen={returnOrder !== null}
                    onClose={() => setReturnOrder(null)}
                    onError={(msg) => setError(msg)}
                    onSubmitted={(requestNumber) => {
                        setReturnOrder(null)
                        setReturnMessage(
                            `Return request ${requestNumber} submitted for order ${returnOrder.orderId}.`,
                        )
                        void load()
                    }}
                />
            )}
        </div>
    )
}

export default MarketplaceOrdersPage
