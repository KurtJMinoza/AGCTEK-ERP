import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'

export function inventoryParentBreadcrumbs(routePath: string): BreadcrumbItem[] {
    const items = buildErpBreadcrumbs(routePath)
    return items.length > 1 ? items.slice(0, -1) : items
}

export const INVENTORY_LEDGER_PATH =
    '/modules/mm/inventory-management/inventory-ledger'

export const INVENTORY_STATUS_PATH =
    '/modules/mm/inventory-management/inventory-status'
