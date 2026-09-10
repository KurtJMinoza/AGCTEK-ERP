import type { NotificationItem } from '@/@types/notification'

type RouteBuilder = (entityId: string) => string

const ENTITY_DETAIL_ROUTES: Record<string, RouteBuilder> = {
    PURCHASE_ORDER: (id) => `/modules/mm/procurement/purchase-orders/${id}`,
    PURCHASE_REQUISITION: (id) => `/modules/mm/procurement/purchase-requisitions/${id}`,
    RFQ: (id) => `/modules/mm/procurement/rfqs/${id}`,
    MATERIAL: (id) => `/modules/mm/material-master/materials-skus/${id}`,
    MM_MATERIAL: (id) => `/modules/mm/material-master/materials-skus/${id}`,
    SUPPLIER: (id) => `/modules/mm/supplier-management/supplier-master/${id}`,
    EXPECTED_RECEIPT: (id) => `/modules/mm/receiving/expected-receipts/${id}`,
    GOODS_RECEIPT: (id) => `/modules/mm/inventory-management/goods-receipt`,
    CUSTOMER_RETURN: (id) => `/modules/mm/returns-disposal/customer-return-intake`,
    SUPPLIER_RETURN: (id) => `/modules/mm/returns-disposal/supplier-returns`,
}

const TARGET_SUFFIX = /_(APPROVAL|CREATED|UPDATED|SUBMITTED|REJECTED|COMPLETED|ASSIGNED|ALERT)$/

function entityTypeFromTarget(target: string): string | null {
    const normalized = target.trim().toUpperCase()
    if (!normalized) return null

    const stripped = normalized.replace(TARGET_SUFFIX, '')
    if (ENTITY_DETAIL_ROUTES[stripped]) {
        return stripped
    }

    for (const key of Object.keys(ENTITY_DETAIL_ROUTES)) {
        if (normalized.includes(key)) {
            return key
        }
    }

    return null
}

function isAppPath(value: string) {
    return value.startsWith('/modules/') || value.startsWith('/activity-log')
}

/**
 * Resolve a notification click target to an in-app route.
 * Prefers `location` when it is already an app path; otherwise maps
 * `target` + `locationLabel` (entity id) to MM detail routes.
 */
export function resolveNotificationHref(item: NotificationItem): string | null {
    const entityId = item.locationLabel?.trim()
    const location = item.location?.trim()

    if (location && isAppPath(location)) {
        if (entityId && !location.includes(entityId)) {
            const segments = location.split('/').filter(Boolean)
            const last = segments[segments.length - 1]
            const looksLikeDetailId = /^[a-z0-9-]{8,}$/i.test(last)
            if (!looksLikeDetailId) {
                return `${location.replace(/\/$/, '')}/${entityId}`
            }
        }
        return location
    }

    if (!entityId) {
        return null
    }

    const entityType = entityTypeFromTarget(item.target)
    if (entityType && ENTITY_DETAIL_ROUTES[entityType]) {
        return ENTITY_DETAIL_ROUTES[entityType](entityId)
    }

    return null
}

export function notificationIsNavigable(item: NotificationItem): boolean {
    return resolveNotificationHref(item) !== null
}
