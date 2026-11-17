import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'

export const WAREHOUSE_STORAGE_BINS_PATH =
    '/modules/mm/warehouse-management/storage-bins'

export function warehouseParentBreadcrumbs(routePath: string): BreadcrumbItem[] {
    const items = buildErpBreadcrumbs(routePath)
    return items.length > 1 ? items.slice(0, -1) : items
}

export function warehouseStorageStatusTone(
    status: string,
): 'success' | 'warning' | 'default' {
    if (status === 'ACTIVE') return 'success'
    if (status === 'INACTIVE') return 'warning'
    return 'default'
}

export function warehouseLifecycleStatusTone(
    status: string,
): 'success' | 'warning' | 'default' | 'danger' {
    if (status === 'ACTIVE') return 'success'
    if (status === 'INACTIVE') return 'warning'
    if (status === 'BLOCKED') return 'danger'
    return 'default'
}
