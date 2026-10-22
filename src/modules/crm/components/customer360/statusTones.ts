import type { StatusTone } from '@/components/shared/StatusBadge'
import type { Customer360Shipment } from '../../types'

/** Display mapping only; SD owns the order statuses. */
export const ORDER_STATUS_TONE: Record<string, StatusTone> = {
    DRAFT: 'default',
    CONFIRMED: 'warning',
    SHIPPED: 'info',
    DELIVERED: 'success',
    COMPLETED: 'success',
    CANCELLED: 'danger',
}

/** Display mapping only; SCM owns the shipment statuses. */
export const SHIPMENT_STATUS_TONE: Record<string, StatusTone> = {
    DRAFT: 'default',
    READY: 'info',
    ASSIGNED: 'info',
    DISPATCHED: 'warning',
    IN_TRANSIT: 'warning',
    DELIVERED: 'success',
    EXCEPTION_HOLD: 'danger',
    RETURNED: 'default',
    CANCELLED: 'default',
}

/** Latest activity: delivered, else last update, else creation. */
export const shipmentActivityAt = (s: Customer360Shipment) =>
    new Date(s.deliveredAt ?? s.updatedAt ?? s.createdAt).getTime()
