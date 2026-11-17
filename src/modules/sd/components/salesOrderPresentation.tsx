'use client'

import {
    HiOutlineDesktopComputer,
    HiOutlineGlobeAlt,
} from 'react-icons/hi'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import type {
    SalesOrderChannel,
    SalesOrderRecord,
} from '../services/salesOrderDashboardService'

export const formatOrderPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
    }).format(value)

export const formatOrderDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
    })

export const orderItemCount = (order: SalesOrderRecord) =>
    order.lines.reduce((sum, line) => sum + line.quantity, 0)

const ORDER_STATUS_TONE: Record<SalesOrderRecord['status'], StatusTone> = {
    Completed: 'success',
    Delivered: 'success',
    Dispatched: 'info',
    'Pending Delivery': 'warning',
    Draft: 'default',
    Cancelled: 'danger',
}

export const SalesOrderChannelBadge = ({
    channel,
}: {
    channel: SalesOrderChannel
}) => {
    if (channel === 'POS') {
        return (
            <StatusBadge
                tone="warning"
                className="whitespace-nowrap"
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
                className="whitespace-nowrap"
                prefix={<HiOutlineGlobeAlt className="mr-1" />}
            >
                E-commerce
            </StatusBadge>
        )
    }
    return <StatusBadge className="whitespace-nowrap">Standard</StatusBadge>
}

export const SalesOrderStatusBadge = ({
    status,
}: {
    status: SalesOrderRecord['status']
}) => (
    <StatusBadge tone={ORDER_STATUS_TONE[status]} className="whitespace-nowrap">
        {status}
    </StatusBadge>
)
