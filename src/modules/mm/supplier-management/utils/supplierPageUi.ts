import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'

export function supplierParentBreadcrumbs(routePath: string): BreadcrumbItem[] {
    const items = buildErpBreadcrumbs(routePath)
    return items.length > 1 ? items.slice(0, -1) : items
}

export const supplierRefCrudTableDefaults = {
    animatedTable: true as const,
    integrateBreadcrumbs: true as const,
    tableMinWidthClass: 'min-w-[720px]',
}
