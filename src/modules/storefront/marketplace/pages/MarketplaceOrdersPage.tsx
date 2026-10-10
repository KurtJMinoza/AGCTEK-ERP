'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HiOutlineClipboardList, HiOutlineRefresh } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import Tabs from '@/components/ui/Tabs'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import {
    CUSTOMER_CANCEL_REASONS,
    PAYMENT_METHOD_LABEL,
    cancelCustomerOrder,
    getSalesOrders,
    type SalesOrderRecord,
} from '@/modules/sd/services/salesOrderDashboardService'
import { useMarketplaceProducts } from '@/modules/sd/hooks/useMarketplaceProducts'
import StorefrontReturnDialog from '@/modules/storefront/shared/components/StorefrontReturnDialog'
import { useMarketplace } from '../MarketplaceProvider'
import {
    MARKETPLACE_ORDERS_PATH,
    MARKETPLACE_PATH,
    MARKETPLACE_SIGN_IN_PATH,
    marketplaceAuthHref,
} from '../host'
import { formatPrice } from '../marketplaceUi'

const { TabList, TabNav } = Tabs

const STATUS_COPY: Record<
    SalesOrderRecord['status'],
    { label: string; tone: StatusTone }
> = {
    'Pending Delivery': { label: 'To be delivered', tone: 'warning' },
    Dispatched: { label: 'Dispatched', tone: 'info' },
    Delivered: { label: 'Delivered', tone: 'success' },
    Completed: { label: 'Completed', tone: 'success' },
    Cancelled: { label: 'Cancelled', tone: 'danger' },
    Draft: { label: 'Processing', tone: 'default' },
}

const PAYMENT_TONE: Record<string, StatusTone> = {
    Paid: 'success',
    Authorized: 'success',
    'Pending Collection': 'warning',
    'Pending Verification': 'warning',
    Pending: 'warning',
    Failed: 'danger',
    Cancelled: 'danger',
    Refunded: 'default',
}

const paymentLabel = (method: string | null) =>
    method && method in PAYMENT_METHOD_LABEL
        ? PAYMENT_METHOD_LABEL[method as keyof typeof PAYMENT_METHOD_LABEL]
        : (method ?? '—')

const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(iso))

type OrdersFilter =
    | 'all'
    | 'Pending Delivery'
    | 'Dispatched'
    | 'Delivered'
    | 'Completed'
    | 'Cancelled'

const FILTER_LABEL: Record<OrdersFilter, string> = {
    all: 'All orders',
    'Pending Delivery': 'To be delivered',
    Dispatched: 'Dispatched',
    Delivered: 'Delivered',
    Completed: 'Completed',
    Cancelled: 'Cancelled',
}

const FILTERS: OrdersFilter[] = [
    'all',
    'Pending Delivery',
    'Dispatched',
    'Delivered',
    'Completed',
    'Cancelled',
]

const productLookupKey = (divisionId: string | null, sku: string) =>
    `${divisionId ?? '?'}:${sku}`

const SummaryStat = ({
    label,
    value,
    hint,
}: {
    label: string
    value: string
    hint?: string
}) => (
    <Card>
        <div className="px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {label}
            </div>
            <div className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">
                {value}
            </div>
            {hint ? (
                <div className="mt-0.5 text-xs text-gray-500">{hint}</div>
            ) : null}
        </div>
    </Card>
)

/**
 * Storefront "My orders": a clean e-commerce order history. Every order card
 * shows its status, payment state and delivery address; each line item is a
 * product row with its snapshot image (falling back to the live catalog, then
 * a placeholder) — no admin-style table, no nested bordered boxes.
 */
const MarketplaceOrdersPage = () => {
    const { signedInClient, sessionToken } = useMarketplace()
    const catalog = useMarketplaceProducts()
    const customerId = signedInClient?.customerId ?? null
    const [orders, setOrders] = useState<SalesOrderRecord[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<OrdersFilter>('all')
    const [returnOrder, setReturnOrder] = useState<SalesOrderRecord | null>(
        null,
    )
    const [returnMessage, setReturnMessage] = useState<string | null>(null)
    const [cancelOrder, setCancelOrder] = useState<SalesOrderRecord | null>(
        null,
    )
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
            setOrders(await getSalesOrders({ customerId }))
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unable to load your orders',
            )
        } finally {
            setLoading(false)
        }
    }, [customerId])

    useEffect(() => {
        if (customerId) void load()
    }, [customerId, load])

    /** Submits the customer cancellation; reloads the list on success. */
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
        setReturnMessage(null)
    }, [customerId])

    const summary = useMemo(() => {
        const rows = orders ?? []
        return {
            total: rows.length,
            pending: rows.filter((o) => o.status === 'Pending Delivery').length,
            dispatched: rows.filter((o) => o.status === 'Dispatched').length,
            delivered: rows.filter((o) => o.status === 'Delivered').length,
            completed: rows.filter((o) => o.status === 'Completed').length,
            spent: rows
                .filter((o) => o.status !== 'Cancelled')
                .reduce((sum, o) => sum + o.totalAmount, 0),
        }
    }, [orders])

    const visibleOrders = useMemo(
        () =>
            filter === 'all'
                ? (orders ?? [])
                : (orders ?? []).filter((order) => order.status === filter),
        [orders, filter],
    )

    const countFor = (value: OrdersFilter) =>
        value === 'all'
            ? summary.total
            : value === 'Pending Delivery'
              ? summary.pending
              : value === 'Dispatched'
                ? summary.dispatched
                : value === 'Delivered'
                  ? summary.delivered
                  : value === 'Completed'
                    ? summary.completed
                    : summary.total -
                      summary.pending -
                      summary.dispatched -
                      summary.delivered -
                      summary.completed

    if (!signedInClient) {
        return (
            <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
                <HiOutlineClipboardList
                    className="text-5xl text-gray-300"
                    aria-hidden
                />
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                    Your orders, one page
                </h1>
                <p className="text-sm text-gray-500">
                    Sign in to review your order contents, payment method and
                    delivery status.
                </p>
                <Button
                    customColorClass={() =>
                        'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }
                >
                    <Link
                        href={marketplaceAuthHref(
                            MARKETPLACE_SIGN_IN_PATH,
                            MARKETPLACE_ORDERS_PATH,
                        )}
                    >
                        Sign in to view orders
                    </Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="text-xs text-gray-400">
                        <Link
                            href={MARKETPLACE_PATH}
                            className="hover:text-gray-600"
                        >
                            AGC Marketplace
                        </Link>{' '}
                        / Orders
                    </div>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                        My Orders
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {signedInClient.fullName ?? signedInClient.email}
                    </p>
                </div>
                <Button size="sm" loading={loading} onClick={() => void load()}>
                    Refresh
                </Button>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryStat label="Orders" value={String(summary.total)} />
                <SummaryStat
                    label="To be delivered"
                    value={String(summary.pending)}
                    hint="Confirmed and reserved"
                />
                <SummaryStat
                    label="Delivered"
                    value={String(summary.delivered)}
                />
                <SummaryStat
                    label="Total spent"
                    value={formatPrice(summary.spent)}
                    hint="Excludes cancelled"
                />
            </div>

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    <div className="flex items-center justify-between gap-2">
                        <span>{error}</span>
                        <Button size="xs" onClick={() => void load()}>
                            Retry
                        </Button>
                    </div>
                </Alert>
            ) : null}

            {returnMessage ? (
                <Alert showIcon type="success" className="mb-4">
                    {returnMessage}
                </Alert>
            ) : null}

            <Tabs
                value={filter}
                onChange={(value) => setFilter(value as OrdersFilter)}
            >
                <TabList>
                    {FILTERS.map((value) => (
                        <TabNav
                            key={value}
                            value={value}
                            className="shrink-0 whitespace-nowrap"
                        >
                            {FILTER_LABEL[value]} ({countFor(value)})
                        </TabNav>
                    ))}
                </TabList>
            </Tabs>

            {loading && !orders ? (
                <div className="flex h-48 items-center justify-center">
                    <Spinner size={32} />
                </div>
            ) : visibleOrders.length === 0 ? (
                <Card bodyClass="flex flex-col items-center gap-2 p-10 text-center text-gray-500">
                    <HiOutlineClipboardList className="text-4xl" aria-hidden />
                    <p>No {FILTER_LABEL[filter].toLowerCase()} yet.</p>
                    <Link
                        href={MARKETPLACE_PATH}
                        className="mt-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                        Start shopping
                    </Link>
                </Card>
            ) : (
                <ul className="mt-4 flex flex-col gap-4">
                    {visibleOrders.map((order) => {
                        const status = STATUS_COPY[order.status]
                        const payment = order.payment
                        const ship = order.shippingAddress
                        return (
                            <li key={order.id}>
                                <Card bodyClass="p-4 sm:p-6">
                                    {/* Order header */}
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {order.orderId}
                                            </div>
                                            <div className="mt-0.5 text-xs text-gray-500">
                                                Placed{' '}
                                                {formatDate(order.createdAt)}
                                            </div>
                                            <div className="mt-1.5 text-xs text-gray-500">
                                                Sold by{' '}
                                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                                    {order.company?.name ?? '—'}
                                                </span>
                                            </div>
                                        </div>
                                        <StatusBadge tone={status.tone}>
                                            {status.label}
                                        </StatusBadge>
                                    </div>

                                    {/* Product rows — no inner boxes */}
                                    <ul className="mt-4">
                                        {order.lines.map((line, index) => {
                                            const product = productsByKey.get(
                                                productLookupKey(
                                                    line.divisionId,
                                                    line.sku === '—'
                                                        ? ''
                                                        : line.sku,
                                                ),
                                            )
                                            const image =
                                                line.productImage ??
                                                product?.imageUrl
                                            return (
                                                <li
                                                    key={line.lineId}
                                                    className={`flex items-center gap-3 py-2.5 ${
                                                        index > 0
                                                            ? 'border-t border-gray-50 dark:border-gray-800'
                                                            : ''
                                                    }`}
                                                >
                                                    {image ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={image}
                                                            alt={
                                                                line.productName ??
                                                                line.name
                                                            }
                                                            className="h-14 w-14 shrink-0 rounded-lg bg-gray-50 object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-300 dark:bg-gray-800">
                                                            <HiOutlineClipboardList
                                                                className="text-2xl"
                                                                aria-hidden
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                                            {line.productName ??
                                                                line.name}
                                                        </div>
                                                        {line.variantName &&
                                                        line.variantName
                                                            .trim()
                                                            .toLowerCase() !==
                                                            (
                                                                line.productName ??
                                                                line.name
                                                            )
                                                                .trim()
                                                                .toLowerCase() ? (
                                                            <div className="text-xs text-gray-500">
                                                                {
                                                                    line.variantName
                                                                }
                                                            </div>
                                                        ) : null}
                                                        <div className="mt-0.5 font-mono text-xs text-gray-400">
                                                            {line.sku} ·{' '}
                                                            {line.quantity} ×{' '}
                                                            {formatPrice(
                                                                line.unitPrice,
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                        {formatPrice(
                                                            line.lineTotal,
                                                        )}
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>

                                    {/* Order footer: payment, delivery, total */}
                                    <div className="mt-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                        <div className="text-xs text-gray-500">
                                            {payment ? (
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span>
                                                        Payment:{' '}
                                                        <span className="font-medium text-gray-900 dark:text-gray-100">
                                                            {paymentLabel(
                                                                payment.method,
                                                            )}
                                                        </span>
                                                    </span>
                                                    {payment.isDemo ? (
                                                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:bg-gray-800">
                                                            Demo
                                                        </span>
                                                    ) : null}
                                                    <span>Status:</span>
                                                    <StatusBadge
                                                        tone={
                                                            PAYMENT_TONE[
                                                                payment.status ??
                                                                    ''
                                                            ] ?? 'default'
                                                        }
                                                    >
                                                        {payment.status ?? '—'}
                                                    </StatusBadge>
                                                </div>
                                            ) : null}
                                            {ship ? (
                                                <div className="mt-1.5">
                                                    <span>Deliver to</span>
                                                    <span className="mt-0.5 block font-medium text-gray-900 dark:text-gray-100">
                                                        {ship.name}
                                                    </span>
                                                    <span className="block">
                                                        {[
                                                            ship.line1,
                                                            ship.city,
                                                            ship.region,
                                                            ship.postalCode,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(', ')}
                                                        {ship.phone
                                                            ? ` · ${ship.phone}`
                                                            : ''}
                                                    </span>
                                                </div>
                                            ) : null}
                                        </div>
                                        <div className="flex shrink-0 items-baseline justify-between gap-3 sm:flex-col sm:items-end sm:gap-0">
                                            <div className="text-xs text-gray-500">
                                                Subtotal{' '}
                                                {formatPrice(order.subtotal)}
                                            </div>
                                            {order.discountAmount > 0 ? (
                                                <div className="text-xs text-emerald-600 dark:text-emerald-400">
                                                    Discount (
                                                    {order.promoCode ?? 'promo'}
                                                    ) −
                                                    {formatPrice(
                                                        order.discountAmount,
                                                    )}
                                                </div>
                                            ) : null}
                                            {order.shipping > 0 ? (
                                                <div className="text-xs text-gray-500">
                                                    Delivery{' '}
                                                    {formatPrice(
                                                        order.shipping,
                                                    )}
                                                </div>
                                            ) : null}
                                            <div className="border-t border-gray-100 pt-1 text-base font-bold text-gray-900 dark:border-gray-700 dark:text-gray-100">
                                                {formatPrice(order.totalAmount)}
                                            </div>
                                        </div>
                                    </div>

                                    {order.customerCancel?.canCancel ? (
                                        <div className="mt-3 flex items-center justify-end border-t border-gray-100 pt-3 dark:border-gray-700">
                                            <Button
                                                size="xs"
                                                variant="plain"
                                                className="!px-0 !text-red-600 hover:underline dark:!text-red-400"
                                                onClick={() => {
                                                    setCancelOrder(order)
                                                    setCancelReason(
                                                        CUSTOMER_CANCEL_REASONS[0],
                                                    )
                                                    setCancelError(null)
                                                }}
                                            >
                                                Cancel order
                                            </Button>
                                        </div>
                                    ) : order.status === 'Pending Delivery' ? (
                                        <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-400 dark:border-gray-700">
                                            This order can no longer be
                                            cancelled because it is already
                                            being processed.
                                        </div>
                                    ) : null}

                                    {order.status === 'Completed' &&
                                    sessionToken ? (
                                        <div className="mt-3 flex items-center justify-end">
                                            <Button
                                                size="xs"
                                                variant="plain"
                                                className="!px-0 !text-emerald-700 dark:!text-emerald-400"
                                                onClick={() => {
                                                    setReturnMessage(null)
                                                    setReturnOrder(order)
                                                }}
                                            >
                                                Return items
                                            </Button>
                                        </div>
                                    ) : null}
                                </Card>
                            </li>
                        )
                    })}
                </ul>
            )}

            {cancelOrder ? (
                <ConfirmDialog
                    isOpen={cancelOrder !== null}
                    type="warning"
                    title="Are you sure you want to cancel this order?"
                    confirmText={cancelling ? 'Cancelling…' : 'Cancel order'}
                    cancelText="Keep order"
                    confirmButtonProps={{
                        customColorClass: () =>
                            'bg-red-500 hover:bg-red-600 text-white',
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
                    <div className="flex flex-col gap-3 text-sm">
                        <p>
                            {cancelOrder.orderId} will be cancelled and its
                            reserved stock released back for other buyers. This
                            cannot be undone from the storefront.
                        </p>
                        {cancelError ? (
                            <Alert showIcon type="danger">
                                {cancelError}
                            </Alert>
                        ) : null}
                        <FormItem label="Reason (optional)">
                            <Select
                                isSearchable={false}
                                options={cancelReasonOptions}
                                value={
                                    cancelReasonOptions.find(
                                        (option) =>
                                            option.value === cancelReason,
                                    ) ?? null
                                }
                                onChange={(option) =>
                                    setCancelReason(
                                        option?.value ??
                                            CUSTOMER_CANCEL_REASONS[0],
                                    )
                                }
                            />
                        </FormItem>
                    </div>
                </ConfirmDialog>
            ) : null}

            {returnOrder ? (
                <StorefrontReturnDialog
                    isOpen={returnOrder !== null}
                    order={returnOrder}
                    token={sessionToken ?? ''}
                    onClose={() => setReturnOrder(null)}
                    onSubmitted={(requestNumber) => {
                        setReturnOrder(null)
                        setReturnMessage(
                            `Return request ${requestNumber} submitted — it will be reviewed before processing.`,
                        )
                        void load()
                    }}
                    onError={() => setReturnMessage(null)}
                />
            ) : null}
        </div>
    )
}

export default MarketplaceOrdersPage
