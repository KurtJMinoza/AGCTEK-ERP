import type { StatusTone } from '@/components/shared/StatusBadge'

const toneMap: Record<string, StatusTone> = {
    AVAILABLE: 'success',
    READY: 'success',
    COMPLETED: 'success',
    DELIVERED: 'success',
    IN_TRANSIT: 'info',
    ON_TRIP: 'info',
    IN_PROGRESS: 'info',
    PLANNED: 'info',
    ASSIGNED: 'info',
    ARRIVED: 'info',
    DRAFT: 'default',
    PENDING: 'default',
    SCHEDULED: 'default',
    OFF_DUTY: 'default',
    INACTIVE: 'default',
    MAINTENANCE: 'warning',
    OUT_OF_SERVICE: 'warning',
    CANCELLED: 'danger',
    FAILED: 'danger',
    SKIPPED: 'warning',
}

export function statusTone(status: string): StatusTone {
    return toneMap[status] ?? 'default'
}

export function formatStatusLabel(status: string) {
    return status
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}
