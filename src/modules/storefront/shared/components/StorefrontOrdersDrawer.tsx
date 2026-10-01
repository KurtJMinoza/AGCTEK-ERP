'use client'

import { useCallback, useEffect, useState } from 'react'
import { HiOutlineClipboardList } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Drawer from '@/components/ui/Drawer'
import Spinner from '@/components/ui/Spinner'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import {
    getSalesOrders,
    type SalesOrderRecord,
} from '@/modules/sd/services/salesOrderDashboardService'

const STATUS_COPY: Record<SalesOrderRecord['status'], { label: string; tone: StatusTone }> = {
    'Pending Delivery': { label: 'To be delivered', tone: 'warning' },
    Completed: { label: 'Delivered', tone: 'success' },
    Cancelled: { label: 'Cancelled', tone: 'danger' },
    Draft: { label: 'Processing', tone: 'default' },
}

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)

const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(iso),
    )

export type StorefrontOrdersDrawerProps = {
    isOpen: boolean
    onClose: () => void
    /** Signed-in storefront client; orders are fetched only for this customer. */
    customerId: string | null
    divisionId: string
    isMobile: boolean
    /** Tailwind text colour for totals, e.g. `text-orange-500`. */
    accentTextClass: string
}

const StorefrontOrdersDrawer = ({
    isOpen,
    onClose,
    customerId,
    divisionId,
    isMobile,
    accentTextClass,
}: StorefrontOrdersDrawerProps) => {
    const [orders, setOrders] = useState<SalesOrderRecord[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!customerId) return
        setLoading(true)
        setError(null)
        try {
            setOrders(await getSalesOrders({ customerId, divisionId }))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load your orders')
        } finally {
            setLoading(false)
        }
    }, [customerId, divisionId])

    useEffect(() => {
        if (isOpen) void load()
    }, [isOpen, load])

    useEffect(() => {
        setOrders(null)
    }, [customerId])

    return (
        <Drawer
            title="My orders"
            isOpen={isOpen}
            placement={isMobile ? 'bottom' : 'right'}
            width={440}
            height="85dvh"
            className={isMobile ? '[&_.drawer-content]:rounded-t-2xl' : undefined}
            onClose={onClose}
            onRequestClose={onClose}
        >
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

            {loading && !orders ? (
                <div className="flex h-full items-center justify-center">
                    <Spinner size={32} />
                </div>
            ) : orders && orders.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-500">
                    <HiOutlineClipboardList className="text-4xl" aria-hidden />
                    <p>You have no orders yet.</p>
                </div>
            ) : (
                <ul className="flex flex-col gap-3">
                    {orders?.map((order) => {
                        const status = STATUS_COPY[order.status]
                        return (
                            <li key={order.id}>
                                <Card bodyClass="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-mono text-sm font-semibold heading-text">
                                                {order.orderId}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                {formatDate(order.createdAt)}
                                            </div>
                                        </div>
                                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                                    </div>
                                    <ul className="mt-3 flex flex-col gap-1.5 border-t border-gray-100 pt-3 text-sm dark:border-gray-700">
                                        {order.lines.map((line) => (
                                            <li
                                                key={`${order.id}-${line.sku}`}
                                                className="flex justify-between gap-3"
                                            >
                                                <span className="min-w-0">
                                                    <span className="font-semibold">{line.quantity} ×</span>{' '}
                                                    {line.name}
                                                </span>
                                                <span className="whitespace-nowrap">
                                                    {formatPrice(line.lineTotal)}
                                                </span>
                                            </li>
                                        ))}
                                        {order.shipping > 0 ? (
                                            <li className="flex justify-between gap-3 text-gray-500 dark:text-gray-400">
                                                <span>Delivery</span>
                                                <span>{formatPrice(order.shipping)}</span>
                                            </li>
                                        ) : null}
                                        {order.discountAmount > 0 ? (
                                            <li className="flex justify-between gap-3 text-gray-500 dark:text-gray-400">
                                                <span>Discount{order.promoCode ? ` (${order.promoCode})` : ''}</span>
                                                <span>−{formatPrice(order.discountAmount)}</span>
                                            </li>
                                        ) : null}
                                    </ul>
                                    <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 font-bold dark:border-gray-700">
                                        <span>{order.status === 'Completed' ? 'Total paid' : 'Total'}</span>
                                        <span className={accentTextClass}>
                                            {formatPrice(order.totalAmount)}
                                        </span>
                                    </div>
                                </Card>
                            </li>
                        )
                    })}
                </ul>
            )}
        </Drawer>
    )
}

export default StorefrontOrdersDrawer
